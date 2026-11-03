import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../../../lib/supabase'
import { fmtDateTime } from '../../../lib/format'

export default function Survey({ trip, participants, reloadTrip }) {
  const [responses, setResponses] = useState([])

  useEffect(() => {
    supabase.from('survey_responses').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false })
      .then(({ data }) => setResponses(data || []))
  }, [trip.id])

  async function toggleOpen() {
    await supabase.from('trips').update({ survey_open: !trip.survey_open }).eq('id', trip.id)
    reloadTrip()
  }

  const n = responses.length
  const avg = n ? (responses.reduce((s, r) => s + (r.rating || 0), 0) / responses.filter((r) => r.rating).length || 0) : 0
  const npsList = responses.filter((r) => r.nps !== null && r.nps !== undefined)
  const promoters = npsList.filter((r) => r.nps >= 9).length
  const detractors = npsList.filter((r) => r.nps <= 6).length
  const nps = npsList.length ? Math.round(((promoters - detractors) / npsList.length) * 100) : null
  const nameOf = (id) => participants.find((p) => p.id === id)?.name || 'Participante'

  function exportCsv() {
    const csv = Papa.unparse(responses.map((r) => ({
      participante: nameOf(r.participant_id), nota: r.rating, recomendacao_0a10: r.nps, comentario: r.comment, data: r.created_at
    })))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `pesquisa-${trip.code}.csv`
    a.click()
  }

  return (
    <div className="stack">
      <div className="card split">
        <div>
          <h3 style={{ margin: 0 }}>Pesquisa de satisfação</h3>
          <div className="muted">{trip.survey_open ? 'Aberta: aparece no app de todos os participantes.' : 'Fechada. Abra no último dia da viagem.'}</div>
        </div>
        <div className="row" style={{ flex: 'none' }}>
          <button className="btn secondary small" onClick={exportCsv} disabled={!n}>Exportar</button>
          <button className="btn small" onClick={toggleOpen}>{trip.survey_open ? 'Fechar pesquisa' : 'Abrir pesquisa'}</button>
        </div>
      </div>
      <div className="grid-cards">
        <div className="card"><div className="muted">Respostas</div><div className="stat">{n}/{participants.length}</div></div>
        <div className="card"><div className="muted">Nota média (1 a 5)</div><div className="stat">{n ? avg.toFixed(1) : '—'}</div></div>
        <div className="card"><div className="muted">NPS (recomendação)</div><div className="stat">{nps === null ? '—' : nps}</div></div>
      </div>
      {responses.filter((r) => r.comment).map((r) => (
        <div className="card" key={r.id}>
          <p style={{ whiteSpace: 'pre-wrap' }}>{r.comment}</p>
          <div className="muted">{nameOf(r.participant_id)} · nota {r.rating ?? '—'} · {fmtDateTime(r.created_at)}</div>
        </div>
      ))}
    </div>
  )
}
