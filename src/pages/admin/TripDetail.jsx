import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAgency } from '../../lib/useAgency'
import { fmtShortDay } from '../../lib/format'
import AdminTopbar from '../../components/AdminTopbar'
import Overview from './tabs/Overview'
import Participants from './tabs/Participants'
import Agenda from './tabs/Agenda'
import Announcements from './tabs/Announcements'
import Documents from './tabs/Documents'
import CheckIn from './tabs/CheckIn'
import Photos from './tabs/Photos'
import Guide from './tabs/Guide'
import Survey from './tabs/Survey'

const TABS = [
  ['overview', 'Visão geral'],
  ['participants', 'Participantes'],
  ['agenda', 'Agenda'],
  ['announcements', 'Avisos'],
  ['checkin', 'Check-in'],
  ['photos', 'Fotos'],
  ['documents', 'Documentos'],
  ['guide', 'Guia'],
  ['survey', 'Pesquisa']
]

export default function TripDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'overview'
  const { agency, isAdmin } = useAgency()
  const [trip, setTrip] = useState(null)
  const [participants, setParticipants] = useState([])
  const [notFound, setNotFound] = useState(false)

  const loadTrip = useCallback(async () => {
    const { data } = await supabase.from('trips').select('*').eq('id', id).maybeSingle()
    if (!data) setNotFound(true)
    setTrip(data)
  }, [id])

  const loadParticipants = useCallback(async () => {
    const { data } = await supabase.from('participants').select('*').eq('trip_id', id).order('name')
    setParticipants(data || [])
  }, [id])

  useEffect(() => { loadTrip(); loadParticipants() }, [loadTrip, loadParticipants])

  if (notFound) {
    return (
      <div className="admin">
        <AdminTopbar agency={agency} />
        <div className="card empty">Viagem não encontrada. <Link to="/admin">Voltar</Link></div>
      </div>
    )
  }
  if (!trip) return null

  const groups = [...new Set(participants.map((p) => p.group_label).filter(Boolean))].sort()
  const common = { trip, participants, groups, reloadTrip: loadTrip, reloadParticipants: loadParticipants, isAdmin }

  return (
    <div className="admin">
      <AdminTopbar agency={agency} />
      <Link to="/admin" className="muted">← Viagens</Link>
      <div className="split" style={{ marginTop: 6 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{trip.name}</h1>
          <div className="muted">
            {trip.destination}
            {trip.start_date && ` · ${fmtShortDay(trip.start_date)} – ${fmtShortDay(trip.end_date || trip.start_date)}`}
          </div>
        </div>
        <span className="badge accent" style={{ fontSize: 15 }}>Código {trip.code}</span>
      </div>
      <nav className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setParams({ tab: key })}>{label}</button>
        ))}
      </nav>
      {tab === 'overview' && <Overview {...common} />}
      {tab === 'participants' && <Participants {...common} />}
      {tab === 'agenda' && <Agenda {...common} />}
      {tab === 'announcements' && <Announcements {...common} />}
      {tab === 'checkin' && <CheckIn {...common} />}
      {tab === 'photos' && <Photos {...common} />}
      {tab === 'documents' && <Documents {...common} />}
      {tab === 'guide' && <Guide {...common} />}
      {tab === 'survey' && <Survey {...common} />}
    </div>
  )
}
