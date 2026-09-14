-- Prepared from a read-only snapshot on 2026-09-14T15:33:04.665Z.
-- 30 existing Cursos Externos proposals. Explicit IDs exclude future proposals.
-- COPA, statuses, control codes and event registrations remain unchanged.
begin;
-- RLS was already enabled in production; preserve it explicitly.
alter table public.proposal_change_logs enable row level security;
-- Leave historical proposals unclassified until explicitly reviewed.
alter table public.proposals add column if not exists realization_year text not null default ''
  check (realization_year = '' or realization_year ~ '^(19|20|21)[0-9]{2}$');

with targets(id) as (values
('003a7eba-ca08-4a10-934f-77e9888452e4'::uuid),
('007cd132-3fb5-4646-af7a-5597a3f1de32'::uuid),
('03f979b2-0419-4a68-ad03-ba48a1be4ecb'::uuid),
('1138a546-9b93-4133-8c8d-2afbf9970edb'::uuid),
('33382b57-f07a-4a26-882c-e00daf90a3c0'::uuid),
('3df44761-a04f-48da-8128-80e31c462990'::uuid),
('51833323-be79-4231-80a1-72747f4cef7b'::uuid),
('54f528d2-5db9-4175-b6b4-eb29c7555ee7'::uuid),
('59e89aff-3b46-440a-9b7f-df874c8e63a9'::uuid),
('5ac91cec-4b3b-4989-949f-ac2f5b62d0f1'::uuid),
('60428fc3-7f46-40bb-870c-d0534f076273'::uuid),
('66be4405-9c4f-4c8d-9646-fec648515f43'::uuid),
('7077262b-a27d-4018-94cd-0da06865ea17'::uuid),
('7eb18197-441a-4710-bc2b-b190de1df0cb'::uuid),
('8764c4cc-6d1c-4753-9e00-678f098b5ab2'::uuid),
('89812095-48ee-45dd-8773-f97d3d95d284'::uuid),
('9294635a-aa76-468b-a599-a6b1a6360b2e'::uuid),
('98131ad9-53df-4d50-954f-b369dbf6f550'::uuid),
('a80c15f8-50b7-4ff0-a0ac-6318002c77a2'::uuid),
('a8669f23-4770-46be-a67d-194488862b8d'::uuid),
('b02421a5-c2c2-459b-8025-a3caed174af9'::uuid),
('b61c71ba-b98d-4521-8f00-ce37909439a3'::uuid),
('bad9c020-ff88-42be-99fc-0d425b31d67f'::uuid),
('bfd87323-76d6-4749-9949-107728c73313'::uuid),
('c2f3acdd-651d-4a7d-a4d7-9fec011671c8'::uuid),
('cd26bb15-6c5f-4c80-bac0-c7d8ee4decb6'::uuid),
('e1bdb37e-f285-44e6-a014-26eb1b937990'::uuid),
('e5f29b25-a23a-4b1b-b9bb-8e4f3c9a76ea'::uuid),
('ea5f8ef3-cc41-4623-915d-452a5996788c'::uuid),
('fe79e2a0-236a-4b64-a849-1837e29032dd'::uuid)
), before_rows as materialized (
  select p.* from public.proposals p join targets t on t.id=p.id
  where p.realization_year = '' and p.event_id is distinct from '61d678a6-c8cb-45e7-aa53-09a853a29926'::uuid
  for update of p
), changed as (
  update public.proposals p set realization_year='2026'
  from before_rows b where p.id=b.id returning p.id
)
insert into public.proposal_change_logs
  (proposal_id,control_code,proposal_title,company_id,company_name,event_id,event_name,action,changed_by_name,changes)
select b.id,b.control_code,b.title,b.company_id,coalesce(c.name,''),b.event_id,coalesce(e.name,''),
  'Atualizacao','Sistema — classificação inicial solicitada por Julia',
  jsonb_build_array(jsonb_build_object('field','realizationYear','label','Ano de realização','from',b.realization_year,'to','2026'))
from before_rows b join changed x on x.id=b.id
left join public.companies c on c.id=b.company_id
left join public.events e on e.id=b.event_id;
commit;
