import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key)

export const supabase = isConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

// Mensagem de erro amigável a partir de um erro do Supabase
export function errMsg(error) {
  if (!error) return ''
  return error.message || String(error)
}

// URLs assinadas para fotos privadas (válidas por 1 hora)
export async function signedPhotoUrls(paths) {
  if (!paths.length) return {}
  const { data, error } = await supabase.storage.from('photos').createSignedUrls(paths, 3600)
  if (error) throw error
  const map = {}
  data.forEach((d) => { if (d.signedUrl) map[d.path] = d.signedUrl })
  return map
}
