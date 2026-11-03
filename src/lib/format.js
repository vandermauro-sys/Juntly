const LOCALES = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' }

// Datas no formato YYYY-MM-DD são tratadas como dia local, sem fuso
export function parseDay(day) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function fmtDay(day, lang = 'pt', opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  if (!day) return ''
  return parseDay(day).toLocaleDateString(LOCALES[lang] || 'pt-BR', opts)
}

export function fmtShortDay(day, lang = 'pt') {
  return fmtDay(day, lang, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function fmtTime(t) {
  return t ? t.slice(0, 5) : ''
}

export function fmtDateTime(ts, lang = 'pt') {
  return new Date(ts).toLocaleString(LOCALES[lang] || 'pt-BR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

export function todayISO() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function mapsLink(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export function groupBy(list, keyFn) {
  return list.reduce((acc, item) => {
    const k = keyFn(item)
    ;(acc[k] ||= []).push(item)
    return acc
  }, {})
}

// Um item vale para o participante se não tem grupo ou é do grupo dele
export function forGroup(item, groupLabel) {
  return !item.group_label || (groupLabel && item.group_label === groupLabel)
}

export function joinUrl(code) {
  return `${window.location.origin}/j/${code}`
}
