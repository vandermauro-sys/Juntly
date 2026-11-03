import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../../../lib/supabase'
import { useSession } from '../../../lib/session'
import { fmtDateTime } from '../../../lib/format'

export default function Announcements({ trip, groups }) {
  const { session } = useSession()
  const [list, setList] = useState([])
  const [form, setForm] = useState({ title: '', body: '', group_label: '', urgent: false })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('announcements').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false })
    setList(data || [])
  }
  useEffect(() => { load() }, [trip.id])

  async function send(e) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.from('announcements').insert({
      trip_id: trip.id,
      title: form.title.trim(),
      body: form.body.trim() || null,
      group_label: form.group_label || null,
      urgent: form.urgent,
      created_by: session.user.id
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setForm({ title: '', body: '', group_label: '', urgent: false })
    load()
  }

  async function remove(a) {
    if (!confirm('Apagar este aviso?')) return
    await supabase.from('announcements').delete().eq('id', a.id)
    load()
  }

  return (
    <div className="stack">
      <form className="card" onSubmit={send}>
        <h3>Enviar aviso</h3>
        <p className="muted">Separado do bate-papo: o aviso chega na hora para quem está com o app aberto e fica salvo na aba Avisos.</p>
        {error && <div className="error">{error}</div>}
        <div className="field"><label>Título</label><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ônibus sai 15 minutos mais cedo" /></div>
        <div className="field"><label>Mensagem</label><textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="field">
            <label>Para</label>
            <select value={form.group_label} onChange={(e) => setForm({ ...form, group_label: e.target.value })}>
              <option value="">Todo o grupo</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <label className="check field">
            <input type="checkbox" checked={form.urgent} onChange={(e) => setForm({ ...form, urgent: e.target.checked })} />
            Marcar como urgente
          </label>
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Enviando…' : 'Enviar aviso'}</button>
      </form>

      {list.map((a) => (
        <div className="card" key={a.id}>
          <div className="split">
            <div>
              <strong>{a.title}</strong> {a.urgent && <span className="badge bad">Urgente</span>} {a.group_label && <span className="badge">{a.group_label}</span>}
              <div className="muted">{fmtDateTime(a.created_at)}</div>
            </div>
            <button className="btn ghost small" onClick={() => remove(a)}>Apagar</button>
          </div>
          {a.body && <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{a.body}</p>}
        </div>
      ))}
    </div>
  )
}
