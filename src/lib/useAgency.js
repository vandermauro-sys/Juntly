import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useSession } from './session'

// Carrega a agência do usuário logado (a primeira, no MVP) e o papel dele
export function useAgency() {
  const { session } = useSession()
  const [agency, setAgency] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!session) return
    setLoading(true)
    const { data } = await supabase
      .from('agency_members')
      .select('role, agencies(*)')
      .eq('user_id', session.user.id)
      .order('created_at')
      .limit(1)
    const m = data && data[0]
    setAgency(m ? m.agencies : null)
    setRole(m ? m.role : null)
    setLoading(false)
  }, [session])

  useEffect(() => { reload() }, [reload])

  return { agency, role, loading, reload, isAdmin: role === 'owner' || role === 'admin' }
}
