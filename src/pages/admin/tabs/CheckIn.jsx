import { useEffect, useMemo, useState } from 'react'
import { supabase, errMsg } from '../../../lib/supabase'
import { useSession } from '../../../lib/session'
import { checkIn, flush, pendingFor, pendingCount } from '../../../lib/offlineQueue'
import { fmtDateTime, fmtTime, fmtShortDay } from '../../../lib/format'
import QrScanner from '../../../components/QrScanner'

const KINDS = { atraso: 'Atraso', saude: 'Saúde', reclamacao: 'Reclamação', outro: 'Outro' }

function Incidents({ trip, participants }) {
  const { session } = useSession()
  const [list, setList] = useState([])
  const [form, setForm] = useState({ participant_id: '', kind: 'atraso', note: '' })
  async function load() {
    const { data } = await supabase.from('incidents').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false })
    setList(data || [])
  }
  useEffect(() => { load() }, [trip.id])
  async function add(e) {
    e.preventDefault()
    await supabase.from('incidents').insert({
      trip_id: trip.id, participant_id: form.participant_id || null, kind: form.kind,
      note: form.note.trim(), created_by: session.user.id
    })
    setForm({ participant_id: '', kind: 'atraso', note: '' })
    load()
  }
  const nameOf = (id) => participants.find((p) => p.id === id)?.name
  return (
    <div className="card">
      <h3>Ocorrências</h3>
      <form onSubmit={add}>
        <div className="row">
          <div className="field">
            <label>Participante</label>
            <select value={form.participant_id} onChange={(e) => setForm({ ...form, participant_id: e.target.value })}>
              <option value="">Grupo todo / nenhum</option>
              {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: '0 0 160px' }}>
            <label>Tipo</label>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="field"><label>O que aconteceu</label><input required value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        <button className="btn secondary small">Registrar</button>
      </form>
      {list.map((i) => (
        <p key={i.id} style={{ marginTop: 10 }}>
          <span className="badge">{KINDS[i.kind]}</span> {nameOf(i.participant_id) && <strong>{nameOf(i.participant_id)}: </strong>}
          {i.note} <span className="muted">· {fmtDateTime(i.created_at)}</span>
        </p>
      ))}
    </div>
  )
}

export default function CheckIn({ trip, participants, groups }) {
  const { session } = useSession()
  const [checkpoints, setCheckpoints] = useState([])
  const [agenda, setAgenda] = useState([])
  const [current, setCurrent] = useState(null)
  const [done, setDone] = useState(new Set())
  const [queued, setQueued] = useState(new Set())
  const [group, setGroup] = useState('')
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newAgenda, setNewAgenda] = useState('')
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [online, setOnline] = useState(navigator.onLine)

  function flash(text) { setToast(text); setTimeout(() => setToast(''), 2200) }

  async function loadCheckpoints() {
    const [{ data: cps }, { data: ag }] = await Promise.all([
      supabase.from('checkpoints').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false }),
      supabase.from('agenda_items').select('id, day, start_time, title').eq('trip_id', trip.id).order('day').order('start_time')
    ])
    setCheckpoints(cps || [])
    setAgenda(ag || [])
    if (!current && cps?.length) setCurrent(cps[0].id)
  }
  useEffect(() => { loadCheckpoints() }, [trip.id])

  async function loadCheckins() {
    if (!current) return
    const { data } = await supabase.from('checkins').select('participant_id').eq('checkpoint_id', current)
    setDone(new Set((data || []).map((c) => c.participant_id)))
    setQueued(new Set(pendingFor(current)))
  }

  useEffect(() => {
    if (!current) return
    loadCheckins()
    // Sincroniza com outros coordenadores em tempo real
    const ch = supabase.channel(`checkins-${current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins', filter: `checkpoint_id=eq.${current}` }, loadCheckins)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [current])

  useEffect(() => {
    const on = async () => { setOnline(true); const n = await flush(); if (n) { flash(`${n} check-ins sincronizados`); loadCheckins() } }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [current])

  async function createCheckpoint(e) {
    e.preventDefault()
    setError('')
    const { data, error } = await supabase.from('checkpoints')
      .insert({ trip_id: trip.id, title: newTitle.trim(), agenda_item_id: newAgenda || null }).select().single()
    if (error) return setError(errMsg(error))
    setNewTitle(''); setNewAgenda('')
    await loadCheckpoints()
    setCurrent(data.id)
  }

  async function mark(p) {
    if (done.has(p.id) || queued.has(p.id)) return
    const { queued: q } = await checkIn(current, p.id, session.user.id)
    if (q) setQueued(new Set([...queued, p.id])); else setDone(new Set([...done, p.id]))
    flash(`${p.name.split(' ')[0]} ✓${q ? ' (salvo sem internet)' : ''}`)
  }

  async function undo(p) {
    if (!done.has(p.id)) return
    if (!confirm(`Desfazer o check-in de ${p.name}?`)) return
    await supabase.from('checkins').delete().eq('checkpoint_id', current).eq('participant_id', p.id)
    loadCheckins()
  }

  function onScan(text) {
    const id = text.startsWith('juntly:') ? text.slice(7) : text
    const p = participants.find((x) => x.id === id)
    if (!p) return flash('QR não é desta viagem')
    if (done.has(p.id) || queued.has(p.id)) return flash(`${p.name.split(' ')[0]} já fez check-in`)
    mark(p)
  }

  const pool = useMemo(() => participants.filter((p) => !group || p.group_label === group), [participants, group])
  const shown = pool
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(done.has(a.id) || queued.has(a.id)) - Number(done.has(b.id) || queued.has(b.id)) || a.name.localeCompare(b.name))
  const present = pool.filter((p) => done.has(p.id) || queued.has(p.id)).length
  const missing = pool.filter((p) => !done.has(p.id) && !queued.has(p.id))
  const cp = checkpoints.find((c) => c.id === current)

  return (
    <div className="stack">
      {toast && <div className="toast">{toast}</div>}
      {!online && <div className="notice">Sem internet. Os check-ins ficam salvos no aparelho e são enviados quando a conexão voltar ({pendingCount()} na fila).</div>}
      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Ponto de check-in</label>
            <select value={current || ''} onChange={(e) => setCurrent(e.target.value)}>
              {!checkpoints.length && <option value="">Crie um ponto de check-in</option>}
              {checkpoints.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Grupo</label>
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">Todos</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
        <details style={{ marginTop: 12 }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>Novo ponto de check-in</summary>
          <form onSubmit={createCheckpoint} style={{ marginTop: 10 }}>
            <div className="row">
              <div className="field"><label>Nome</label><input required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Embarque ônibus — dia 2, manhã" /></div>
              <div className="field">
                <label>Atividade da agenda (opcional)</label>
                <select value={newAgenda} onChange={(e) => {
                  setNewAgenda(e.target.value)
                  const a = agenda.find((x) => x.id === e.target.value)
                  if (a && !newTitle) setNewTitle(`${a.title} — ${fmtShortDay(a.day)} ${fmtTime(a.start_time)}`.trim())
                }}>
                  <option value="">Nenhuma</option>
                  {agenda.map((a) => <option key={a.id} value={a.id}>{fmtShortDay(a.day)} {fmtTime(a.start_time)} · {a.title}</option>)}
                </select>
              </div>
            </div>
            <button className="btn secondary small">Criar</button>
          </form>
        </details>
      </div>

      {cp && (
        <>
          <div className="card">
            <div className="split">
              <div>
                <div className="muted">{cp.title}</div>
                <div className="stat">{present}/{pool.length} <span className="muted" style={{ fontSize: 15, fontFamily: 'var(--font)' }}>presentes</span></div>
              </div>
              <button className="btn" onClick={() => setScanning(!scanning)}>{scanning ? 'Fechar câmera' : 'Ler QR code'}</button>
            </div>
            <div className="progress" style={{ marginTop: 10 }}><span style={{ width: `${pool.length ? (present / pool.length) * 100 : 0}%` }} /></div>
            {scanning && <div style={{ marginTop: 14 }}><QrScanner onScan={onScan} onError={(m) => { setError(`Não consegui abrir a câmera: ${m}`); setScanning(false) }} /></div>}
          </div>

          {missing.length > 0 && missing.length <= 10 && (
            <div className="card">
              <h3>Faltam {missing.length}</h3>
              {missing.map((p) => (
                <div key={p.id} className="split" style={{ padding: '4px 0' }}>
                  <span>{p.name} {p.group_label && <span className="badge">{p.group_label}</span>}</span>
                  {p.phone && <a className="btn secondary small" href={`tel:${p.phone}`}>Ligar</a>}
                </div>
              ))}
            </div>
          )}

          <div className="checkin-list">
            <input placeholder="Buscar pelo nome" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
            {shown.map((p) => {
              const isDone = done.has(p.id)
              const isQueued = queued.has(p.id)
              return (
                <button key={p.id} className={`person ${isDone ? 'done' : ''} ${isQueued ? 'queued' : ''}`}
                  onClick={() => (isDone ? undo(p) : mark(p))}>
                  <span><strong>{p.name}</strong>{p.group_label && <span className="muted"> · {p.group_label}</span>}</span>
                  <span className={`badge ${isDone ? 'good' : isQueued ? 'warn' : ''}`}>{isDone ? 'Presente' : isQueued ? 'Na fila' : 'Marcar'}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      <Incidents trip={trip} participants={participants} />
    </div>
  )
}
