import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/session'
import { t } from '../../lib/i18n'
import { forGroup } from '../../lib/format'
import { forgetTrip, readCache, rememberTrip, saveCache } from '../../lib/myTrips'
import { IconBell, IconCalendar, IconGuide, IconPass, IconPhotos } from '../../components/Icons'
import AgendaView from './views/AgendaView'
import NewsView from './views/NewsView'
import PassView from './views/PassView'
import PhotosView from './views/PhotosView'
import GuideView from './views/GuideView'

const SEEN_KEY = (id) => `juntly-seen-${id}`

export default function ParticipantApp() {
  const { tripId } = useParams()
  const nav = useNavigate()
  const { session, loading } = useSession()
  const [tab, setTab] = useState('agenda')
  const [data, setData] = useState(() => readCache(tripId))
  const [offline, setOffline] = useState(false)
  const [toast, setToast] = useState('')
  const [lastSeen, setLastSeen] = useState(() => localStorage.getItem(SEEN_KEY(tripId)) || '')
  const toastTimer = useRef()

  const lang = data?.me?.lang || 'pt'

  function flash(text) {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3500)
  }

  function notify(title, body) {
    flash(title)
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(title, { body: body || '', icon: '/icon-192.png' })
    }
  }

  const load = useCallback(async () => {
    try {
      const { data: me, error: meErr } = await supabase.from('participants').select('*')
        .eq('trip_id', tripId).eq('user_id', session.user.id).maybeSingle()
      if (meErr) throw meErr
      if (!me) { setData({ notMember: true }); return }
      const [trip, agenda, news, reqs, status, photos] = await Promise.all([
        supabase.from('trips').select('*, agencies(name, logo_url, brand_color)').eq('id', tripId).single(),
        supabase.from('agenda_items').select('*').eq('trip_id', tripId).order('day').order('start_time', { nullsFirst: true }),
        supabase.from('announcements').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
        supabase.from('doc_requirements').select('*').eq('trip_id', tripId).order('sort'),
        supabase.from('doc_status').select('*').eq('participant_id', me.id),
        supabase.from('photos').select('*, photo_tags(participant_id)').eq('trip_id', tripId).order('created_at', { ascending: false })
      ])
      const { data: survey } = await supabase.from('survey_responses').select('id').eq('participant_id', me.id).maybeSingle()
      const next = {
        me,
        trip: trip.data,
        agenda: (agenda.data || []).filter((i) => forGroup(i, me.group_label)),
        news: (news.data || []).filter((a) => forGroup(a, me.group_label)),
        reqs: reqs.data || [],
        status: Object.fromEntries((status.data || []).map((s) => [s.requirement_id, s.done])),
        photos: photos.data || [],
        surveyDone: Boolean(survey)
      }
      setData(next)
      saveCache(tripId, next)
      rememberTrip(next.trip)
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [tripId, session])

  useEffect(() => { if (session) load() }, [session, load])

  // Agenda e avisos ao vivo
  useEffect(() => {
    if (!session) return
    const ch = supabase.channel(`trip-${tripId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements', filter: `trip_id=eq.${tripId}` }, (payload) => {
        const a = payload.new
        load()
        notify(`${t(lang, 'new_notice')}: ${a.title}`, a.body)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_items', filter: `trip_id=eq.${tripId}` }, () => {
        load()
        flash(t(lang, 'agenda_changed'))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos', filter: `trip_id=eq.${tripId}` }, () => load())
      .subscribe()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { supabase.removeChannel(ch); window.removeEventListener('focus', onFocus) }
  }, [session, tripId, lang, load])

  // Cor da agência no app
  useEffect(() => {
    const color = data?.trip?.agencies?.brand_color
    if (color) document.documentElement.style.setProperty('--accent', color)
  }, [data?.trip?.agencies?.brand_color])

  function openTab(key) {
    setTab(key)
    if (key === 'news' && data?.news?.[0]) {
      setLastSeen(data.news[0].created_at)
      localStorage.setItem(SEEN_KEY(tripId), data.news[0].created_at)
    }
  }

  async function updateMe(patch) {
    await supabase.from('participants').update(patch).eq('id', data.me.id)
    load()
  }

  function leave() {
    if (!confirm(t(lang, 'leave') + '?')) return
    forgetTrip(tripId)
    nav('/j')
  }

  if (loading) return null
  if (!session) return <Navigate to="/j" replace />
  if (data?.notMember) return <Navigate to="/j" replace />
  if (!data?.trip) return <div className="center-page muted">…</div>

  const { trip, me } = data
  const agency = trip.agencies || {}
  const unread = data.news.some((a) => !lastSeen || a.created_at > lastSeen)

  const nav_items = [
    ['agenda', t(lang, 'tab_today'), IconCalendar],
    ['news', t(lang, 'tab_news'), IconBell],
    ['pass', t(lang, 'tab_docs'), IconPass],
    ['photos', t(lang, 'tab_photos'), IconPhotos],
    ['guide', t(lang, 'tab_guide'), IconGuide]
  ]

  return (
    <div className="pa">
      {toast && <div className="toast">{toast}</div>}
      <header className="pa-header">
        <img src={agency.logo_url || '/icon.svg'} alt="" />
        <div>
          <div className="title">{trip.name}</div>
          <div className="muted">{agency.name}</div>
        </div>
      </header>
      <main className="pa-body">
        {offline && <div className="notice" style={{ marginBottom: 12 }}>{t(lang, 'offline')}</div>}
        {tab === 'agenda' && <AgendaView data={data} lang={lang} onSurveyDone={load} />}
        {tab === 'news' && <NewsView news={data.news} lang={lang} />}
        {tab === 'pass' && <PassView data={data} lang={lang} onChange={load} onUpdateMe={updateMe} onLeave={leave} />}
        {tab === 'photos' && <PhotosView data={data} lang={lang} onUpdateMe={updateMe} />}
        {tab === 'guide' && <GuideView trip={trip} lang={lang} />}
      </main>
      <nav className="bottom-nav">
        <div className="inner">
          {nav_items.map(([key, label, Icon]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => openTab(key)}>
              <Icon />
              {label}
              {key === 'news' && unread && tab !== 'news' && <span className="dot" />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
