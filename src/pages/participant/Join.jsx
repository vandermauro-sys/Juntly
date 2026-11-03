import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useSession } from '../../lib/session'
import { t, LANGS, guessLang } from '../../lib/i18n'
import { fmtShortDay } from '../../lib/format'
import { getMyTrips, rememberTrip } from '../../lib/myTrips'
import Logo from '../../components/Logo'

export default function Join() {
  const params = useParams()
  const nav = useNavigate()
  const { session, loading } = useSession()
  const [lang, setLang] = useState(guessLang())
  const [code, setCode] = useState(params.code || '')
  const [preview, setPreview] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', consent: false })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const myTrips = getMyTrips()

  // Mostra nome da viagem e marca da agência assim que o código está completo
  useEffect(() => {
    setPreview(null); setError('')
    const c = code.trim()
    if (c.length < 6) return
    supabase.rpc('trip_preview', { trip_code: c }).then(({ data }) => {
      if (data && data[0]) setPreview(data[0])
      else setError(t(lang, 'join_notfound'))
    })
  }, [code])

  useEffect(() => {
    if (preview?.brand_color) document.documentElement.style.setProperty('--accent', preview.brand_color)
  }, [preview])

  const set = (k) => (e) => setForm({ ...form, [k]: k === 'consent' ? e.target.checked : e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
      }
      const { data: tripId, error } = await supabase.rpc('join_trip', {
        trip_code: code.trim(), p_name: form.name, p_phone: form.phone || null,
        p_email: form.email || null, p_lang: lang, p_consent: form.consent
      })
      if (error) throw error
      rememberTrip({ id: tripId, name: preview?.name || '' })
      nav(`/t/${tripId}`, { replace: true })
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  return (
    <div className="center-page">
      <div className="center-card">
        <div className="split" style={{ marginBottom: 16 }}>
          {preview?.logo_url ? (
            <div className="brand"><img src={preview.logo_url} alt="" />{preview.agency_name}</div>
          ) : <Logo />}
          <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ width: 'auto' }} aria-label={t(lang, 'join_lang')}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>

        {myTrips.length > 0 && !params.code && (
          <div className="card" style={{ marginBottom: 12 }}>
            {myTrips.map((tr) => (
              <Link key={tr.id} to={`/t/${tr.id}`} className="split" style={{ padding: '6px 0', color: 'inherit', textDecoration: 'none' }}>
                <strong>{tr.name || 'Viagem'}</strong><span>→</span>
              </Link>
            ))}
          </div>
        )}

        <form className="card" onSubmit={submit}>
          <h2>{preview ? preview.name : t(lang, 'join_title')}</h2>
          {preview && (
            <p className="muted">
              {preview.destination}{preview.start_date && ` · ${fmtShortDay(preview.start_date, lang)} – ${fmtShortDay(preview.end_date || preview.start_date, lang)}`}
            </p>
          )}
          {error && <div className="error">{error}</div>}
          {!params.code && (
            <div className="field">
              <label>{t(lang, 'join_code')}</label>
              <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6}
                style={{ letterSpacing: '.2em', fontWeight: 600, textTransform: 'uppercase' }} autoCapitalize="characters" />
            </div>
          )}
          {preview && (
            <>
              <div className="field"><label>{t(lang, 'join_name')}</label><input required value={form.name} onChange={set('name')} autoComplete="name" /></div>
              <div className="field"><label>{t(lang, 'join_phone')}</label><input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" /></div>
              <div className="field"><label>{t(lang, 'join_email')}</label><input type="email" value={form.email} onChange={set('email')} autoComplete="email" /></div>
              <label className="check field">
                <input type="checkbox" checked={form.consent} onChange={set('consent')} />
                {t(lang, 'join_consent')}
              </label>
              <button className="btn block" disabled={busy}>{busy ? '…' : t(lang, 'join_button')}</button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
