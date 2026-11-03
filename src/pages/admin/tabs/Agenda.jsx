import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../../../lib/supabase'
import { useSession } from '../../../lib/session'
import { fmtDay, fmtTime, groupBy } from '../../../lib/format'

const EMPTY = { day: '', start_time: '', end_time: '', title: '', location: '', address: '', bring: '', notes: '', group_label: '' }

export default function Agenda({ trip, groups }) {
  const { session } = useSession()
  const [items, setItems] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [notify, setNotify] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    const { data } = await supabase.from('agenda_items').select('*').eq('trip_id', trip.id)
      .order('day').order('start_time', { nullsFirst: true })
    setItems(data || [])
  }
  useEffect(() => { load() }, [trip.id])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  function startEdit(item) {
    setEditing(item ? item.id : 'new')
    setNotify(Boolean(item))
    setForm(item
      ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, item[k] ? (k.endsWith('time') ? fmtTime(item[k]) : item[k]) : '']))
      : { ...EMPTY, day: items.length ? items[items.length - 1].day : (trip.start_date || '') })
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    const row = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() ? v.trim() : null]))
    const q = editing === 'new'
      ? supabase.from('agenda_items').insert({ ...row, trip_id: trip.id })
      : supabase.from('agenda_items').update(row).eq('id', editing)
    const { error } = await q
    if (error) return setError(errMsg(error))
    if (editing !== 'new' && notify) {
      await supabase.from('announcements').insert({
        trip_id: trip.id,
        title: `Mudança na agenda: ${row.title}`,
        body: `${fmtDay(row.day)}${row.start_time ? ` às ${row.start_time}` : ''}${row.location ? ` · ${row.location}` : ''}`,
        group_label: row.group_label,
        urgent: true,
        created_by: session.user.id
      })
    }
    setEditing(null); load()
  }

  async function remove(item) {
    if (!confirm(`Apagar "${item.title}" da agenda?`)) return
    await supabase.from('agenda_items').delete().eq('id', item.id)
    load()
  }

  async function duplicate(item) {
    const { id, updated_at, ...rest } = item
    await supabase.from('agenda_items').insert({ ...rest, title: `${item.title} (cópia)` })
    load()
  }

  const byDay = groupBy(items, (i) => i.day)

  return (
    <div className="stack">
      <div className="split">
        <p className="muted" style={{ margin: 0 }}>As mudanças aparecem na hora no celular de todo o grupo.</p>
        <button className="btn small" onClick={() => startEdit(null)}>Adicionar atividade</button>
      </div>
      {error && <div className="error">{error}</div>}

      {editing && (
        <form className="card" onSubmit={save}>
          <h3>{editing === 'new' ? 'Nova atividade' : 'Editar atividade'}</h3>
          <div className="row">
            <div className="field"><label>Dia</label><input type="date" required value={form.day} onChange={set('day')} /></div>
            <div className="field"><label>Início</label><input type="time" value={form.start_time} onChange={set('start_time')} /></div>
            <div className="field"><label>Fim</label><input type="time" value={form.end_time} onChange={set('end_time')} /></div>
          </div>
          <div className="field"><label>Atividade</label><input required value={form.title} onChange={set('title')} placeholder="Saída do hotel para o Epcot" /></div>
          <div className="row">
            <div className="field"><label>Local</label><input value={form.location} onChange={set('location')} placeholder="Lobby do hotel" /></div>
            <div className="field"><label>Endereço (para o botão de rota)</label><input value={form.address} onChange={set('address')} /></div>
          </div>
          <div className="row">
            <div className="field"><label>O que levar</label><input value={form.bring} onChange={set('bring')} placeholder="Ingresso, protetor solar, capa de chuva" /></div>
            <div className="field">
              <label>Só para o grupo</label>
              <select value={form.group_label} onChange={set('group_label')}>
                <option value="">Todos</option>
                {groups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Observações</label><textarea value={form.notes} onChange={set('notes')} /></div>
          {editing !== 'new' && (
            <label className="check field">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              Avisar o grupo sobre esta mudança
            </label>
          )}
          <div className="row" style={{ flex: 'none' }}>
            <button className="btn">Salvar</button>
            <button type="button" className="btn secondary" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {items.length === 0 && !editing && <div className="card empty">A agenda está vazia. Adicione a primeira atividade.</div>}

      {Object.entries(byDay).map(([day, list]) => (
        <div className="card" key={day}>
          <h3 className="cap">{fmtDay(day)}</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id}>
                    <td style={{ width: 90, whiteSpace: 'nowrap' }}><strong>{fmtTime(i.start_time)}</strong>{i.end_time && <span className="muted"> – {fmtTime(i.end_time)}</span>}</td>
                    <td>
                      <strong>{i.title}</strong> {i.group_label && <span className="badge">{i.group_label}</span>}
                      {i.location && <div className="muted">{i.location}</div>}
                      {i.bring && <div className="muted">Levar: {i.bring}</div>}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn ghost small" onClick={() => startEdit(i)}>Editar</button>
                      <button className="btn ghost small" onClick={() => duplicate(i)}>Duplicar</button>
                      <button className="btn ghost small" onClick={() => remove(i)}>Apagar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
