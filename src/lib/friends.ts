import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './conversations'

export type FriendshipStatus = 'pending' | 'accepted' | 'declined'
export type Friendship = {
  id: string
  requester_id: string
  addressee_id: string
  status: FriendshipStatus
  created_at: string
  updated_at: string
  person: Profile
  direction: 'incoming' | 'outgoing'
}

function api() { if (!supabase) throw new Error('Supabase is not configured'); return supabase }

export async function listFriendships(userId: string) {
  const client = api()
  const { data, error } = await client.from('friendships').select('id,requester_id,addressee_id,status,created_at,updated_at').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`).order('updated_at', { ascending: false })
  if (error) throw error
  const rows = data || []
  const ids = [...new Set(rows.map((row) => row.requester_id === userId ? row.addressee_id : row.requester_id))]
  const { data: profiles, error: profileError } = ids.length ? await client.from('profiles').select('id,username,display_name,avatar_url').in('id', ids) : { data: [], error: null }
  if (profileError) throw profileError
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile as Profile]))
  return rows.flatMap((row) => {
    const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id
    const person = profileById.get(otherId)
    return person ? [{ ...row, person, direction: row.addressee_id === userId ? 'incoming' as const : 'outgoing' as const }] : []
  }) as Friendship[]
}

export async function sendFriendRequest(targetUserId: string) {
  const { data, error } = await api().rpc('send_signal_friend_request', { target_user_id: targetUserId }).single()
  if (error) throw error
  return data as Friendship
}

export async function respondToFriendRequest(friendshipId: string, accept: boolean) {
  const { data, error } = await api().rpc('respond_signal_friend_request', { friendship_id: friendshipId, accept_request: accept }).single()
  if (error) throw error
  return data as Friendship
}

export async function removeFriend(friendshipId: string) {
  const { error } = await api().rpc('remove_signal_friendship', { friendship_id: friendshipId })
  if (error) throw error
}

export function subscribeToFriendships(onChange: () => void) {
  const client = supabase
  if (!client) return () => undefined
  const channel: RealtimeChannel = client.channel('signal-friendships').on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, onChange).subscribe()
  return () => { void client.removeChannel(channel) }
}
