import { supabase } from './supabase'

// Fila de check-ins para quando o coordenador estiver sem internet.
// Os check-ins ficam no aparelho e são enviados assim que a conexão volta.
const KEY = 'juntly-checkin-queue'

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* sem armazenamento */ }
}

export function pendingCount() {
  return read().length
}

export function pendingFor(checkpointId) {
  return read().filter((c) => c.checkpoint_id === checkpointId).map((c) => c.participant_id)
}

export function enqueue(checkin) {
  const list = read()
  if (!list.some((c) => c.checkpoint_id === checkin.checkpoint_id && c.participant_id === checkin.participant_id)) {
    list.push({ ...checkin, checked_at: new Date().toISOString() })
    write(list)
  }
}

export async function flush() {
  const list = read()
  if (!list.length || !navigator.onLine) return 0
  const { error } = await supabase
    .from('checkins')
    .upsert(list, { onConflict: 'checkpoint_id,participant_id', ignoreDuplicates: true })
  if (error) return 0
  write([])
  return list.length
}

// Faz o check-in: tenta enviar direto e, sem conexão, guarda na fila
export async function checkIn(checkpointId, participantId, userId) {
  const row = { checkpoint_id: checkpointId, participant_id: participantId, checked_by: userId }
  if (!navigator.onLine) { enqueue(row); return { queued: true } }
  const { error } = await supabase
    .from('checkins')
    .upsert(row, { onConflict: 'checkpoint_id,participant_id', ignoreDuplicates: true })
  if (error) { enqueue(row); return { queued: true } }
  return { queued: false }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flush() })
}
