-- Persistent rooms, membership, chat history and read state for SIGNAL.
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  code text not null unique,
  kind text not null default 'persistent' check (kind in ('quick', 'persistent')),
  access text not null default 'invite' check (access in ('invite', 'password', 'request')),
  created_at timestamptz not null default now(),
  constraint rooms_name_not_blank check (length(btrim(name)) > 0)
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint room_messages_content_not_blank check (length(btrim(content)) > 0)
);

create index if not exists room_messages_room_created_idx on public.room_messages(room_id, created_at);

create table if not exists public.room_read_states (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_message_id uuid references public.room_messages(id) on delete set null,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_messages enable row level security;
alter table public.room_read_states enable row level security;

create or replace function public.is_signal_room_member(target_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_members where room_id = target_room_id and user_id = auth.uid());
$$;

drop policy if exists "Members can read rooms" on public.rooms;
create policy "Members can read rooms" on public.rooms for select to authenticated
  using (owner_id = auth.uid() or public.is_signal_room_member(id));

drop policy if exists "Users can create rooms" on public.rooms;
create policy "Users can create rooms" on public.rooms for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Owners can update rooms" on public.rooms;
create policy "Owners can update rooms" on public.rooms for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "Members can read memberships" on public.room_members;
create policy "Members can read memberships" on public.room_members for select to authenticated
  using (user_id = auth.uid() or public.is_signal_room_member(room_id));

drop policy if exists "Users can join rooms" on public.room_members;
create policy "Users can join rooms" on public.room_members for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Members can read messages" on public.room_messages;
create policy "Members can read messages" on public.room_messages for select to authenticated
  using (public.is_signal_room_member(room_id));

drop policy if exists "Members can send messages" on public.room_messages;
create policy "Members can send messages" on public.room_messages for insert to authenticated
  with check (author_id = auth.uid() and public.is_signal_room_member(room_id));

drop policy if exists "Users can read their read state" on public.room_read_states;
create policy "Users can read their read state" on public.room_read_states for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can write their read state" on public.room_read_states;
create policy "Users can write their read state" on public.room_read_states for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their read state" on public.room_read_states;
create policy "Users can update their read state" on public.room_read_states for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Add chat events to Supabase Realtime once per project.
do $$ begin
  alter publication supabase_realtime add table public.room_messages;
exception when duplicate_object then null;
end $$;
