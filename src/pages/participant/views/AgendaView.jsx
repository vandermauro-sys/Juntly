import { useState } from 'react'
import { t } from '../../../lib/i18n'
import { fmtDay, fmtShortDay, fmtTime, groupBy, mapsLink, todayISO } from '../../../lib/format'
import SurveyCard from './SurveyCard'

function isNow(item, day) {
  if (day !== todayISO() || !item.start_time) return false
  const now = new Date().toTimeString().slice(0, 5)
  const end = item.end_time ? fmtTime(item.end_time) : null
  return fmtTime(item.start_time) <= now && (!end || now <= end)
}

export default function AgendaView({ data, lang, onSurveyDone }) {
  const byDay = groupBy(data.agenda, (i) => i.day)
  const days = Object.keys(byDay).sort()
  const today = todayISO()
  const fallback = days.includes(today) ? today : days.find((d) => d >= today) || days[0]
  const [picked, setDay] = useState(null)
  const day = days.includes(picked) ? picked : fallback

  return (
    <div>
      {data.trip.survey_open && !data.surveyDone && (
        <div style={{ marginBottom: 14 }}><SurveyCard data={data} lang={lang} onDone={onSurveyDone} /></div>
      )}
      {days.length === 0 ? (
        <div className="card empty">{t(lang, 'no_agenda')}</div>
      ) : (
        <>
          <div className="day-chips">
            {days.map((d) => (
              <button key={d} className={d === day ? 'active' : ''} onClick={() => setDay(d)}>
                {d === today ? t(lang, 'today') : fmtShortDay(d, lang)}
              </button>
            ))}
          </div>
          <h2 style={{ textTransform: 'capitalize' }}>{fmtDay(day, lang)}</h2>
          <div className="timeline">
            {(byDay[day] || []).map((i) => (
              <div key={i.id} className={`tl-item ${isNow(i, day) ? 'now' : ''}`}>
                <div className="tl-time">{fmtTime(i.start_time)}</div>
                <div className="card">
                  <h3 style={{ marginBottom: 2 }}>{i.title}</h3>
                  {(i.location || i.end_time) && (
                    <div className="muted">{i.location}{i.end_time && ` · até ${fmtTime(i.end_time)}`}</div>
                  )}
                  {i.bring && <p style={{ marginTop: 8, marginBottom: 0 }}><strong>{t(lang, 'bring')}:</strong> {i.bring}</p>}
                  {i.notes && <p style={{ marginTop: 8, marginBottom: 0, whiteSpace: 'pre-wrap' }}>{i.notes}</p>}
                  {i.address && (
                    <a className="btn secondary small" style={{ marginTop: 10 }} href={mapsLink(i.address)} target="_blank" rel="noreferrer">
                      {t(lang, 'route')}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
