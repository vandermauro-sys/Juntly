import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAgency } from '../../lib/useAgency'
import { fmtShortDay } from '../../lib/format'
import AdminTopbar from '../../components/AdminTopbar'
import AgencySettings from './AgencySettings'

function Onboarding({ onDone }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.rpc('create_agency', { agency_name: name.trim() })
    setBusy(false)
    if (error) setError(errMsg(error)); else onDone()
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h2>Bem-vindo ao Juntly</h2>
      <p className="muted">Comece criando a sua agência. Depois você convida coordenadores e cria a primeira viagem.</p>
      {error && <div className="error">{error}</div>}
      <p className="muted">Se você é coordenador de uma agência que já usa o Juntly, peça ao administrador para adicionar o seu e-mail em vez de criar outra agência.</p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="ag">Nome da agência</label>
          <input id="ag" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Sol Viagens Corporativas" />
        </div>
        <button className="btn" disabled={busy}>Criar agência</button>
      </form>
    </div>
  )
}

function NewTrip({ agencyId, onCancel }) {
  const nav = useNavigate()
  const [form, setForm] = useState({ name: '', destination: '', start_date: '', end_date: '' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  async function submit(e) {
    e.preventDefault()
    const { data, error } = await supabase
      .from('trips')
      .insert({ ...form, agency_id: agencyId, start_date: form.start_date || null, end_date: form.end_date || null })
      .select()
      .single()
    if (error) return setError(errMsg(error))
    // Documentos mais comuns já entram na checklist
    await supabase.from('doc_requirements').insert([
      { trip_id: data.id, title: 'Passaporte válido', sort: 1 },
      { trip_id: data.id, title: 'Visto americano ou ESTA', sort: 2 },
      { trip_id: data.id, title: 'Seguro viagem', sort: 3 }
    ])
    nav(`/admin/trip/${data.id}`)
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>Nova viagem</h2>
      {error && <div className="error">{error}</div>}
      <div className="field">
        <label>Nome da viagem</label>
        <input required value={form.name} onChange={set('name')} placeholder="Missão empresarial Orlando 2027" />
      </div>
      <div className="field">
        <label>Destino</label>
        <input value={form.destination} onChange={set('destination')} placeholder="Orlando, FL" />
      </div>
      <div className="row">
        <div className="field"><label>Início</label><input type="date" value={form.start_date} onChange={set('start_date')} /></div>
        <div className="field"><label>Fim</label><input type="date" value={form.end_date} onChange={set('end_date')} /></div>
      </div>
      <div className="row" style={{ flex: 'none' }}>
        <button className="btn">Criar viagem</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

export default function Trips() {
  const { agency, loading, reload, isAdmin } = useAgency()
  const [trips, setTrips] = useState([])
  const [creating, setCreating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if (!agency) return
    supabase
      .from('trips')
      .select('*, participants(count)')
      .eq('agency_id', agency.id)
      .order('start_date', { ascending: false, nullsFirst: true })
      .then(({ data }) => setTrips(data || []))
  }, [agency])

  if (loading) return null

  return (
    <div className="admin">
      <AdminTopbar agency={agency} />
      {!agency ? (
        <Onboarding onDone={reload} />
      ) : (
        <>
          <div className="split" style={{ margin: '12px 0 18px' }}>
            <h1 style={{ margin: 0 }}>Viagens</h1>
            <div className="row" style={{ flex: 'none' }}>
              {isAdmin && <button className="btn secondary" onClick={() => setShowSettings(!showSettings)}>Agência e equipe</button>}
              <button className="btn" onClick={() => setCreating(true)}>Nova viagem</button>
            </div>
          </div>
          {showSettings && <div style={{ marginBottom: 16 }}><AgencySettings agency={agency} onSaved={reload} /></div>}
          {creating && <div style={{ marginBottom: 16 }}><NewTrip agencyId={agency.id} onCancel={() => setCreating(false)} /></div>}
          {trips.length === 0 && !creating ? (
            <div className="card empty">Nenhuma viagem ainda. Crie a primeira para começar.</div>
          ) : (
            <div className="grid-cards">
              {trips.map((t) => (
                <Link key={t.id} to={`/admin/trip/${t.id}`} className="card trip-card">
                  <h3 style={{ marginBottom: 4 }}>{t.name}</h3>
                  <div className="muted">{t.destination}</div>
                  <div className="muted">
                    {t.start_date ? `${fmtShortDay(t.start_date)} – ${fmtShortDay(t.end_date || t.start_date)}` : 'Datas a definir'}
                  </div>
                  <div className="split" style={{ marginTop: 12 }}>
                    <span className="badge">{t.participants?.[0]?.count ?? 0} participantes</span>
                    <span className="badge accent">{t.code}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
