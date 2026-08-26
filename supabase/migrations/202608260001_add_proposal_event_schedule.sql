alter table public.proposals
  add column if not exists event_date text not null default '',
  add column if not exists event_location text not null default '';
