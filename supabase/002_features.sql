-- =====================================================================
-- Juntly — 002: reconhecimento facial, viagem de demonstração,
-- notificações push e relatório. Rode depois do schema.sql.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------
-- Fotos: destaque para o relatório e controle do processamento de rostos
-- ---------------------------------------------------------------------
alter table photos add column if not exists faces_processed boolean not null default false;
alter table photos add column if not exists featured boolean not null default false;

-- Marcações: manual (equipe) ou automática (rosto), e ocultas
-- (a equipe removeu um acerto errado, ou o participante pediu para tirar)
alter table photo_tags add column if not exists source text not null default 'manual';
alter table photo_tags add column if not exists distance real;
alter table photo_tags add column if not exists hidden boolean not null default false;
do $$ begin
  alter table photo_tags add constraint photo_tags_source_chk check (source in ('manual','auto'));
exception when duplicate_object then null; end $$;

-- Rostos encontrados em cada foto (vetor de 128 números, não a imagem)
create table if not exists photo_faces (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references photos(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  descriptor extensions.vector(128) not null,
  box jsonb
);
create index if not exists photo_faces_trip_idx on photo_faces(trip_id);

-- Selfie de referência do participante (só o vetor; a selfie não é guardada)
create table if not exists participant_faces (
  participant_id uuid primary key references participants(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  descriptor extensions.vector(128) not null,
  created_at timestamptz not null default now()
);

alter table photo_faces enable row level security;
alter table participant_faces enable row level security;

create policy photo_faces_staff on photo_faces for all using (is_trip_staff(trip_id)) with check (
  is_trip_staff(trip_id) and exists (select 1 from photos ph where ph.id = photo_id and ph.trip_id = photo_faces.trip_id)
);

create policy participant_faces_self on participant_faces for all using (
  exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from participants p
           where p.id = participant_id and p.user_id = auth.uid()
             and p.trip_id = participant_faces.trip_id and p.photo_consent)
);
create policy participant_faces_staff_delete on participant_faces for delete using (is_trip_staff(trip_id));

-- Distância máxima entre dois rostos para considerar a mesma pessoa.
-- Mais baixo = menos acertos errados (e mais fotos perdidas).
create or replace function face_match_threshold() returns real
language sql immutable as $$ select 0.5::real $$;

-- Foto nova: procura entre as selfies dos participantes que autorizaram
create or replace function match_photo_face() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into photo_tags (photo_id, participant_id, source, distance)
  select new.photo_id, pf.participant_id, 'auto', (pf.descriptor <-> new.descriptor)
    from participant_faces pf
    join participants p on p.id = pf.participant_id
   where pf.trip_id = new.trip_id and p.photo_consent
     and (pf.descriptor <-> new.descriptor) < face_match_threshold()
  on conflict (photo_id, participant_id) do nothing;
  return new;
end $$;
drop trigger if exists photo_faces_match on photo_faces;
create trigger photo_faces_match after insert on photo_faces
  for each row execute function match_photo_face();

-- Selfie nova ou trocada: refaz as marcações automáticas dessa pessoa
create or replace function match_participant_face() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from photo_tags where participant_id = new.participant_id and source = 'auto' and not hidden;
  insert into photo_tags (photo_id, participant_id, source, distance)
  select f.photo_id, new.participant_id, 'auto', min(f.descriptor <-> new.descriptor)
    from photo_faces f
   where f.trip_id = new.trip_id
     and (f.descriptor <-> new.descriptor) < face_match_threshold()
   group by f.photo_id
  on conflict (photo_id, participant_id) do nothing;
  return new;
end $$;
drop trigger if exists participant_faces_match on participant_faces;
create trigger participant_faces_match after insert or update on participant_faces
  for each row execute function match_participant_face();

-- Selfie apagada: tira as marcações automáticas
create or replace function unmatch_participant_face() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from photo_tags where participant_id = old.participant_id and source = 'auto';
  return old;
end $$;
drop trigger if exists participant_faces_unmatch on participant_faces;
create trigger participant_faces_unmatch after delete on participant_faces
  for each row execute function unmatch_participant_face();

-- Autorização de imagem retirada: apaga a selfie e as marcações automáticas
create or replace function consent_revoked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.photo_consent and not new.photo_consent then
    delete from participant_faces where participant_id = new.id;
    delete from photo_tags where participant_id = new.id and source = 'auto';
  end if;
  return new;
end $$;
drop trigger if exists participants_consent on participants;
create trigger participants_consent after update of photo_consent on participants
  for each row execute function consent_revoked();

-- O participante vê só as marcações visíveis e pode ocultar as suas
drop policy if exists tags_read on photo_tags;
create policy tags_read on photo_tags for select using (
  not hidden and exists (select 1 from photos ph where ph.id = photo_id and is_trip_participant(ph.trip_id))
);
create policy tags_self_read on photo_tags for select using (
  exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
);
create policy tags_self_hide on photo_tags for update using (
  exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
);

create or replace function guard_tag_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon')
     and not exists (select 1 from photos ph where ph.id = old.photo_id and is_trip_staff(ph.trip_id)) then
    if new.photo_id <> old.photo_id or new.participant_id <> old.participant_id
       or new.source <> old.source or new.distance is distinct from old.distance then
      raise exception 'Você só pode ocultar a foto';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists photo_tags_guard on photo_tags;
create trigger photo_tags_guard before update on photo_tags
  for each row execute function guard_tag_update();

-- ---------------------------------------------------------------------
-- Notificações push
-- ---------------------------------------------------------------------
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_participant_idx on push_subscriptions(participant_id);
alter table push_subscriptions enable row level security;
create policy push_self on push_subscriptions for all using (
  exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
);

-- Chaves do push ficam no Vault do Supabase (nunca no código):
--   push_vapid_public, push_vapid_private, push_webhook_secret, push_function_url
create or replace function push_config()
returns table (vapid_public text, vapid_private text, webhook_secret text)
language sql stable security definer set search_path = public, vault as $$
  select (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_public'),
         (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_private'),
         (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret')
$$;
revoke execute on function push_config() from public, anon, authenticated;
grant execute on function push_config() to service_role;

-- Aviso novo → chama a função que envia o push (assíncrono, não atrasa o aviso)
create extension if not exists pg_net with schema extensions;
create or replace function notify_announcement() returns trigger
language plpgsql security definer set search_path = public, vault, extensions as $$
declare fn_url text; secret text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if fn_url is not null and secret is not null then
    perform net.http_post(
      url := fn_url,
      body := jsonb_build_object('announcement_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-juntly-secret', secret)
    );
  end if;
  return new;
end $$;
drop trigger if exists announcements_push on announcements;
create trigger announcements_push after insert on announcements
  for each row execute function notify_announcement();

-- ---------------------------------------------------------------------
-- Viagem de demonstração (dados fictícios, datas em torno de hoje)
-- ---------------------------------------------------------------------
create or replace function create_demo_trip(a uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t uuid; d0 date := current_date - 1; cp1 uuid; cp2 uuid; cp3 uuid;
  names text[] := array[
    'Ana Paula Ribeiro','Bruno Carvalho','Camila Duarte','Daniel Moreira','Eduarda Lima','Felipe Antunes',
    'Gabriela Rocha','Henrique Batista','Isabela Martins','João Pedro Alves','Larissa Fonseca','Lucas Mendes',
    'Mariana Teixeira','Mateus Correia','Natália Freitas','Otávio Nogueira','Patrícia Gomes','Rafael Siqueira',
    'Renata Barros','Rodrigo Pacheco','Sabrina Cardoso','Thiago Ramos','Vanessa Prado','Vinícius Araújo',
    'Beatriz Monteiro','Carlos Eduardo Dias','Débora Azevedo','Eduardo Peixoto','Fernanda Lopes','Gustavo Rezende',
    'Helena Castro','Igor Vasconcelos','Juliana Pires','Leonardo Farias','Marcela Brito','Nicolas Tavares',
    'Paula Cristina Melo','Ricardo Sampaio','Sílvia Andrade','Wagner Coelho'];
  i int;
begin
  if not is_agency_member(a) then raise exception 'Sem permissão'; end if;

  insert into trips (agency_id, name, destination, start_date, end_date, emergency_phone, guide)
  values (a, 'Missão Empresarial Orlando (demonstração)', 'Orlando, FL', d0, d0 + 3, '+1 407 555 0100',
'O QUE LEVAR
- Passaporte e visto americano
- Roupas leves e um casaco para o ar-condicionado
- Protetor solar, boné e garrafa de água
- Capa de chuva (chuvas rápidas à tarde são comuns)

CLIMA E FUSO
- Máximas de 27 °C a 30 °C, chuva rápida no fim da tarde
- Fuso: Eastern Time (1 hora a menos que Brasília no verão americano, 2 horas no inverno)

DINHEIRO
- Moeda: dólar americano (US$)
- Cartões são aceitos em quase todo lugar
- Gorjeta em restaurantes: 18% a 20%

REGRAS DO GRUPO
- Chegue 10 minutos antes de cada saída
- Mantenha o app com notificações ligadas
- Em caso de dúvida, fale com o coordenador

FRASES ÚTEIS
- "Where is the restroom?" — Onde fica o banheiro?
- "How much is this?" — Quanto custa?
- "I need help." — Preciso de ajuda.')
  returning id into t;

  for i in 1 .. array_length(names, 1) loop
    insert into participants (trip_id, name, email, phone, group_label, room, photo_consent, joined_at, lang)
    values (t, names[i],
            'participante' || i || '@exemplo.com',
            '+55 11 9' || lpad((8000 + i * 37)::text, 4, '0') || '-' || lpad((1000 + i * 53)::text, 4, '0'),
            case when i <= 20 then 'Ônibus 1' else 'Ônibus 2' end,
            (1200 + ((i + 1) / 2))::text,
            i % 9 <> 0,
            case when i % 7 <> 0 then now() - ((i % 5) || ' days')::interval else null end,
            'pt');
  end loop;

  insert into agenda_items (trip_id, day, start_time, end_time, title, location, address, bring, notes, group_label) values
    (t, d0,     '14:00', '15:30', 'Chegada e transfer para o hotel', 'Aeroporto MCO, saída B', 'Orlando International Airport, Orlando, FL', 'Passaporte e malas', 'Procure a placa com o logo da agência.', null),
    (t, d0,     '16:00', null,    'Check-in no hotel', 'Lobby do hotel', null, null, 'A chave do quarto está no envelope com o seu nome.', null),
    (t, d0,     '19:30', '22:00', 'Jantar de boas-vindas', 'Restaurante do hotel', null, 'Traje esporte fino', null, null),
    (t, d0 + 1, '07:30', null,    'Café da manhã', 'Restaurante do hotel', null, null, null, null),
    (t, d0 + 1, '08:30', '12:00', 'Visita técnica: centro de inovação', 'Lake Nona Medical City', 'Lake Nona, Orlando, FL', 'Crachá e cartões de visita', 'Apresentação de cases de saúde digital.', null),
    (t, d0 + 1, '12:30', '14:00', 'Almoço de networking', 'Lake Nona Town Center', 'Lake Nona Town Center, Orlando, FL', null, null, null),
    (t, d0 + 1, '15:00', '18:00', 'Rodada de negócios', 'Centro de convenções', 'Orange County Convention Center, Orlando, FL', 'Cartões de visita', null, null),
    (t, d0 + 1, '20:00', null,    'Noite livre em Disney Springs', 'Disney Springs', 'Disney Springs, Lake Buena Vista, FL', null, 'Ônibus de volta às 23h.', 'Ônibus 1'),
    (t, d0 + 1, '20:00', null,    'Jantar no ICON Park', 'ICON Park', 'ICON Park, International Dr, Orlando, FL', null, 'Ônibus de volta às 23h.', 'Ônibus 2'),
    (t, d0 + 2, '07:00', null,    'Saída para o Kennedy Space Center', 'Lobby do hotel', null, 'Ingresso, protetor solar e boné', 'Viagem de cerca de 1 hora.', null),
    (t, d0 + 2, '08:30', '15:00', 'Kennedy Space Center', 'Kennedy Space Center', 'Kennedy Space Center Visitor Complex, FL', 'Garrafa de água', null, null),
    (t, d0 + 2, '17:00', '19:00', 'Painel: o futuro do turismo corporativo', 'Sala de eventos do hotel', null, null, null, null),
    (t, d0 + 3, '09:00', '13:00', 'Compras no Premium Outlets', 'Orlando Vineland Premium Outlets', 'Orlando Vineland Premium Outlets, Orlando, FL', 'Passaporte para descontos de turista', null, null),
    (t, d0 + 3, '15:00', null,    'Check-out e transfer para o aeroporto', 'Lobby do hotel', null, 'Malas e passaporte', 'Confira o horário do seu voo no app.', null);

  insert into announcements (trip_id, title, body, urgent, group_label, created_at) values
    (t, 'Bem-vindos a Orlando!', 'Qualquer dúvida, fale com a equipe pelo botão de emergência no seu passe.', false, null, now() - interval '30 hours'),
    (t, 'Jantar de boas-vindas confirmado', 'Encontro no restaurante do hotel às 19h30.', false, null, now() - interval '26 hours'),
    (t, 'Ônibus 2 sai 10 minutos mais cedo', 'Encontro no lobby às 8h20.', true, 'Ônibus 2', now() - interval '5 hours'),
    (t, 'Previsão de chuva à tarde', 'Leve a capa de chuva para a rodada de negócios.', false, null, now() - interval '2 hours');

  insert into doc_requirements (trip_id, title, sort) values
    (t, 'Passaporte válido', 1), (t, 'Visto americano ou ESTA', 2), (t, 'Seguro viagem', 3);
  insert into doc_status (requirement_id, participant_id, done)
  select r.id, p.id, (abs(hashtext(p.id::text || r.id::text)) % 10) < 9
    from doc_requirements r cross join participants p
   where r.trip_id = t and p.trip_id = t;

  insert into checkpoints (trip_id, title) values (t, 'Transfer do aeroporto') returning id into cp1;
  insert into checkpoints (trip_id, title) values (t, 'Embarque para a visita técnica') returning id into cp2;
  insert into checkpoints (trip_id, title) values (t, 'Embarque para o Kennedy Space Center') returning id into cp3;
  insert into checkins (checkpoint_id, participant_id, checked_at)
  select cp1, id, d0 + time '14:20' from participants where trip_id = t;
  insert into checkins (checkpoint_id, participant_id, checked_at)
  select cp2, id, d0 + 1 + time '08:25' from participants where trip_id = t and abs(hashtext(id::text)) % 13 <> 0;

  insert into incidents (trip_id, participant_id, kind, note, created_at)
  select t, id, 'atraso', 'Chegou 15 minutos depois do embarque; seguiu de Uber com o coordenador.', now() - interval '6 hours'
    from participants where trip_id = t order by name limit 1;
  insert into incidents (trip_id, kind, note, created_at)
  values (t, 'outro', 'Ar-condicionado do ônibus 2 com problema; trocado pela empresa de transporte.', now() - interval '20 hours');

  insert into survey_responses (trip_id, participant_id, rating, nps, comment)
  select t, p.id,
         case when n % 6 = 0 then 4 else 5 end,
         case when n % 8 = 0 then 8 when n % 11 = 0 then 6 else 9 + (n % 2) end,
         case n
           when 1 then 'Organização impecável. O app ajudou muito, nunca fiquei perdido.'
           when 2 then 'A visita técnica valeu a viagem. Fiz ótimos contatos.'
           when 3 then 'Adorei receber as minhas fotos no celular no mesmo dia!'
           when 5 then 'Só achei o dia do Kennedy um pouco corrido.'
           when 8 then 'Equipe muito atenciosa. Voltaria com a agência.'
           else null end
    from (select id, row_number() over (order by name) n from participants where trip_id = t) p
   where p.n <= 22;

  return t;
end $$;
revoke execute on function create_demo_trip(uuid) from public, anon;
grant execute on function create_demo_trip(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Segurança das funções novas
-- ---------------------------------------------------------------------
alter function public.face_match_threshold() set search_path = public;
revoke execute on function public.match_photo_face() from public, anon, authenticated;
revoke execute on function public.match_participant_face() from public, anon, authenticated;
revoke execute on function public.unmatch_participant_face() from public, anon, authenticated;
revoke execute on function public.consent_revoked() from public, anon, authenticated;
revoke execute on function public.notify_announcement() from public, anon, authenticated;

alter publication supabase_realtime add table photo_tags;
