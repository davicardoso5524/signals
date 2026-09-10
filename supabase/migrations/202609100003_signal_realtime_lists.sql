-- Keep room and direct-conversation lists in sync without requiring an app restart.
do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.room_members;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.conversation_participants;
exception when duplicate_object then null;
end $$;
