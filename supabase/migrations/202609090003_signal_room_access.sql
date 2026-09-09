-- Secure Room creation and code-based joining. Existing Room data is preserved.
create or replace function public.create_signal_room(
  room_name text,
  room_code text,
  room_kind text default 'persistent',
  room_access text default 'invite'
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  created_room public.rooms;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if length(btrim(coalesce(room_name, ''))) = 0 then raise exception 'Room name is required'; end if;
  if length(btrim(coalesce(room_code, ''))) = 0 then raise exception 'Room code is required'; end if;
  if room_kind not in ('quick', 'persistent') then raise exception 'Invalid room kind'; end if;
  if room_access not in ('invite', 'password', 'request') then raise exception 'Invalid room access'; end if;

  insert into public.rooms(owner_id, name, code, kind, access)
  values (current_user_id, btrim(room_name), upper(btrim(room_code)), room_kind, room_access)
  returning * into created_room;

  insert into public.room_members(room_id, user_id)
  values (created_room.id, current_user_id);

  return created_room;
end;
$$;

create or replace function public.join_signal_room_by_code(room_code text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  found_room public.rooms;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;

  select * into found_room
  from public.rooms
  where upper(code) = upper(btrim(coalesce(room_code, '')))
  limit 1;

  if found_room.id is null then raise exception 'Room not found'; end if;

  insert into public.room_members(room_id, user_id)
  values (found_room.id, current_user_id)
  on conflict (room_id, user_id) do nothing;

  return found_room;
end;
$$;

-- Room creation and membership entry are available only through the RPCs above.
drop policy if exists "Users can create rooms" on public.rooms;
drop policy if exists "Users can join rooms" on public.room_members;

revoke all on function public.create_signal_room(text, text, text, text) from public;
revoke all on function public.join_signal_room_by_code(text) from public;
grant execute on function public.create_signal_room(text, text, text, text) to authenticated;
grant execute on function public.join_signal_room_by_code(text) to authenticated;
