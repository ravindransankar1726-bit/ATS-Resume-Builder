create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'Untitled Resume',
  template text default 'tpl-ats',
  name text default '',
  target_title text default '',
  email text default '',
  phone text default '',
  location text default '',
  linkedin text default '',
  github text default '',
  summary text default '',
  skills text[] default '{}',
  experience text default '',
  education text default '',
  certifications text default '',
  achievements text default '',
  languages text default '',
  job_description text default '',
  company text default '',
  ats_score integer,
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row Level Security: every user can only see/edit/delete their own resumes
alter table public.resumes enable row level security;

create policy "Users can view their own resumes"
  on public.resumes for select
  using (auth.uid() = user_id);

create policy "Anyone can view resumes shared publicly"
  on public.resumes for select
  using (is_public = true);

create policy "Users can insert their own resumes"
  on public.resumes for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own resumes"
  on public.resumes for update
  using (auth.uid() = user_id);

create policy "Users can delete their own resumes"
  on public.resumes for delete
  using (auth.uid() = user_id);

-- Keep updated_at fresh on every edit
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists resumes_set_updated_at on public.resumes;
create trigger resumes_set_updated_at
  before update on public.resumes
  for each row execute function public.set_updated_at();

-- ============================================================
-- Job Application Tracker
-- ============================================================
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  company text not null default '',
  role text not null default '',
  applied_date date,
  status text default 'Applied', -- Applied / Interview / Selected / Rejected
  interview_date date,
  result text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.applications enable row level security;

create policy "Users can view their own applications"
  on public.applications for select
  using (auth.uid() = user_id);

create policy "Users can insert their own applications"
  on public.applications for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own applications"
  on public.applications for update
  using (auth.uid() = user_id);

create policy "Users can delete their own applications"
  on public.applications for delete
  using (auth.uid() = user_id);

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- ============================================================
-- App Feedback
-- ============================================================
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  rating integer not null check (rating between 1 and 5),
  comment text default '',
  created_at timestamptz default now()
);

alter table public.feedback enable row level security;

create policy "Users can view their own feedback"
  on public.feedback for select
  using (auth.uid() = user_id);

create policy "Users can insert their own feedback"
  on public.feedback for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- Resume Version History
-- ============================================================
create table if not exists public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid references public.resumes(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  snapshot jsonb not null,
  ats_score integer,
  created_at timestamptz default now()
);

alter table public.resume_versions enable row level security;

create policy "Users can view their own resume versions"
  on public.resume_versions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own resume versions"
  on public.resume_versions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own resume versions"
  on public.resume_versions for delete
  using (auth.uid() = user_id);

-- ============================================================
-- v2 additions (safe to re-run)
-- ============================================================
alter table public.resumes add column if not exists experience_level text default 'fresher';
alter table public.resumes add column if not exists ats_breakdown jsonb;
alter table public.resumes add column if not exists internships text default '';
alter table public.resumes add column if not exists hobbies text default '';

-- credits removed: everything is free
drop table if exists public.credit_transactions;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  subject text not null check (char_length(subject) <= 200),
  description text not null,
  status text default 'open',
  created_at timestamptz default now()
);
alter table public.support_tickets enable row level security;
drop policy if exists "own tickets select" on public.support_tickets;
drop policy if exists "own tickets insert" on public.support_tickets;
create policy "own tickets select" on public.support_tickets for select using (auth.uid() = user_id);
create policy "own tickets insert" on public.support_tickets for insert with check (auth.uid() = user_id);
