import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from './Logo'

export default function AdminTopbar({ agency }) {
  const nav = useNavigate()
  async function logout() {
    await supabase.auth.signOut()
    nav('/')
  }
  return (
    <div className="topbar">
      <Logo to="/admin" />
      <div className="row" style={{ flex: 'none', alignItems: 'center' }}>
        {agency && <span className="muted hide-mobile">{agency.name}</span>}
        <button className="btn ghost small" onClick={logout}>Sair</button>
      </div>
    </div>
  )
}
