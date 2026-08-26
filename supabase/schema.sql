create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proposal-docx',
  'proposal-docx',
  false,
  20971520,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null unique,
  role text not null default 'Leitor' check (role in ('Admin', 'Editor', 'Leitor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  cnpj text not null default '',
  address text not null default '',
  contact_person text not null default '',
  contacts text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  event_date text not null default '',
  location text not null default '',
  description text not null default '',
  company_id uuid references public.companies(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  template_type text not null default 'Patrocinio',
  variables text[] not null default '{}',
  imported_file_name text not null default '',
  storage_path text not null default '',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.counterparts (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  category text not null default '',
  description text not null default '',
  estimated_value text not null default '',
  year text not null default '',
  source_file_name text not null default '',
  event_id uuid references public.events(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_counters (
  counter_key text primary key,
  counter_value integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  company_id uuid references public.companies(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  event_date text not null default '',
  event_location text not null default '',
  template_id uuid references public.templates(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  recipient_name text not null default '',
  proposal_value text not null default '',
  status text not null default 'Rascunho',
  workflow_stage text not null default 'Em confeccao',
  content text not null default '',
  counterpart_ids uuid[] not null default '{}',
  control_year text not null default '',
  control_sequence integer,
  control_code text not null default '',
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.proposals(id) on delete cascade,
  control_code text not null default '',
  reason text not null default '',
  status text not null default '',
  content text not null default '',
  changed_by_id uuid references public.profiles(id) on delete set null,
  changed_by_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.proposal_change_logs (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid,
  control_code text not null default '',
  proposal_title text not null default '',
  company_id uuid,
  company_name text not null default '',
  event_id uuid,
  event_name text not null default '',
  action text not null default '',
  changed_by_id uuid references public.profiles(id) on delete set null,
  changed_by_name text not null default '',
  changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.proposal_notes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.proposals(id) on delete cascade,
  content text not null default '',
  created_by_id uuid references public.profiles(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.reserve_proposal_code(target_year text)
returns table(control_year text, control_sequence integer, control_code text, issued_at timestamptz)
language plpgsql
security definer
as $$
declare
  next_value integer;
begin
  insert into public.app_counters(counter_key, counter_value, updated_at)
  values ('proposal:' || target_year, 1, now())
  on conflict (counter_key)
  do update set counter_value = public.app_counters.counter_value + 1, updated_at = now()
  returning counter_value into next_value;

  control_year := target_year;
  control_sequence := next_value;
  control_code := 'C ' || lpad(next_value::text, 3, '0') || '/' || target_year;
  issued_at := now();
  return next;
end;
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.events enable row level security;
alter table public.templates enable row level security;
alter table public.counterparts enable row level security;
alter table public.app_counters enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.proposal_change_logs enable row level security;
alter table public.proposal_notes enable row level security;

create index if not exists proposals_control_code_idx on public.proposals(control_code);
create unique index if not exists proposals_control_code_unique_idx on public.proposals(control_code) where control_code <> '';
create index if not exists proposals_company_idx on public.proposals(company_id);
create index if not exists proposals_event_idx on public.proposals(event_id);
create index if not exists counterparts_event_idx on public.counterparts(event_id);
