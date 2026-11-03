-- =====================================================================
-- Juntly — schema do banco (Supabase / Postgres)
-- Rode este arquivo inteiro no SQL Editor do Supabase, uma única vez.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Agências e equipe
-- ---------------------------------------------------------------------
create table if not exists agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  brand_color text default '#E85D2F',
  created_at timestamptz not null default now()
);

create table if not exists agency_members (
  agency_id uuid not null references agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'coordinator' check (role in ('owner','admin','coordinator')),
  created_at timestamptz not null default now(),
  primary key (agency_id, user_id)
);

-- ---------------------------------------------------------------------
-- Viagens
-- ---------------------------------------------------------------------
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  name text not null,
  destination text,
  start_date date,
  end_date date,
  code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  guide text default '',
  emergency_phone text,
  survey_open boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  phone text,
  group_label text,          -- ônibus, turma ou mesa
  room text,                 -- quarto (rooming list)
  lang text not null default 'pt' check (lang in ('pt','en','es')),
  photo_consent boolean not null default false,
  emergency_contact text,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trip_id, user_id)
);
create index if not exists participants_trip_idx on participants(trip_id);

create table if not exists agenda_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  day date not null,
  start_time time,
  end_time time,
  title text not null,
  location text,
  address text,
  bring text,                -- o que levar
  notes text,
  group_label text,          -- vazio = todos
  updated_at timestamptz not null default now()
);
create index if not exists agenda_trip_idx on agenda_items(trip_id, day, start_time);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  title text not null,
  body text,
  group_label text,          -- vazio = todos
  urgent boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists announcements_trip_idx on announcements(trip_id, created_at desc);

-- Documentos exigidos (passaporte, ESTA/visto, seguro…)
create table if not exists doc_requirements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  title text not null,
  description text,
  sort int not null default 0
);

create table if not exists doc_status (
  requirement_id uuid not null references doc_requirements(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (requirement_id, participant_id)
);

-- Check-in
create table if not exists checkpoints (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  title text not null,
  agenda_item_id uuid references agenda_items(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references checkpoints(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  checked_by uuid references auth.users(id),
  checked_at timestamptz not null default now(),
  unique (checkpoint_id, participant_id)
);

-- Ocorrências registradas pelo coordenador
create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  participant_id uuid references participants(id) on delete set null,
  kind text not null default 'outro' check (kind in ('atraso','saude','reclamacao','outro')),
  note text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Fotos
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  storage_path text not null,
  caption text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists photos_trip_idx on photos(trip_id, created_at desc);

create table if not exists photo_tags (
  photo_id uuid not null references photos(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  primary key (photo_id, participant_id)
);

-- Pesquisa de satisfação
create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  rating int check (rating between 1 and 5),
  nps int check (nps between 0 and 10),
  comment text,
  created_at timestamptz not null default now(),
  unique (trip_id, participant_id)
);

-- ---------------------------------------------------------------------
-- Funções de permissão
-- ---------------------------------------------------------------------
create or replace function is_anonymous() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

create or replace function is_agency_member(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from agency_members where agency_id = a and user_id = auth.uid())
$$;

create or replace function is_agency_admin(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from agency_members
                 where agency_id = a and user_id = auth.uid() and role in ('owner','admin'))
$$;

create or replace function is_trip_staff(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trips tr join agency_members m on m.agency_id = tr.agency_id
                 where tr.id = t and m.user_id = auth.uid())
$$;

create or replace function is_trip_participant(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from participants where trip_id = t and user_id = auth.uid())
$$;

create or replace function my_participant_id(t uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from participants where trip_id = t and user_id = auth.uid() limit 1
$$;

-- Cria a agência do usuário logado e o torna dono
create or replace function create_agency(agency_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null or is_anonymous() then
    raise exception 'Faça login com e-mail para criar uma agência';
  end if;
  insert into agencies(name) values (agency_name) returning id into new_id;
  insert into agency_members(agency_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end $$;

-- Adiciona coordenador/admin por e-mail (a pessoa precisa ter entrado no Juntly uma vez)
create or replace function add_agency_member(a uuid, member_email text, member_role text default 'coordinator')
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  if not is_agency_admin(a) then raise exception 'Sem permissão'; end if;
  if member_role not in ('admin','coordinator') then raise exception 'Papel inválido'; end if;
  select id into uid from auth.users where lower(email) = lower(member_email) limit 1;
  if uid is null then
    raise exception 'Essa pessoa ainda não entrou no Juntly. Peça para ela fazer login uma vez.';
  end if;
  insert into agency_members(agency_id, user_id, role) values (a, uid, member_role)
  on conflict (agency_id, user_id) do update set role = excluded.role;
end $$;

-- Lista a equipe da agência com e-mail
create or replace function list_agency_members(a uuid)
returns table (user_id uuid, email text, role text)
language sql stable security definer set search_path = public, auth as $$
  select m.user_id, u.email::text, m.role
    from agency_members m join auth.users u on u.id = m.user_id
   where m.agency_id = a and is_agency_member(a)
   order by m.created_at
$$;

-- Entrada do participante pelo código da viagem (sem senha, login anônimo)
create or replace function join_trip(trip_code text, p_name text, p_phone text default null,
                                     p_email text default null, p_lang text default 'pt',
                                     p_consent boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare t_id uuid; p_id uuid; digits text;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  select id into t_id from trips where code = upper(trim(trip_code));
  if t_id is null then raise exception 'Código de viagem não encontrado'; end if;

  select id into p_id from participants where trip_id = t_id and user_id = auth.uid();
  if p_id is not null then return t_id; end if;

  digits := nullif(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), '');

  -- tenta encontrar o participante importado pela agência (telefone ou e-mail)
  select id into p_id from participants
   where trip_id = t_id and user_id is null
     and ((digits is not null and right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 8) = right(digits, 8))
       or (p_email is not null and lower(email) = lower(trim(p_email))))
   limit 1;

  if p_id is not null then
    update participants
       set user_id = auth.uid(), lang = coalesce(p_lang,'pt'), photo_consent = p_consent, joined_at = now()
     where id = p_id;
  else
    insert into participants(trip_id, user_id, name, phone, email, lang, photo_consent, joined_at)
    values (t_id, auth.uid(), trim(p_name), p_phone, nullif(trim(coalesce(p_email,'')),''),
            coalesce(p_lang,'pt'), p_consent, now());
  end if;
  return t_id;
end $$;

-- Busca a viagem pelo código (para a tela de entrada mostrar nome e marca)
create or replace function trip_preview(trip_code text)
returns table (name text, destination text, start_date date, end_date date, agency_name text, logo_url text, brand_color text)
language sql stable security definer set search_path = public as $$
  select t.name, t.destination, t.start_date, t.end_date, a.name, a.logo_url, a.brand_color
    from trips t join agencies a on a.id = t.agency_id
   where t.code = upper(trim(trip_code))
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table agencies enable row level security;
alter table agency_members enable row level security;
alter table trips enable row level security;
alter table participants enable row level security;
alter table agenda_items enable row level security;
alter table announcements enable row level security;
alter table doc_requirements enable row level security;
alter table doc_status enable row level security;
alter table checkpoints enable row level security;
alter table checkins enable row level security;
alter table incidents enable row level security;
alter table photos enable row level security;
alter table photo_tags enable row level security;
alter table survey_responses enable row level security;

-- agencies
create policy agencies_select on agencies for select using (
  is_agency_member(id)
  or exists (select 1 from trips t where t.agency_id = agencies.id and is_trip_participant(t.id))
);
create policy agencies_update on agencies for update using (is_agency_admin(id));

-- agency_members
create policy members_select on agency_members for select using (is_agency_member(agency_id));
create policy members_delete on agency_members for delete using (is_agency_admin(agency_id) and user_id <> auth.uid());

-- trips
create policy trips_select on trips for select using (is_agency_member(agency_id) or is_trip_participant(id));
create policy trips_insert on trips for insert with check (is_agency_member(agency_id));
create policy trips_update on trips for update using (is_agency_member(agency_id));
create policy trips_delete on trips for delete using (is_agency_admin(agency_id));

-- participants
create policy participants_staff on participants for all using (is_trip_staff(trip_id)) with check (is_trip_staff(trip_id));
create policy participants_self_select on participants for select using (user_id = auth.uid());
create policy participants_self_update on participants for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- conteúdo da viagem: equipe edita, participante lê
create policy agenda_staff on agenda_items for all using (is_trip_staff(trip_id)) with check (is_trip_staff(trip_id));
create policy agenda_read on agenda_items for select using (is_trip_participant(trip_id));

create policy ann_staff on announcements for all using (is_trip_staff(trip_id)) with check (is_trip_staff(trip_id));
create policy ann_read on announcements for select using (is_trip_participant(trip_id));

create policy docreq_staff on doc_requirements for all using (is_trip_staff(trip_id)) with check (is_trip_staff(trip_id));
create policy docreq_read on doc_requirements for select using (is_trip_participant(trip_id));

create policy docstatus_staff on doc_status for all using (
  exists (select 1 from participants p where p.id = participant_id and is_trip_staff(p.trip_id))
);
create policy docstatus_self on doc_status for all using (
  exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
);

create policy checkpoints_staff on checkpoints for all using (is_trip_staff(trip_id)) with check (is_trip_staff(trip_id));

create policy checkins_staff on checkins for all using (
  exists (select 1 from checkpoints c where c.id = checkpoint_id and is_trip_staff(c.trip_id))
) with check (
  exists (select 1 from checkpoints c where c.id = checkpoint_id and is_trip_staff(c.trip_id))
);
create policy checkins_self on checkins for select using (
  exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
);

create policy incidents_staff on incidents for all using (is_trip_staff(trip_id)) with check (is_trip_staff(trip_id));

create policy photos_staff on photos for all using (is_trip_staff(trip_id)) with check (is_trip_staff(trip_id));
create policy photos_read on photos for select using (is_trip_participant(trip_id));

create policy tags_staff on photo_tags for all using (
  exists (select 1 from photos ph where ph.id = photo_id and is_trip_staff(ph.trip_id))
) with check (
  exists (select 1 from photos ph where ph.id = photo_id and is_trip_staff(ph.trip_id))
);
create policy tags_read on photo_tags for select using (
  exists (select 1 from photos ph where ph.id = photo_id and is_trip_participant(ph.trip_id))
);

create policy survey_staff on survey_responses for select using (is_trip_staff(trip_id));
create policy survey_self on survey_responses for all using (
  exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from participants p
           where p.id = participant_id and p.user_id = auth.uid() and p.trip_id = survey_responses.trip_id)
);

-- O participante só pode mudar idioma, autorização de imagem e contatos.
-- Grupo, quarto, nome e viagem são definidos pela agência.
create or replace function guard_participant_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not is_trip_staff(old.trip_id) then
    if new.trip_id <> old.trip_id
       or new.user_id is distinct from old.user_id
       or new.name is distinct from old.name
       or new.group_label is distinct from old.group_label
       or new.room is distinct from old.room
       or new.joined_at is distinct from old.joined_at then
      raise exception 'Somente a agência pode alterar esses dados';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists participants_guard on participants;
create trigger participants_guard before update on participants
  for each row execute function guard_participant_update();

-- ---------------------------------------------------------------------
-- Tempo real (agenda e avisos ao vivo, check-in e fotos)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table agenda_items, announcements, checkins, photos;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists agenda_touch on agenda_items;
create trigger agenda_touch before update on agenda_items for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- Storage: fotos (privado) e marca da agência (público)
-- Caminhos: photos/<trip_id>/<arquivo>   branding/<agency_id>/<arquivo>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
  on conflict (id) do nothing;

create policy photos_obj_read on storage.objects for select using (
  bucket_id = 'photos' and (
    is_trip_staff(((storage.foldername(name))[1])::uuid)
    or is_trip_participant(((storage.foldername(name))[1])::uuid))
);
create policy photos_obj_write on storage.objects for insert with check (
  bucket_id = 'photos' and is_trip_staff(((storage.foldername(name))[1])::uuid)
);
create policy photos_obj_delete on storage.objects for delete using (
  bucket_id = 'photos' and is_trip_staff(((storage.foldername(name))[1])::uuid)
);
create policy branding_obj_write on storage.objects for insert with check (
  bucket_id = 'branding' and is_agency_admin(((storage.foldername(name))[1])::uuid)
);
create policy branding_obj_update on storage.objects for update using (
  bucket_id = 'branding' and is_agency_admin(((storage.foldername(name))[1])::uuid)
);
