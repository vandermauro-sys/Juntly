import { useEffect, useState } from 'react'
import { signedPhotoUrls } from '../../../lib/supabase'
import { t } from '../../../lib/i18n'

export default function PhotosView({ data, lang, onUpdateMe }) {
  const { me, photos } = data
  const [mode, setMode] = useState('mine')
  const [urls, setUrls] = useState({})
  const [open, setOpen] = useState(null)

  const mine = photos.filter((p) => p.photo_tags.some((tag) => tag.participant_id === me.id))
  const list = mode === 'mine' ? mine : photos

  useEffect(() => {
    const missing = list.map((p) => p.storage_path).filter((path) => !urls[path])
    if (missing.length) signedPhotoUrls(missing).then((m) => setUrls((u) => ({ ...u, ...m }))).catch(() => {})
  }, [mode, photos.length])

  async function download(photo) {
    const res = await fetch(urls[photo.storage_path])
    const blob = await res.blob()
    const file = new File([blob], `juntly-${photo.id.slice(0, 8)}.jpg`, { type: 'image/jpeg' })
    // No celular, abre a folha de compartilhar (salvar na galeria, WhatsApp, Instagram)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => {})
    } else {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = file.name
      a.click()
    }
  }

  return (
    <div>
      <div className="day-chips">
        <button className={mode === 'mine' ? 'active' : ''} onClick={() => setMode('mine')}>{t(lang, 'my_photos')} ({mine.length})</button>
        <button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>{t(lang, 'all_photos')} ({photos.length})</button>
      </div>
      {mode === 'mine' && !me.photo_consent ? (
        <div className="card empty">
          <p>{t(lang, 'consent_off')}</p>
          <button className="btn" onClick={() => onUpdateMe({ photo_consent: true })}>{t(lang, 'consent_on')}</button>
        </div>
      ) : list.length === 0 ? (
        <div className="card empty">{t(lang, mode === 'mine' ? 'no_my_photos' : 'no_photos')}</div>
      ) : (
        <div className="photo-grid">
          {list.map((p) => <img key={p.id} src={urls[p.storage_path]} alt="" loading="lazy" onClick={() => setOpen(p)} />)}
        </div>
      )}
      {open && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <img src={urls[open.storage_path]} alt="" />
            <div className="actions">
              <button className="btn" onClick={() => download(open)}>{t(lang, 'download')}</button>
              <button className="btn secondary" onClick={() => setOpen(null)}>✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
