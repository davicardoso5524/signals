-- Hide a conversation for one participant, and remove it when nobody keeps it.
alter table public.conversation_participants
  add column if not exists deleted_at timestamptz;

create or replace function public.delete_signal_conversation_for_me(target_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare active_participants integer;
begin
  update public.conversation_participants
  set deleted_at = now()
  where conversation_id = target_conversation_id and user_id = auth.uid();
  if not found then raise exception 'Conversation not found'; end if;

  select count(*) into active_participants
  from public.conversation_participants
  where conversation_id = target_conversation_id and deleted_at is null;
  if active_participants = 0 then
    delete from public.conversations where id = target_conversation_id;
  end if;
end;
$$;

create or replace function public.get_or_create_direct_conversation(target_user_id uuid)
returns public.conversations language plpgsql security definer set search_path = public as $$
declare current_user_id uuid := auth.uid(); result public.conversations;
begin
  if current_user_id is null or target_user_id is null or target_user_id = current_user_id then raise exception 'Invalid conversation participant'; end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then raise exception 'Profile not found'; end if;
  insert into public.conversations(type, created_by, direct_user_low, direct_user_high)
  values ('direct', current_user_id, least(current_user_id, target_user_id), greatest(current_user_id, target_user_id))
  on conflict (direct_user_low, direct_user_high) where type = 'direct' do update set last_message_at = public.conversations.last_message_at
  returning * into result;
  insert into public.conversation_participants(conversation_id, user_id, deleted_at)
  values (result.id, current_user_id, null), (result.id, target_user_id, null)
  on conflict (conversation_id, user_id) do update set deleted_at = null;
  return result;
end;
$$;

revoke all on function public.delete_signal_conversation_for_me(uuid) from public;
grant execute on function public.delete_signal_conversation_for_me(uuid) to authenticated;
grant update on public.conversation_participants to authenticated;
