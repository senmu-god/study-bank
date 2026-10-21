-- Daily aggregate snapshots for honest progress trends; no per-user data is stored.
create table if not exists public.kp_progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  total integer not null default 0,
  mastered integer not null default 0,
  pending integer not null default 0,
  not_mastered integer not null default 0,
  learning integer not null default 0,
  not_started integer not null default 0,
  progress numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);
alter table public.kp_progress_snapshots enable row level security;
revoke all on public.kp_progress_snapshots from anon, authenticated;
