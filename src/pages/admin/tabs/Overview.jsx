import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, errMsg } from '../../../lib/supabase'
import { joinUrl, fmtDateTime } from '../../../lib/format'

export default function Overview({ trip, participants, reloadTrip, isAdmin }) {
  const nav = useNavigate()
  const [stats, setStats] = useState({ docsDone: 0, docsTotal: 0, photos: 0, surveys: 0, lastAnn: [] })
  const [form, setForm] = useState({
    name: trip.name, destination: trip.destination || '', start_date: trip.start_date || '',
    end_date: trip.end_date || '', emergency_phone: trip.emergency_phone || ''
  })
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const link = joinUrl(trip.code)
  const joined = participants.filter((p) => p.user_id).length

  useEffect(() => {
    async function load() {
      const [{ data: reqs }, { data: status }, { count: photos }, { count: surveys }, { data: lastAnn }] = await Promise.all([
        supabase.from('doc_requirements').select('id').eq('trip_id', trip.id),
        supabase.from('doc_status').select('done, participants!inner(trip_id)').eq('participants.trip_id', trip.id).eq('done', true),
        supabase.from('photos').select('id', { count: 'exact', head: true }).eq('trip_id', trip.id),
        supabase.from('survey_responses').select('id', { count: 'exact', head: true }).eq('trip_id', trip.id),
        supabase.from('announcements').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false }).limit(3)
      ])
      setStats({
        docsDone: status?.length || 0,
        docsTotal: (reqs?.length || 0) * participants.length,
        photos: photos || 0,
        surveys: surveys || 0,
        lastAnn: lastAnn || []
      })
    }
    load()
  }, [trip.id, participants.length])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function save(e) {
    e.preventDefault()
    setError(''); setMsg('')
    const { error } = await supabase.from('trips').update({
      ...form, start_date: form.start_date || null, end_date: form.end_date || null
    }).eq('id', trip.id)
    if (error) return setError(errMsg(error))
    setMsg('Viagem atualizada.'); reloadTrip()
  }

  async function remove() {
    if (!confirm(`Apagar a viagem "${trip.name}" e todos os dados dela? Isso não pode ser desfeito.`)) return
    const { error } = await supabase.from('trips').delete().eq('id', trip.id)
    if (error) return setError(errMsg(error))
    nav('/admin')
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Entre no app da nossa viagem "${trip.name}": ${link} (código ${trip.code})`)}`
  const docsPct = stats.docsTotal ? Math.round((stats.docsDone / stats.docsTotal) * 100) : 0

  return (
    <div className="stack">
      <div className="grid-cards">
        <div className="card"><div className="muted">Participantes no app</div><div className="stat">{joined}/{participants.length}</div></div>
        <div className="card">
          <div className="muted">Documentos entregues</div>
          <div className="stat">{docsPct}%</div>
          <div className="progress"><span style={{ width: `${docsPct}%` }} /></div>
        </div>
        <div className="card"><div className="muted">Fotos na galeria</div><div className="stat">{stats.photos}</div></div>
        <div className="card"><div className="muted">Avaliações recebidas</div><div className="stat">{stats.surveys}</div></div>
      </div>

      <div className="card">
        <h2>Convide o grupo</h2>
        <div className="row" style={{ alignItems: 'center' }}>
          <div style={{ flex: '0 0 auto', background: '#fff', padding: 12, borderRadius: 12, border: '1px solid var(--line)' }}>
            <QRCodeSVG value={link} size={150} />
          </div>
          <div>
            <p>Os participantes entram sem senha, pelo link ou lendo o QR code. Coloque o QR no ônibus, no crachá ou no primeiro e-mail.</p>
            <p><strong>Código:</strong> {trip.code}<br /><strong>Link:</strong> <a href={link}>{link}</a></p>
            <div className="row" style={{ flex: 'none' }}>
              <button className="btn secondary small" onClick={() => navigator.clipboard.writeText(link)}>Copiar link</button>
              <a className="btn small" href={whatsapp} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
            </div>
          </div>
        </div>
      </div>

      {stats.lastAnn.length > 0 && (
        <div className="card">
          <h3>Últimos avisos</h3>
          {stats.lastAnn.map((a) => (
            <p key={a.id}><strong>{a.title}</strong> <span className="muted">· {fmtDateTime(a.created_at)}</span></p>
          ))}
        </div>
      )}

      <form className="card" onSubmit={save}>
        <h2>Dados da viagem</h2>
        {error && <div className="error">{error}</div>}
        {msg && <p className="badge good">{msg}</p>}
        <div className="row">
          <div className="field"><label>Nome</label><input required value={form.name} onChange={set('name')} /></div>
          <div className="field"><label>Destino</label><input value={form.destination} onChange={set('destination')} /></div>
        </div>
        <div className="row">
          <div className="field"><label>Início</label><input type="date" value={form.start_date} onChange={set('start_date')} /></div>
          <div className="field"><label>Fim</label><input type="date" value={form.end_date} onChange={set('end_date')} /></div>
          <div className="field"><label>Telefone de emergência do coordenador</label><input value={form.emergency_phone} onChange={set('emergency_phone')} placeholder="+1 407 555 0100" /></div>
        </div>
        <div className="split">
          <button className="btn">Salvar</button>
          {isAdmin && <button type="button" className="btn danger" onClick={remove}>Apagar viagem</button>}
        </div>
      </form>
    </div>
  )
}
