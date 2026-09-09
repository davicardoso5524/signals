-- Rooms are private: visibility is granted only by persisted membership.
drop policy if exists "Members can read rooms" on public.rooms;
create policy "Members can read rooms" on public.rooms for select to authenticated
  using (public.is_signal_room_member(id));

-- Membership rows are visible only inside rooms the current user belongs to.
drop policy if exists "Members can read memberships" on public.room_members;
create policy "Members can read memberships" on public.room_members for select to authenticated
  using (public.is_signal_room_member(room_id));
