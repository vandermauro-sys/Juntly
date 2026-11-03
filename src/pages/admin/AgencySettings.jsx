import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useSession } from '../../lib/session'

const ROLE_LABEL = { owner: 'Dono', admin: 'Administrador', coordinator: 'Coordenador' }

export default function AgencySettings({ agency, onSaved }) {
  const { session } = useSession()
  const [name, setName] = useState(agency.name)
  const [color, setColor] = useState(agency.brand_color || '#E85D2F')
  const [members, setMembers] = useState([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('coordinator')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function loadMembers() {
    const { data } = await supabase.rpc('list_agency_members', { a: agency.id })
    setMembers(data || [])
  }
  useEffect(() => { loadMembers() }, [agency.id])

  async function save(e) {
    e.preventDefault()
    setError(''); setMsg('')
    const { error } = await supabase.from('agencies').update({ name, brand_color: color }).eq('id', agency.id)
    if (error) return setError(errMsg(error))
    setMsg('Salvo.'); onSaved()
  }

  async function uploadLogo(e) {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    const ext = file.name.split('.').pop()
    const path = `${agency.id}/logo-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('branding').upload(path, file, { upsert: true })
    if (upErr) return setError(errMsg(upErr))
    const { data } = supabase.storage.from('branding').getPublicUrl(path)
    const { error } = await supabase.from('agencies').update({ logo_url: data.publicUrl }).eq('id', agency.id)
    if (error) return setError(errMsg(error))
    setMsg('Logo atualizado.'); onSaved()
  }

  async function addMember(e) {
    e.preventDefault()
    setError(''); setMsg('')
    const { error } = await supabase.rpc('add_agency_member', { a: agency.id, member_email: email.trim(), member_role: role })
    if (error) return setError(errMsg(error))
    setEmail(''); setMsg('Pessoa adicionada à equipe.'); loadMembers()
  }

  async function removeMember(userId) {
    if (!confirm('Remover esta pessoa da equipe?')) return
    const { error } = await supabase.from('agency_members').delete().eq('agency_id', agency.id).eq('user_id', userId)
    if (error) return setError(errMsg(error))
    loadMembers()
  }

  return (
    <div className="card">
      <h2>Agência e equipe</h2>
      {error && <div className="error">{error}</div>}
      {msg && <p className="badge good">{msg}</p>}
      <form onSubmit={save}>
        <div className="row">
          <div className="field"><label>Nome</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field" style={{ flex: '0 0 140px' }}>
            <label>Cor da marca</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ height: 46, padding: 4 }} />
          </div>
        </div>
        <div className="field">
          <label>Logo (aparece no app do participante)</label>
          <div className="row" style={{ alignItems: 'center' }}>
            {agency.logo_url && <img src={agency.logo_url} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flex: 'none' }} />}
            <input type="file" accept="image/*" onChange={uploadLogo} />
          </div>
        </div>
        <button className="btn">Salvar</button>
      </form>

      <h3 style={{ marginTop: 24 }}>Equipe</h3>
      <div className="table-wrap">
        <table>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td>{m.email}</td>
                <td><span className="badge">{ROLE_LABEL[m.role]}</span></td>
                <td style={{ textAlign: 'right' }}>
                  {m.role !== 'owner' && m.user_id !== session.user.id && (
                    <button className="btn ghost small" onClick={() => removeMember(m.user_id)}>Remover</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={addMember} style={{ marginTop: 14 }}>
        <p className="muted">A pessoa precisa ter entrado no Juntly uma vez (pelo link de acesso por e-mail) antes de ser adicionada.</p>
        <div className="row">
          <div className="field"><label>E-mail</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field" style={{ flex: '0 0 180px' }}>
            <label>Papel</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="coordinator">Coordenador</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
        </div>
        <button className="btn secondary">Adicionar à equipe</button>
      </form>
    </div>
  )
}
