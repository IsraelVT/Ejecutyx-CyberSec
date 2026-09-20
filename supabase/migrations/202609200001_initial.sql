create extension if not exists pgcrypto;

create type public.member_role as enum ('owner','admin','analyst','viewer');
create type public.asset_type as enum ('domain','website','email','device');
create type public.verification_status as enum ('pending','verified','failed');
create type public.finding_severity as enum ('critical','high','medium','low','info');
create type public.finding_status as enum ('open','accepted','resolved');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (organization_id,user_id)
);
create index memberships_user_id_idx on public.memberships(user_id);
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type public.asset_type not null,
  value text not null,
  verification_status public.verification_status not null default 'pending',
  verification_token uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id,type,value)
);
create index assets_organization_idx on public.assets(organization_id);
create table public.scan_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  checks jsonb not null default '{}'::jsonb,
  scanned_at timestamptz not null default now()
);
create index scan_results_org_date_idx on public.scan_results(organization_id,scanned_at desc);
create table public.findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete cascade,
  control_key text not null,
  title text not null,
  severity public.finding_severity not null,
  status public.finding_status not null default 'open',
  evidence text,
  score_impact integer not null default 0,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index findings_org_status_idx on public.findings(organization_id,status);
create unique index findings_one_open_control_idx on public.findings(asset_id,control_key) where status='open';
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_org_date_idx on public.audit_events(organization_id,created_at desc);

create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m where m.organization_id=org_id and m.user_id=(select auth.uid()));
$$;
create or replace function public.is_org_admin(org_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m where m.organization_id=org_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin'));
$$;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.assets enable row level security;
alter table public.scan_results enable row level security;
alter table public.findings enable row level security;
alter table public.audit_events enable row level security;
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on public.organizations,public.memberships,public.assets,public.scan_results,public.findings to authenticated;

create policy organizations_select on public.organizations for select to authenticated using (public.is_org_member(id));
create policy memberships_select on public.memberships for select to authenticated using (user_id=(select auth.uid()) or public.is_org_admin(organization_id));
create policy assets_select on public.assets for select to authenticated using (public.is_org_member(organization_id));
create policy scans_select on public.scan_results for select to authenticated using (public.is_org_member(organization_id));
create policy findings_select on public.findings for select to authenticated using (public.is_org_member(organization_id));

create or replace function public.bootstrap_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare new_org uuid;
begin
  insert into public.organizations(name,slug) values('TestCompCy','testcompcy-'||left(new.id::text,8)) returning id into new_org;
  insert into public.memberships(organization_id,user_id,role) values(new_org,new.id,'owner');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.bootstrap_new_user();
