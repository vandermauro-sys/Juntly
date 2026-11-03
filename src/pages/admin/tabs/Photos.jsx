import { useEffect, useState } from 'react'
import { supabase, errMsg, signedPhotoUrls } from '../../../lib/supabase'
import { useSession } from '../../../lib/session'
import { resizeImage } from '../../../lib/image'

function TagPanel({ photo, url, participants, tags, onClose, onChanged, onDelete }) {
  const [search, setSearch] = useState('')
  const selected = new Set(tags)
  async function toggle(p) {
    if (selected.has(p.id)) {
      await supabase.from('photo_tags').delete().eq('photo_id', photo.id).eq('participant_id', p.id)
    } else {
      await supabase.from('photo_tags').insert({ photo_id: photo.id, participant_id: p.id })
    }
    onChanged()
  }
  const list = participants.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
  return (
    <div className="lightbox" onClick={onClose}>
      <div className="card" style={{ maxWidth: 900, width: '100%', maxHeight: '92vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <div style={{ flex: '1 1 340px' }}><img src={url} alt="" style={{ width: '100%', borderRadius: 10 }} /></div>
          <div style={{ flex: '1 1 260px' }}>
            <h3>Quem aparece nesta foto?</h3>
            <p className="muted">A foto vai para "Minhas fotos" de quem você marcar. Só quem autorizou o uso de imagem pode ser marcado.</p>
            <input placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 8 }} />
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              {list.map((p) => (
                <label key={p.id} className="check" style={{ padding: '6px 0', opacity: p.photo_consent ? 1 : 0.45 }}>
                  <input type="checkbox" disabled={!p.photo_consent} checked={selected.has(p.id)} onChange={() => toggle(p)} />
                  {p.name}{!p.photo_consent && ' (sem autorização)'}
                </label>
              ))}
            </div>
            <div className="split" style={{ marginTop: 12 }}>
              <button className="btn danger small" onClick={onDelete}>Apagar foto</button>
              <button className="btn small" onClick={onClose}>Pronto</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Photos({ trip, participants }) {
  const { session } = useSession()
  const [photos, setPhotos] = useState([])
  const [urls, setUrls] = useState({})
  const [tags, setTags] = useState({}) // photo_id -> [participant_id]
  const [open, setOpen] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    const { data } = await supabase.from('photos').select('*, photo_tags(participant_id)')
      .eq('trip_id', trip.id).order('created_at', { ascending: false })
    const list = data || []
    setPhotos(list)
    setTags(Object.fromEntries(list.map((p) => [p.id, p.photo_tags.map((t) => t.participant_id)])))
    const missing = list.map((p) => p.storage_path).filter((path) => !urls[path])
    if (missing.length) setUrls({ ...urls, ...(await signedPhotoUrls(missing)) })
  }
  useEffect(() => { load() }, [trip.id])

  async function upload(e) {
    const files = [...e.target.files]
    e.target.value = ''
    setError('')
    for (let i = 0; i < files.length; i++) {
      setProgress(`Enviando ${i + 1} de ${files.length}…`)
      const blob = await resizeImage(files[i])
      const path = `${trip.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      const { error: upErr } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (upErr) { setError(errMsg(upErr)); break }
      const { error } = await supabase.from('photos').insert({ trip_id: trip.id, storage_path: path, uploaded_by: session.user.id })
      if (error) { setError(errMsg(error)); break }
    }
    setProgress(null)
    load()
  }

  async function remove(photo) {
    if (!confirm('Apagar esta foto da galeria?')) return
    await supabase.storage.from('photos').remove([photo.storage_path])
    await supabase.from('photos').delete().eq('id', photo.id)
    setOpen(null); load()
  }

  const untagged = photos.filter((p) => !tags[p.id]?.length).length
  const current = photos.find((p) => p.id === open)

  return (
    <div className="stack">
      <div className="card split">
        <div>
          <h3 style={{ margin: 0 }}>Galeria do grupo</h3>
          <div className="muted">{photos.length} fotos · {untagged} sem ninguém marcado</div>
        </div>
        <label className="btn" style={{ margin: 0 }}>
          {progress || 'Enviar fotos'}
          <input type="file" accept="image/*" multiple onChange={upload} hidden disabled={Boolean(progress)} />
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      {photos.length === 0 ? (
        <div className="card empty">Envie as fotos do fotógrafo ou da equipe. Depois toque em cada foto para marcar quem aparece.</div>
      ) : (
        <div className="photo-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {photos.map((p) => (
            <div key={p.id} style={{ position: 'relative' }}>
              <img src={urls[p.storage_path]} alt="" loading="lazy" onClick={() => setOpen(p.id)} />
              {tags[p.id]?.length > 0 && <span className="badge good" style={{ position: 'absolute', left: 6, bottom: 6 }}>{tags[p.id].length}</span>}
            </div>
          ))}
        </div>
      )}
      {current && (
        <TagPanel photo={current} url={urls[current.storage_path]} participants={participants}
          tags={tags[current.id] || []} onClose={() => setOpen(null)} onChanged={load} onDelete={() => remove(current)} />
      )}
    </div>
  )
}
