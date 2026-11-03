import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../../../lib/supabase'

export default function Documents({ trip, participants }) {
  const [reqs, setReqs] = useState([])
  const [status, setStatus] = useState({}) // `${req}:${participant}` -> done
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const { data: r } = await supabase.from('doc_requirements').select('*').eq('trip_id', trip.id).order('sort')
    setReqs(r || [])
    const ids = (r || []).map((x) => x.id)
    if (!ids.length) return setStatus({})
    const { data: s } = await supabase.from('doc_status').select('*').in('requirement_id', ids)
    setStatus(Object.fromEntries((s || []).map((x) => [`${x.requirement_id}:${x.participant_id}`, x.done])))
  }
  useEffect(() => { load() }, [trip.id])

  async function addReq(e) {
    e.preventDefault()
    const { error } = await supabase.from('doc_requirements').insert({ trip_id: trip.id, title: title.trim(), sort: reqs.length + 1 })
    if (error) return setError(errMsg(error))
    setTitle(''); load()
  }

  async function removeReq(r) {
    if (!confirm(`Remover "${r.title}" da lista de documentos?`)) return
    await supabase.from('doc_requirements').delete().eq('id', r.id)
    load()
  }

  async function toggle(reqId, pId) {
    const key = `${reqId}:${pId}`
    const done = !status[key]
    setStatus({ ...status, [key]: done })
    const { error } = await supabase.from('doc_status')
      .upsert({ requirement_id: reqId, participant_id: pId, done, updated_at: new Date().toISOString() })
    if (error) { setError(errMsg(error)); load() }
  }

  const pendingOf = (p) => reqs.filter((r) => !status[`${r.id}:${p.id}`]).length
  const pendingPeople = participants.filter((p) => pendingOf(p) > 0)

  return (
    <div className="stack">
      <div className="card">
        <h3>Documentos exigidos</h3>
        <p className="muted">O participante vê esta lista no app e marca o que já tem. A equipe também pode marcar.</p>
        {error && <div className="error">{error}</div>}
        {reqs.map((r) => (
          <div key={r.id} className="split" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span>{r.title}</span>
            <button className="btn ghost small" onClick={() => removeReq(r)}>Remover</button>
          </div>
        ))}
        <form onSubmit={addReq} className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0 }}><label>Novo documento</label><input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Comprovante de vacina" /></div>
          <button className="btn secondary" style={{ flex: 'none' }}>Adicionar</button>
        </form>
      </div>

      {reqs.length > 0 && participants.length > 0 && (
        <div className="card table-wrap">
          <div className="split" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Quem já entregou</h3>
            <span className={`badge ${pendingPeople.length ? 'warn' : 'good'}`}>
              {pendingPeople.length ? `${pendingPeople.length} com pendências` : 'Tudo entregue'}
            </span>
          </div>
          <table>
            <thead><tr><th>Participante</th>{reqs.map((r) => <th key={r.id}>{r.title}</th>)}</tr></thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  {reqs.map((r) => (
                    <td key={r.id}>
                      <input type="checkbox" style={{ width: 20, height: 20, accentColor: 'var(--good)' }}
                        checked={Boolean(status[`${r.id}:${p.id}`])} onChange={() => toggle(r.id, p.id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
