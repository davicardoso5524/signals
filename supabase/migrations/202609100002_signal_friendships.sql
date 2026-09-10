-- Friend requests and accepted friendships for SIGNAL. Direct messages remain independent.
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_distinct_users check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair_unique
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_status_idx on public.friendships(addressee_id, status);
create index if not exists friendships_requester_status_idx on public.friendships(requester_id, status);

alter table public.friendships enable row level security;

create or replace function public.signal_friendships_set_updated_at() returns trigger
language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at before update on public.friendships
for each row execute function public.signal_friendships_set_updated_at();

drop policy if exists "Users can read their friendships" on public.friendships;
create policy "Users can read their friendships" on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create or replace function public.send_signal_friend_request(target_user_id uuid)
returns public.friendships language plpgsql security definer set search_path = public as $$
declare current_user_id uuid := auth.uid(); result public.friendships;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if target_user_id is null or target_user_id = current_user_id then raise exception 'Invalid friend request'; end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then raise exception 'Profile not found'; end if;
  insert into public.friendships(requester_id, addressee_id, status)
  values (current_user_id, target_user_id, 'pending')
  on conflict (least(requester_id, addressee_id), greatest(requester_id, addressee_id)) do update
    set status = case when public.friendships.status = 'declined' then 'pending' else public.friendships.status end,
        requester_id = case when public.friendships.status = 'declined' then current_user_id else public.friendships.requester_id end,
        addressee_id = case when public.friendships.status = 'declined' then target_user_id else public.friendships.addressee_id end
  returning * into result;
  return result;
end;
$$;

create or replace function public.respond_signal_friend_request(friendship_id uuid, accept_request boolean)
returns public.friendships language plpgsql security definer set search_path = public as $$
declare result public.friendships;
begin
  update public.friendships
  set status = case when accept_request then 'accepted' else 'declined' end
  where id = friendship_id and addressee_id = auth.uid() and status = 'pending'
  returning * into result;
  if result.id is null then raise exception 'Friend request not found'; end if;
  return result;
end;
$$;

revoke all on function public.send_signal_friend_request(uuid) from public;
revoke all on function public.respond_signal_friend_request(uuid, boolean) from public;
grant execute on function public.send_signal_friend_request(uuid) to authenticated;
grant execute on function public.respond_signal_friend_request(uuid, boolean) to authenticated;
grant select on public.friendships to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;
