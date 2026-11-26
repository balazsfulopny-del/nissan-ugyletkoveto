-- Ügyletkövető v2: adatbázis szerkezet (Supabase, PostgreSQL)
-- Minden sor a tulajdonos fiókjához kötött; RLS miatt más belépő semmit nem lát.

create extension if not exists pgcrypto;

-- Ügyletek: a gyakran keresett mezők oszlopban, a ritkábbak az extra jsonb-ben.
create table if not exists public.deals (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cust        text not null default '',
  phone       text not null default '',
  model       text not null default '',
  vin         text not null default '',
  contract    date,
  delivery    date,
  handed      date,
  cancel_at   date,          -- elállás napja (a megőrzési idő innen számít)
  paid        boolean not null default false,
  cancel      boolean not null default false,
  ceg boolean not null default false, fin boolean not null default false,
  trade boolean not null default false, ins boolean not null default false,
  acc boolean not null default false,
  price numeric, downpay numeric, margin numeric, accv numeric, adj numeric,
  -- Későbbi összekötés az ajánlatadóval: az ajánlat azonosítója és száma.
  -- Kitöltve, ha az ügylet ajánlatból jött (import vagy élő kapcsolat).
  offer_ref   text,          -- az ajánlatadó adatbázisában az ajánlat id-ja
  offer_no    text,          -- emberi ajánlatszám, pl. NYA-2026-0123
  cust_email  text not null default '',
  cust_addr   text not null default '',
  source      text not null default 'kézi',   -- kézi | ajánlat | import
  promise     text not null default '',
  note        text not null default '',
  jv          jsonb not null default '{}'::jsonb,   -- jóváírás számítás
  tpl_version int not null default 2,
  deleted_at  timestamptz,                          -- puha törlés, visszaállítható
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  rev         bigint not null default 1             -- ütközésfigyeléshez
);
create index if not exists deals_owner_idx on public.deals(owner, delivery);
create index if not exists deals_upd_idx on public.deals(owner, updated_at);
create unique index if not exists deals_offer_idx on public.deals(owner, offer_ref) where offer_ref is not null;

-- Feladatok külön sorban: két eszközről pipálva sem írják felül egymást.
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tpl_key    text,                 -- pl. 'u14' a sablonból, null ha saját feladat
  sub        jsonb,                -- al-checklist: [{t, done}]
  man        boolean not null default false, -- határidő kézzel módosítva
  title      text not null,
  due        date,
  done       boolean not null default false,
  done_at    date,
  sort       int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_deal_idx on public.tasks(deal_id, sort);
create index if not exists tasks_due_idx on public.tasks(owner, done, due);
create index if not exists tasks_upd_idx on public.tasks(owner, updated_at);

-- Dokumentumok: a fájl a privát 'docs' tárolóban, titkosítva; itt csak a leírása.
create table if not exists public.docs (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null default 'egyéb',  -- szerződés, számla, ...
  name       text not null,
  path       text not null,                  -- <owner>/<deal>/<id>.bin
  mime       text not null,
  size       int not null,
  pages      int,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Felhasználói beállítások (jutalék szabályok, PIN kulcs burok, sablon).
create table if not exists public.settings (
  owner      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  pin        jsonb,          -- {salt, iv, w, it, v}: a dokumentum kulcs PIN-nel burkolva
  updated_at timestamptz not null default now()
);

-- updated_at + rev automatikusan
create or replace function public.touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_table_name = 'deals' then new.rev := old.rev + 1; end if;
  return new;
end $$;
drop trigger if exists deals_touch on public.deals;
create trigger deals_touch before update on public.deals for each row execute function public.touch();
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings for each row execute function public.touch();
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before update on public.docs for each row execute function public.touch();

-- Sorszintű hozzáférés: csak a saját sorok
alter table public.deals    enable row level security;
alter table public.tasks    enable row level security;
alter table public.docs     enable row level security;
alter table public.settings enable row level security;

do $$ declare t text; begin
  foreach t in array array['deals','tasks','docs','settings'] loop
    execute format('drop policy if exists own on public.%I', t);
    execute format('create policy own on public.%I for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid())', t);
  end loop;
end $$;

-- Hozzáférés az API-n át (a sorokat a fenti szabályok szűrik); névtelen látogató semmit nem ér el
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.deals, public.tasks, public.docs, public.settings to authenticated;
revoke all on public.deals, public.tasks, public.docs, public.settings from anon;

-- A feladat és dokumentum csak saját ügylethez tartozhat
create or replace function public.check_deal_owner() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.deals d where d.id = new.deal_id and d.owner = new.owner) then
    raise exception 'deal not owned';
  end if;
  return new;
end $$;
drop trigger if exists tasks_owner on public.tasks;
create trigger tasks_owner before insert or update on public.tasks for each row execute function public.check_deal_owner();
drop trigger if exists docs_owner on public.docs;
create trigger docs_owner before insert or update on public.docs for each row execute function public.check_deal_owner();

-- Élő szinkron (Realtime) ezekre a táblákra
do $$ declare t text; begin
  foreach t in array array['deals','tasks','docs','settings'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Fájltároló: privát, max 25 MB/fájl, csak a saját mappa (<owner>/...)
insert into storage.buckets (id, name, public, file_size_limit)
values ('docs', 'docs', false, 26214400)
on conflict (id) do nothing;

drop policy if exists docs_own_rw on storage.objects;
create policy docs_own_rw on storage.objects for all to authenticated
  using (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- Megőrzés (1 év): az app naponta maga törli a lejárt ügyleteket a fájljaikkal együtt.
-- Tartalék, ha az app hónapokig nem nyílna meg: az adatbázis is törli a sorokat 30 nappal a határidő után.
create extension if not exists pg_cron;
create or replace function public.retention_backstop() returns void language sql security definer set search_path = public as $$
  delete from public.deals d
  where (d.deleted_at is not null and d.deleted_at < now() - interval '60 days')
     or (coalesce(d.handed, case when d.cancel then coalesce(d.cancel_at, d.updated_at::date) end) < current_date - 395);
$$;
revoke all on function public.retention_backstop() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'ugyletkoveto-retention';
select cron.schedule('ugyletkoveto-retention', '15 2 * * *', 'select public.retention_backstop()');
