import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useSession, isStaffSession } from '../lib/session'
import Logo from '../components/Logo'

export default function Login() {
  const { session, loading } = useSession()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!loading && isStaffSession(session)) return <Navigate to="/admin" replace />

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    // Se havia uma sessão anônima de participante neste aparelho, encerra antes
    if (session?.user?.is_anonymous) await supabase.auth.signOut()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/admin` }
    })
    setBusy(false)
    if (error) setError(errMsg(error))
    else setSent(true)
  }

  return (
    <div className="center-page">
      <div className="card center-card">
        <Logo />
        <h2 style={{ marginTop: 18 }}>Entrar no painel da agência</h2>
        {sent ? (
          <p>Enviamos um link de acesso para <strong>{email}</strong>. Abra o e-mail neste aparelho e toque no link.</p>
        ) : (
          <form onSubmit={submit}>
            <p className="muted">Sem senha: você recebe um link de acesso por e-mail.</p>
            {error && <div className="error">{error}</div>}
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@agencia.com" />
            </div>
            <button className="btn block" disabled={busy}>{busy ? 'Enviando…' : 'Receber link de acesso'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
