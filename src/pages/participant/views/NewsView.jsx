import { useState } from 'react'
import { t } from '../../../lib/i18n'
import { fmtDateTime } from '../../../lib/format'

export default function NewsView({ news, lang }) {
  const [perm, setPerm] = useState('Notification' in window ? Notification.permission : 'unsupported')

  async function ask() {
    const p = await Notification.requestPermission()
    setPerm(p)
  }

  return (
    <div className="stack">
      {perm === 'default' && (
        <div className="card split">
          <span>{lang === 'en' ? 'Get alerts for new updates' : lang === 'es' ? 'Recibe alertas de nuevos avisos' : 'Receba alertas de novos avisos'}</span>
          <button className="btn small" onClick={ask}>{lang === 'en' ? 'Turn on' : 'Ativar'}</button>
        </div>
      )}
      {news.length === 0 && <div className="card empty">{t(lang, 'no_news')}</div>}
      {news.map((a) => (
        <div key={a.id} className="card" style={a.urgent ? { borderColor: 'var(--accent)' } : undefined}>
          <div className="split">
            <strong>{a.title}</strong>
            {a.urgent && <span className="badge accent">{t(lang, 'urgent')}</span>}
          </div>
          {a.body && <p style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{a.body}</p>}
          <div className="muted">{fmtDateTime(a.created_at, lang)}</div>
        </div>
      ))}
    </div>
  )
}
