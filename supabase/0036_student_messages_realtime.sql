-- Instant classmate chat: stream new rows to participants via Supabase Realtime.
-- RLS on student_messages still applies to realtime payloads.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'student_messages'
  ) then
    alter publication supabase_realtime add table public.student_messages;
  end if;
end $$;
