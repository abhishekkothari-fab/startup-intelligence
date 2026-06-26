-- ── STARTUP VIEWS ─────────────────────────────────────────────
-- Audit log: records which user fetched each startup profile.

create table public.startup_views (
  id          uuid primary key default gen_random_uuid(),
  startup_id  uuid not null references public.startups(id) on delete cascade,
  viewed_by   text not null,
  viewed_at   timestamptz not null default now()
);

create index idx_views_startup on public.startup_views(startup_id);
create index idx_views_user    on public.startup_views(viewed_by);
create index idx_views_time    on public.startup_views(viewed_at desc);

alter table public.startup_views enable row level security;

create policy "auth_insert_views" on public.startup_views
  for insert with check (auth.role() in ('authenticated', 'service_role'));

create policy "service_read_views" on public.startup_views
  for select using (auth.role() = 'service_role');

-- Backfill: mark all existing startups as viewed by the initial user.
insert into public.startup_views (startup_id, viewed_by)
select id, 'abhishek.kothari@gmail.com'
from public.startups;
