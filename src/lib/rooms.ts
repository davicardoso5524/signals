import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type RoomRecord = { id: string; owner_id: string; name: string; code: string; kind: 'quick' | 'persistent'; access: 'invite' | 'password' | 'request'; created_at: string; member_count?: number }
export type MessageRecord = { id: string; room_id: string; author_id: string; content: string; created_at: string; author?: { username: string; display_name: string } | null }
export type RoomMemberRecord = { user_id: string; username: string; display_name: string; avatar_url: string | null; joined_at: string }

export async function createRoom(input: Pick<RoomRecord, 'name' | 'code' | 'kind' | 'access'>, userId: string) {
  if (!supabase) return null
  void userId
  const { data, error } = await supabase.rpc('create_signal_room', { room_name: input.name, room_code: input.code, room_kind: input.kind, room_access: input.access }).single()
  if (error) throw error
  return data as RoomRecord
}

export async function joinRoomByCode(roomCode: string) {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('join_signal_room_by_code', { room_code: roomCode.trim() }).single()
  if (error) throw error
  return data as RoomRecord
}

export async function listRoomMembers(roomId: string) {
  if (!supabase) return [] as RoomMemberRecord[]
  const { data, error } = await supabase.rpc('list_signal_room_members', { target_room_id: roomId })
  if (error) throw error
  return (data || []) as RoomMemberRecord[]
}

export async function renameRoom(roomId: string, name: string) {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('rename_signal_room', { target_room_id: roomId, new_name: name }).single()
  if (error) throw error
  return data as RoomRecord
}

export async function deleteRoom(roomId: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('delete_signal_room', { target_room_id: roomId })
  if (error) throw error
}

export async function leaveRoom(roomId: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('leave_signal_room', { target_room_id: roomId })
  if (error) throw error
}

export async function removeRoomMember(roomId: string, userId: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('remove_signal_room_member', { target_room_id: roomId, target_user_id: userId })
  if (error) throw error
}

export async function listRooms() {
  if (!supabase) return [] as RoomRecord[]
  const { data, error } = await supabase.from('rooms').select('id,owner_id,name,code,kind,access,created_at,room_members(user_id)').order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map((room) => ({ ...room, member_count: Array.isArray(room.room_members) ? room.room_members.length : 0 })) as unknown as RoomRecord[]
}

export function subscribeToRooms(onChange: () => void) {
  const client = supabase
  if (!client) return () => undefined
  const channel: RealtimeChannel = client.channel('signal-rooms-list')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members' }, onChange)
    .subscribe()
  return () => { void client.removeChannel(channel) }
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
