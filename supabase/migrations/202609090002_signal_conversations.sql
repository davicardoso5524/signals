-- Private conversations for both Direct (two users) and Group (three or more users).
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  direct_user_low uuid references auth.users(id) on delete cascade,
  direct_user_high uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint conversations_group_name check (type = 'direct' or (name is not null and length(btrim(name)) between 1 and 80)),
  constraint conversations_direct_pair check (type = 'group' or (direct_user_low is not null and direct_user_high is not null and direct_user_low < direct_user_high))
);

create unique index if not exists conversations_direct_pair_unique
  on public.conversations (direct_user_low, direct_user_high) where type = 'direct';
create index if not exists conversations_activity_idx on public.conversations(last_message_at, created_at);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_participants_user_idx on public.conversation_participants(user_id, conversation_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint messages_content_not_blank check (length(btrim(content)) > 0)
);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

create or replace function public.is_conversation_participant(target_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_participants where conversation_id = target_conversation_id and user_id = auth.uid());
$$;

drop policy if exists "Participants can read conversations" on public.conversations;
create policy "Participants can read conversations" on public.conversations for select to authenticated
  using (public.is_conversation_participant(id));
drop policy if exists "Participants can read participant lists" on public.conversation_participants;
create policy "Participants can read participant lists" on public.conversation_participants for select to authenticated
  using (public.is_conversation_participant(conversation_id));
drop policy if exists "Participants can read messages" on public.messages;
create policy "Participants can read messages" on public.messages for select to authenticated
  using (public.is_conversation_participant(conversation_id));
drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_participant(conversation_id));

create or replace function public.update_conversation_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists messages_update_conversation_activity on public.messages;
create trigger messages_update_conversation_activity after insert on public.messages
for each row execute function public.update_conversation_activity();

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
  insert into public.conversation_participants(conversation_id, user_id)
  values (result.id, current_user_id), (result.id, target_user_id) on conflict do nothing;
  return result;
end;
$$;

create or replace function public.create_group_conversation(group_name text, participant_ids uuid[])
returns public.conversations language plpgsql security definer set search_path = public as $$
declare current_user_id uuid := auth.uid(); result public.conversations; unique_ids uuid[];
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if length(btrim(coalesce(group_name, ''))) = 0 or length(btrim(group_name)) > 80 then raise exception 'Invalid group name'; end if;
  select array_agg(distinct id) into unique_ids from unnest(coalesce(participant_ids, '{}'::uuid[])) as id where id <> current_user_id;
  if coalesce(array_length(unique_ids, 1), 0) < 2 then raise exception 'A group needs at least two other people'; end if;
  if exists (select 1 from unnest(unique_ids) id where not exists (select 1 from public.profiles where profiles.id = id)) then raise exception 'Profile not found'; end if;
  insert into public.conversations(type, name, created_by) values ('group', btrim(group_name), current_user_id) returning * into result;
  insert into public.conversation_participants(conversation_id, user_id) values (result.id, current_user_id);
  insert into public.conversation_participants(conversation_id, user_id) select result.id, id from unnest(unique_ids) as id;
  return result;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public;
revoke all on function public.create_group_conversation(text, uuid[]) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
