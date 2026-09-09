import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type RoomRecord = { id: string; owner_id: string; name: string; code: string; kind: 'quick' | 'persistent'; access: 'invite' | 'password' | 'request'; created_at: string }
export type MessageRecord = { id: string; room_id: string; author_id: string; content: string; created_at: string; author?: { username: string; display_name: string } | null }

export async function createRoom(input: Pick<RoomRecord, 'name' | 'code' | 'kind' | 'access'>, userId: string) {
  if (!supabase) return null
  const { data, error } = await supabase.from('rooms').insert({ ...input, owner_id: userId }).select('*').single()
  if (error) throw error
  const membership = await supabase.from('room_members').insert({ room_id: data.id, user_id: userId })
  if (membership.error) throw membership.error
  return data as RoomRecord
}

export async function listRooms() {
  if (!supabase) return [] as RoomRecord[]
  const { data, error } = await supabase.from('rooms').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as RoomRecord[]
}

export async function listMessages(roomId: string) {
  if (!supabase) return [] as MessageRecord[]
  const { data, error } = await supabase.from('room_messages').select('id,room_id,author_id,content,created_at,author:profiles!room_messages_author_id_fkey(username,display_name)').eq('room_id', roomId).order('created_at', { ascending: true })
  if (error) throw error
  return (data || []) as unknown as MessageRecord[]
}

export async function sendRoomMessage(roomId: string, authorId: string, content: string) {
  if (!supabase) return null
  const { data, error } = await supabase.from('room_messages').insert({ room_id: roomId, author_id: authorId, content }).select('id,room_id,author_id,content,created_at,author:profiles!room_messages_author_id_fkey(username,display_name)').single()
  if (error) throw error
  return data as unknown as MessageRecord
}

export function subscribeToRoomMessages(roomId: string, onMessage: (message: MessageRecord) => void) {
  const client = supabase
  if (!client) return () => undefined
  const channel: RealtimeChannel = client.channel(`room-messages:${roomId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` }, async (payload) => {
    const message = payload.new as MessageRecord
    const { data } = await client.from('room_messages').select('id,room_id,author_id,content,created_at,author:profiles!room_messages_author_id_fkey(username,display_name)').eq('id', message.id).single()
    onMessage((data as unknown as MessageRecord) || message)
  }).subscribe()
  return () => { void client.removeChannel(channel) }
}
