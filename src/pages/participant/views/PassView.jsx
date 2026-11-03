import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../../../lib/supabase'
import { t, LANGS } from '../../../lib/i18n'

export default function PassView({ data, lang, onChange, onUpdateMe, onLeave }) {
  const { me, trip, reqs, status } = data

  async function toggle(reqId) {
    await supabase.from('doc_status').upsert({
      requirement_id: reqId, participant_id: me.id, done: !status[reqId], updated_at: new Date().toISOString()
    })
    onChange()
  }

  return (
    <div className="stack">
      <div className="card pass">
        <h2>{me.name}</h2>
        <div className="qr"><QRCodeSVG value={`juntly:${me.id}`} size={200} /></div>
        <p className="muted" style={{ marginTop: 10 }}>{t(lang, 'pass_hint')}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {me.group_label && <span className="badge" style={{ flex: 'none' }}>{t(lang, 'group')}: {me.group_label}</span>}
          {me.room && <span className="badge" style={{ flex: 'none' }}>{t(lang, 'room')}: {me.room}</span>}
        </div>
      </div>

      <div className="card">
        <h3>{t(lang, 'docs_title')}</h3>
        {reqs.length === 0 && <p className="muted">{t(lang, 'docs_none')}</p>}
        {reqs.map((r) => (
          <label key={r.id} className="check" style={{ padding: '8px 0' }}>
            <input type="checkbox" checked={Boolean(status[r.id])} onChange={() => toggle(r.id)} />
            <span>{r.title}{r.description && <div className="muted">{r.description}</div>}</span>
          </label>
        ))}
      </div>

      {trip.emergency_phone && (
        <div className="card">
          <h3>{t(lang, 'emergency')}</h3>
          <a className="btn block" href={`tel:${trip.emergency_phone}`}>{t(lang, 'call_coord')} · {trip.emergency_phone}</a>
          <a className="btn secondary block" style={{ marginTop: 8 }} href="tel:911">911</a>
        </div>
      )}

      <div className="card">
        <div className="field">
          <label>{t(lang, 'join_lang')}</label>
          <select value={lang} onChange={(e) => onUpdateMe({ lang: e.target.value })}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <label className="check">
          <input type="checkbox" checked={me.photo_consent} onChange={(e) => onUpdateMe({ photo_consent: e.target.checked })} />
          {t(lang, 'join_consent')}
        </label>
        <button className="btn ghost small" style={{ marginTop: 12 }} onClick={onLeave}>{t(lang, 'leave')}</button>
      </div>
    </div>
  )
}
