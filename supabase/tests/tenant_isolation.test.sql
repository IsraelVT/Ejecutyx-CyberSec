begin;
select plan(8);
insert into auth.users(id,email) values
  ('11111111-1111-1111-1111-111111111111','owner-a@example.com'),
  ('22222222-2222-2222-2222-222222222222','owner-b@example.com');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select is((select count(*)::integer from public.organizations),1,'tenant A sees one organization');
select is((select count(*)::integer from public.memberships),1,'tenant A sees its membership');
select is((select count(*)::integer from public.assets),0,'tenant A sees no unowned assets');
select throws_ok($$insert into public.assets(organization_id,type,value) select id,'domain','evil.mx' from public.organizations limit 1$$,'42501',null,'browser cannot insert assets');

select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',true);
select is((select count(*)::integer from public.organizations),1,'tenant B sees one organization');
select is((select count(*)::integer from public.memberships),1,'tenant B sees its membership');
select is((select count(*)::integer from public.findings),0,'tenant B sees no foreign findings');
select throws_ok($$delete from public.organizations$$,'42501',null,'browser cannot delete organizations');
select * from finish();
rollback;
