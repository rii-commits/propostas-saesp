-- Leave historical proposals unclassified until explicitly reviewed.
alter table public.proposals add column if not exists realization_year text not null default ''
  check (realization_year = '' or realization_year ~ '^(19|20|21)[0-9]{2}$');
