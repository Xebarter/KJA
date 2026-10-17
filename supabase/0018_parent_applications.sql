-- Attach earlier admission applications to the parent account that submitted them.
-- Safe to re-run.

create index if not exists applications_email_lower_idx on public.applications (lower(email));

-- Links unsigned applications when the signed-in parent has a confirmed email that matches,
-- or when the admission payment was started from this same account.
create or replace function public.claim_application_links()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mail text;
  linked integer;
begin
  if uid is null then
    return 0;
  end if;

  select lower(email) into mail
  from auth.users
  where id = uid and email_confirmed_at is not null;

  update public.applications as application
  set user_id = uid
  where application.user_id is null
    and (
      (mail is not null and mail <> '' and lower(application.email) = mail)
      or exists (
        select 1
        from public.admission_payments as payment
        where payment.user_id = uid
          and (
            payment.application_id = application.id
            or (application.payment_id is not null and payment.id = application.payment_id)
          )
      )
    );

  get diagnostics linked = row_count;
  return linked;
end;
$$;

revoke all on function public.claim_application_links() from public, anon;
grant execute on function public.claim_application_links() to authenticated;
