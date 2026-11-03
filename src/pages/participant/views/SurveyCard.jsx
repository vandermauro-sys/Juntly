import { useState } from 'react'
import { supabase, errMsg } from '../../../lib/supabase'
import { t } from '../../../lib/i18n'

export default function SurveyCard({ data, lang, onDone }) {
  const [rating, setRating] = useState(0)
  const [nps, setNps] = useState(null)
  const [comment, setComment] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    setError('')
    const { error } = await supabase.from('survey_responses').insert({
      trip_id: data.trip.id, participant_id: data.me.id,
      rating: rating || null, nps, comment: comment.trim() || null
    })
    if (error) return setError(errMsg(error))
    setSent(true)
    setTimeout(onDone, 1500)
  }

  if (sent) return <div className="card empty">{t(lang, 'survey_thanks')}</div>

  return (
    <div className="card" style={{ borderColor: 'var(--accent)' }}>
      <h2>{t(lang, 'survey_title')}</h2>
      {error && <div className="error">{error}</div>}
      <div className="field">
        <label>{t(lang, 'survey_rating')}</label>
        <div className="stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n}`}>★</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>{t(lang, 'survey_nps')}</label>
        <div className="nps">
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} className={nps === n ? 'on' : ''} onClick={() => setNps(n)}>{n}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>{t(lang, 'survey_comment')}</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      <button className="btn block" disabled={!rating} onClick={send}>{t(lang, 'survey_send')}</button>
    </div>
  )
}
