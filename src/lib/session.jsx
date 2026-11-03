import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const SessionContext = createContext({ session: null, loading: true })

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return <SessionContext.Provider value={{ session, loading }}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext)
}

export function isStaffSession(session) {
  return Boolean(session && !session.user.is_anonymous)
}
