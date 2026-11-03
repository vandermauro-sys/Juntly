// Viagens em que o participante já entrou neste aparelho
const KEY = 'juntly-my-trips'

export function getMyTrips() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export function rememberTrip(trip) {
  const list = getMyTrips().filter((t) => t.id !== trip.id)
  list.unshift({ id: trip.id, name: trip.name })
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10))) } catch { /* sem armazenamento */ }
}

export function forgetTrip(id) {
  try { localStorage.setItem(KEY, JSON.stringify(getMyTrips().filter((t) => t.id !== id))) } catch { /* */ }
}

// Cópia local dos dados da viagem para abrir sem internet
export function saveCache(tripId, data) {
  try { localStorage.setItem(`juntly-cache-${tripId}`, JSON.stringify(data)) } catch { /* */ }
}

export function readCache(tripId) {
  try { return JSON.parse(localStorage.getItem(`juntly-cache-${tripId}`) || 'null') } catch { return null }
}
