-- ── STARTUP FEEDBACK ──────────────────────────────────────────
-- Free-text feedback from VC analysts, captured per-startup and
-- (optionally) per-section while reading a profile.

create table public.startup_feedback (
  id            uuid primary key default gen_random_uuid(),
  startup_id    uuid not null references public.startups(id) on delete cascade,
  section_id    text,
  section_label text,
  message       text not null,
  submitted_by  text not null,
  submitted_at  timestamptz not null default now()
);

create index idx_feedback_startup on public.startup_feedback(startup_id);
create index idx_feedback_user    on public.startup_feedback(submitted_by);
create index idx_feedback_time    on public.startup_feedback(submitted_at desc);

alter table public.startup_feedback enable row level security;

-- Analysts can only insert feedback attributed to their own verified email.
create policy "authenticated_insert_feedback" on public.startup_feedback
  for insert to authenticated
  with check (submitted_by = (select auth.jwt() ->> 'email'));

-- Feedback is read by the team via the dashboard/service role only.
create policy "service_read_feedback" on public.startup_feedback
  for select to service_role
  using (true);
