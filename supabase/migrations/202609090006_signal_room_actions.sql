-- Secure actions for private Room management.
create or replace function public.list_signal_room_members(target_room_id uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_signal_room_member(target_room_id) then raise exception 'Room membership required'; end if;

  return query
    select rm.user_id, p.username, p.display_name, p.avatar_url, rm.joined_at
    from public.room_members rm
    join public.profiles p on p.id = rm.user_id
    where rm.room_id = target_room_id
    order by rm.joined_at asc;
end;
$$;

create or replace function public.rename_signal_room(target_room_id uuid, new_name text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare updated_room public.rooms;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(btrim(coalesce(new_name, ''))) = 0 or length(btrim(new_name)) > 80 then raise exception 'Invalid room name'; end if;

  update public.rooms
  set name = btrim(new_name)
  where id = target_room_id and owner_id = auth.uid()
  returning * into updated_room;

  if updated_room.id is null then raise exception 'Only the room owner can rename it'; end if;
  return updated_room;
end;
$$;

create or replace function public.delete_signal_room(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.rooms where id = target_room_id and owner_id = auth.uid();
  if not found then raise exception 'Only the room owner can delete it'; end if;
end;
$$;

create or replace function public.leave_signal_room(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.rooms where id = target_room_id and owner_id = auth.uid()) then
    raise exception 'The room owner cannot leave the room';
  end if;
  delete from public.room_members where room_id = target_room_id and user_id = auth.uid();
  if not found then raise exception 'Room membership not found'; end if;
end;
$$;

create or replace function public.remove_signal_room_member(target_room_id uuid, target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_user_id = auth.uid() then raise exception 'The owner cannot remove themselves'; end if;
  if not exists (select 1 from public.rooms where id = target_room_id and owner_id = auth.uid()) then
    raise exception 'Only the room owner can remove members';
  end if;
  delete from public.room_members where room_id = target_room_id and user_id = target_user_id;
  if not found then raise exception 'Room membership not found'; end if;
end;
$$;

revoke all on function public.list_signal_room_members(uuid) from public;
revoke all on function public.rename_signal_room(uuid, text) from public;
revoke all on function public.delete_signal_room(uuid) from public;
revoke all on function public.leave_signal_room(uuid) from public;
revoke all on function public.remove_signal_room_member(uuid, uuid) from public;
grant execute on function public.list_signal_room_members(uuid) to authenticated;
grant execute on function public.rename_signal_room(uuid, text) to authenticated;
grant execute on function public.delete_signal_room(uuid) to authenticated;
grant execute on function public.leave_signal_room(uuid) to authenticated;
grant execute on function public.remove_signal_room_member(uuid, uuid) to authenticated;
