-- Removing a friend deletes the friendship relation, while direct messages remain available.
create or replace function public.remove_signal_friendship(friendship_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
  where id = friendship_id
    and status = 'accepted'
    and (requester_id = auth.uid() or addressee_id = auth.uid());
  if not found then raise exception 'Friendship not found'; end if;
end;
$$;

revoke all on function public.remove_signal_friendship(uuid) from public;
grant execute on function public.remove_signal_friendship(uuid) to authenticated;
