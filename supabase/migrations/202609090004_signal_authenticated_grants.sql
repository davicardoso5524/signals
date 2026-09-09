-- Grant the table privileges required for the existing authenticated RLS policies.
-- RLS remains the authorization boundary; these grants only allow PostgREST
-- to evaluate the policies for signed-in users.
grant select, insert, update on public.profiles to authenticated;

grant select, insert, update on public.rooms to authenticated;
grant select on public.room_members to authenticated;
grant select, insert on public.room_messages to authenticated;
grant select, insert, update on public.room_read_states to authenticated;

grant select on public.conversations to authenticated;
grant select on public.conversation_participants to authenticated;
grant select, insert on public.messages to authenticated;
