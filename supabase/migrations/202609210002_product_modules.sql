create type public.incident_severity as enum ('critical','high','medium','low');
create type public.incident_status as enum ('open','contained','resolved');

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  description text not null default '',
  severity public.incident_severity not null default 'medium',
  status public.incident_status not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index incidents_org_date_idx on public.incidents(organization_id,created_at desc);

alter table public.incidents enable row level security;
revoke all on public.incidents from anon, authenticated;
grant select on public.incidents to authenticated;
create policy incidents_select on public.incidents for select to authenticated
  using (public.is_org_member(organization_id));

grant select on public.audit_events to authenticated;
create policy audit_events_select on public.audit_events for select to authenticated
  using (public.is_org_member(organization_id));

alter table public.organizations add column if not exists sector text;
alter table public.organizations add column if not exists employee_count integer check (employee_count is null or employee_count > 0);

