-- SIGNAL public identity. Passwords and email remain exclusively in auth.users.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9._]{3,20}$'),
  constraint profiles_display_name_not_blank check (length(btrim(display_name)) > 0)
);

create unique index if not exists profiles_username_lower_unique on public.profiles (lower(username));
alter table public.profiles enable row level security;

create or replace function public.signal_profiles_set_updated_at() returns trigger
language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.signal_profiles_set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare requested_username text := lower(btrim(coalesce(new.raw_user_meta_data->>'username', '')));
declare requested_name text := btrim(coalesce(new.raw_user_meta_data->>'display_name', ''));
begin
  if requested_username !~ '^[a-z0-9._]{3,20}$' or requested_name = '' then
    raise exception 'Invalid public profile data';
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, requested_username, requested_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

drop policy if exists "Authenticated users can read public profiles" on public.profiles;
create policy "Authenticated users can read public profiles" on public.profiles
for select to authenticated using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
for insert to authenticated with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
