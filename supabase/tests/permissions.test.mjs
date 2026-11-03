import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'

const db = new PGlite()
const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8').replace('create extension if not exists pgcrypto;', '')

await db.exec(`
create role authenticated; create role anon;
create schema auth;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean);
create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create publication supabase_realtime;
`)
await db.exec(schema)
await db.exec(`
grant usage on schema public, auth, storage to authenticated, anon;
grant all on all tables in schema public to authenticated;
grant all on storage.objects to authenticated;
grant execute on all functions in schema public to authenticated, anon;
`)

const U = {
  owner: '11111111-1111-1111-1111-111111111111',
  coord: '22222222-2222-2222-2222-222222222222',
  maria: '33333333-3333-3333-3333-333333333333',
  stranger: '44444444-4444-4444-4444-444444444444',
  newbie: '55555555-5555-5555-5555-555555555555'
}
await db.exec(`insert into auth.users values ('${U.owner}','dono@agencia.com'),('${U.coord}','coord@agencia.com'),('${U.maria}',null),('${U.stranger}',null),('${U.newbie}',null)`)

let failures = 0
async function as(user, anon, sql, params = []) {
  await db.exec(`reset role`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
    [user, JSON.stringify({ sub: user, is_anonymous: anon })])
  await db.exec(`set role authenticated`)
  return db.query(sql, params)
}
async function expect(label, fn, check) {
  try {
    const r = await fn()
    const ok = check(r, null)
    console.log(ok ? 'OK  ' : 'FAIL', label, ok ? '' : JSON.stringify(r.rows))
    if (!ok) failures++
  } catch (e) {
    const ok = check(null, e)
    console.log(ok ? 'OK  ' : 'FAIL', label, ok ? `(erro esperado: ${e.message})` : e.message)
    if (!ok) failures++
  }
}
const rows = (n) => (r) => r && r.rows.length === n
const errors = (r, e) => Boolean(e)
const works = (r) => Boolean(r)

let agencyId, tripId
await expect('anônimo não cria agência', () => as(U.maria, true, `select create_agency('X')`), errors)
await expect('dono cria agência', async () => { const r = await as(U.owner, false, `select create_agency('Sol Viagens') id`); agencyId = r.rows[0].id; return r }, works)
await expect('dono cria viagem', async () => {
  const r = await as(U.owner, false, `insert into trips(agency_id, name, destination) values ($1,'Missão Orlando','Orlando') returning id, code`, [agencyId])
  tripId = r.rows[0].id; global.code = r.rows[0].code; return r
}, works)
await expect('dono importa participante', () => as(U.owner, false, `insert into participants(trip_id,name,phone,group_label) values ($1,'Maria Silva','+55 (11) 99999-1234','Ônibus 1'),($1,'João','+55 11 98888-0000','Ônibus 2')`, [tripId]), works)
await expect('dono cria agenda e aviso', () => as(U.owner, false, `
  insert into agenda_items(trip_id, day, title) values ($1,'2027-04-10','Epcot');`, [tripId]), works)
await as(U.owner, false, `insert into agenda_items(trip_id, day, title, group_label) values ($1,'2027-04-10','Só ônibus 2','Ônibus 2')`, [tripId])
await as(U.owner, false, `insert into announcements(trip_id, title) values ($1,'Bem-vindos')`, [tripId])
await as(U.owner, false, `insert into doc_requirements(trip_id, title) values ($1,'Passaporte')`, [tripId])

await expect('estranho vê prévia pelo código', () => as(U.stranger, true, `select * from trip_preview($1)`, [global.code]), rows(1))
await expect('estranho não vê viagem', () => as(U.stranger, true, `select * from trips`), rows(0))
await expect('estranho não vê agenda', () => as(U.stranger, true, `select * from agenda_items`), rows(0))
await expect('código errado falha', () => as(U.maria, true, `select join_trip('ZZZZZZ','Maria')`), errors)
await expect('Maria entra pelo telefone e assume o cadastro importado', () => as(U.maria, true, `select join_trip(lower($1),'Maria S','11999991234',null,'pt',true)`, [global.code]), works)
await expect('cadastro importado ficou ligado à Maria (sem duplicar)', () => as(U.owner, false, `select * from participants where trip_id=$1 and user_id=$2 and name='Maria Silva'`, [tripId, U.maria]), rows(1))
await expect('total de participantes continua 2', () => as(U.owner, false, `select * from participants where trip_id=$1`, [tripId]), rows(2))
await expect('Maria vê a viagem', () => as(U.maria, true, `select * from trips`), rows(1))
await expect('Maria vê a agenda', () => as(U.maria, true, `select * from agenda_items`), rows(2))
await expect('Maria vê só o próprio cadastro', () => as(U.maria, true, `select * from participants`), rows(1))
await expect('Maria vê a marca da agência', () => as(U.maria, true, `select * from agencies`), rows(1))
await expect('Maria não edita a agenda', () => as(U.maria, true, `update agenda_items set title='hack' returning id`), rows(0))
await expect('Maria não cria aviso', () => as(U.maria, true, `insert into announcements(trip_id,title) values ($1,'x')`, [tripId]), errors)
await expect('Maria marca documento', async () => {
  const req = (await as(U.maria, true, `select id from doc_requirements`)).rows[0].id
  const me = (await as(U.maria, true, `select my_participant_id($1) id`, [tripId])).rows[0].id
  global.mariaPid = me
  return as(U.maria, true, `insert into doc_status(requirement_id, participant_id, done) values ($1,$2,true)`, [req, me])
}, works)
await expect('Maria responde a pesquisa', () => as(U.maria, true, `insert into survey_responses(trip_id, participant_id, rating, nps) values ($1,$2,5,10)`, [tripId, global.mariaPid]), works)
await expect('Maria não lê pesquisas dos outros', () => as(U.maria, true, `select * from survey_responses where participant_id <> $1`, [global.mariaPid]), rows(0))
await expect('novo participante sem cadastro entra e é criado', () => as(U.newbie, true, `select join_trip($1,'Pedro')`, [global.code]), works)
await expect('agora são 3 participantes', () => as(U.owner, false, `select * from participants where trip_id=$1`, [tripId]), rows(3))

await expect('coordenador sem convite não vê a viagem', () => as(U.coord, false, `select * from trips`), rows(0))
await expect('coordenador não se adiciona sozinho', () => as(U.coord, false, `select add_agency_member($1,'coord@agencia.com','admin')`, [agencyId]), errors)
await expect('dono adiciona coordenador por e-mail', () => as(U.owner, false, `select add_agency_member($1,'COORD@agencia.com','coordinator')`, [agencyId]), works)
await expect('dono lista equipe com e-mails', () => as(U.owner, false, `select * from list_agency_members($1)`, [agencyId]), rows(2))
await expect('coordenador vê a viagem', () => as(U.coord, false, `select * from trips`), rows(1))
await expect('coordenador faz check-in', async () => {
  const cp = (await as(U.coord, false, `insert into checkpoints(trip_id,title) values ($1,'Embarque') returning id`, [tripId])).rows[0].id
  return as(U.coord, false, `insert into checkins(checkpoint_id, participant_id, checked_by) values ($1,$2,$3)`, [cp, global.mariaPid, U.coord])
}, works)
await expect('Maria vê o próprio check-in', () => as(U.maria, true, `select * from checkins`), rows(1))
await expect('coordenador não apaga a viagem', () => as(U.coord, false, `delete from trips returning id`), rows(0))
await expect('coordenador não muda a agência', () => as(U.coord, false, `update agencies set name='x' returning id`), rows(0))
await expect('coordenador envia foto ao storage', () => as(U.coord, false, `insert into storage.objects(bucket_id,name) values ('photos', $1)`, [`${tripId}/a.jpg`]), works)
await expect('Maria lê a foto no storage', () => as(U.maria, true, `select * from storage.objects where bucket_id='photos'`), rows(1))
await expect('estranho não lê a foto', () => as(U.stranger, true, `select * from storage.objects where bucket_id='photos'`), rows(0))
await expect('Maria não envia foto', () => as(U.maria, true, `insert into storage.objects(bucket_id,name) values ('photos', $1)`, [`${tripId}/b.jpg`]), errors)

await expect('Maria muda idioma e autorização', () => as(U.maria, true, `update participants set lang='en', photo_consent=false where user_id=$1 returning id`, [U.maria]), rows(1))
await expect('Maria não troca de grupo', () => as(U.maria, true, `update participants set group_label='VIP' where user_id=$1`, [U.maria]), errors)
await expect('Maria não se move para outra viagem', () => as(U.maria, true, `update participants set trip_id=gen_random_uuid() where user_id=$1`, [U.maria]), errors)
await expect('equipe ainda troca o grupo da Maria', () => as(U.coord, false, `update participants set group_label='Ônibus 3' where user_id=$1 returning id`, [U.maria]), rows(1))
await expect('pesquisa com viagem errada é recusada', () => as(U.maria, true, `insert into survey_responses(trip_id, participant_id, rating) values (gen_random_uuid(),$1,1)`, [global.mariaPid]), errors)

console.log(failures ? `\n${failures} falha(s)` : '\nTodos os testes passaram')
process.exit(failures ? 1 : 0)
