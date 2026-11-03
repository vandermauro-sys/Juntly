import { useState } from 'react'
import Papa from 'papaparse'
import { supabase, errMsg } from '../../../lib/supabase'

const EMPTY = { name: '', email: '', phone: '', group_label: '', room: '', emergency_contact: '' }

// Aceita cabeçalhos em português ou inglês
const COLS = {
  name: ['nome', 'name', 'nome completo'],
  email: ['email', 'e-mail'],
  phone: ['telefone', 'celular', 'whatsapp', 'phone'],
  group_label: ['grupo', 'onibus', 'ônibus', 'group', 'bus'],
  room: ['quarto', 'room'],
  emergency_contact: ['emergencia', 'emergência', 'contato de emergencia', 'contato de emergência', 'emergency']
}

function pick(row, keys) {
  const found = Object.keys(row).find((k) => keys.includes(k.trim().toLowerCase()))
  return found ? String(row[found] || '').trim() : ''
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
}

export default function Participants({ trip, participants, groups, reloadParticipants }) {
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null) // id ou 'new'
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  function startEdit(p) {
    setEditing(p ? p.id : 'new')
    setForm(p ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k] || ''])) } : EMPTY)
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    const row = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]))
    const q = editing === 'new'
      ? supabase.from('participants').insert({ ...row, trip_id: trip.id })
      : supabase.from('participants').update(row).eq('id', editing)
    const { error } = await q
    if (error) return setError(errMsg(error))
    setEditing(null); reloadParticipants()
  }

  async function remove(p) {
    if (!confirm(`Remover ${p.name} da viagem?`)) return
    const { error } = await supabase.from('participants').delete().eq('id', p.id)
    if (error) return setError(errMsg(error))
    reloadParticipants()
  }

  function importCsv(e) {
    const file = e.target.files[0]
    if (!file) return
    setError(''); setMsg('')
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data }) => {
        const rows = data
          .map((r) => Object.fromEntries(Object.entries(COLS).map(([k, keys]) => [k, pick(r, keys) || null])))
          .filter((r) => r.name)
          .map((r) => ({ ...r, trip_id: trip.id }))
        if (!rows.length) return setError('Não encontrei nenhuma linha com a coluna "nome".')
        const { error } = await supabase.from('participants').insert(rows)
        if (error) return setError(errMsg(error))
        setMsg(`${rows.length} participantes importados.`)
        reloadParticipants()
      }
    })
    e.target.value = ''
  }

  function exportCsv() {
    const csv = Papa.unparse(participants.map((p) => ({
      nome: p.name, email: p.email, telefone: p.phone, grupo: p.group_label, quarto: p.room,
      emergencia: p.emergency_contact, no_app: p.user_id ? 'sim' : 'não', autoriza_imagem: p.photo_consent ? 'sim' : 'não'
    })))
    download(`participantes-${trip.code}.csv`, csv)
  }

  const shown = participants.filter((p) =>
    !filter || p.group_label === filter || (filter === '__none' && !p.group_label))

  return (
    <div className="stack">
      <div className="split">
        <div className="row" style={{ flex: 'none', alignItems: 'center' }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todos os grupos ({participants.length})</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            <option value="__none">Sem grupo</option>
          </select>
        </div>
        <div className="row" style={{ flex: 'none' }}>
          <label className="btn secondary small" style={{ margin: 0 }}>
            Importar planilha (CSV)
            <input type="file" accept=".csv,text/csv" onChange={importCsv} hidden />
          </label>
          <button className="btn secondary small" onClick={() => download('modelo-participantes.csv', 'nome,email,telefone,grupo,quarto,emergencia\nMaria Silva,maria@email.com,+55 11 99999-0000,Ônibus 1,1203,João Silva +55 11 98888-0000\n')}>Baixar modelo</button>
          <button className="btn secondary small" onClick={exportCsv} disabled={!participants.length}>Exportar</button>
          <button className="btn small" onClick={() => startEdit(null)}>Adicionar</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {msg && <p className="badge good">{msg}</p>}

      {editing && (
        <form className="card" onSubmit={save}>
          <h3>{editing === 'new' ? 'Novo participante' : 'Editar participante'}</h3>
          <div className="row">
            <div className="field"><label>Nome</label><input required value={form.name} onChange={set('name')} /></div>
            <div className="field"><label>E-mail</label><input type="email" value={form.email} onChange={set('email')} /></div>
            <div className="field"><label>Celular</label><input value={form.phone} onChange={set('phone')} /></div>
          </div>
          <div className="row">
            <div className="field">
              <label>Grupo / ônibus</label>
              <input list="groups" value={form.group_label} onChange={set('group_label')} placeholder="Ônibus 1" />
              <datalist id="groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
            </div>
            <div className="field"><label>Quarto</label><input value={form.room} onChange={set('room')} /></div>
            <div className="field"><label>Contato de emergência</label><input value={form.emergency_contact} onChange={set('emergency_contact')} /></div>
          </div>
          <div className="row" style={{ flex: 'none' }}>
            <button className="btn">Salvar</button>
            <button type="button" className="btn secondary" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {participants.length === 0 ? (
        <div className="card empty">
          Importe a lista do grupo por planilha ou adicione as pessoas uma a uma.
          Quem entrar pelo link da viagem também aparece aqui automaticamente.
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Nome</th><th>Contato</th><th>Grupo</th><th>Quarto</th><th>App</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong>{p.photo_consent && <div className="muted">Autoriza imagem</div>}</td>
                  <td>{p.phone}<div className="muted">{p.email}</div></td>
                  <td>{p.group_label || <span className="muted">—</span>}</td>
                  <td>{p.room || <span className="muted">—</span>}</td>
                  <td>{p.user_id ? <span className="badge good">No app</span> : <span className="badge">Convidado</span>}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn ghost small" onClick={() => startEdit(p)}>Editar</button>
                    <button className="btn ghost small" onClick={() => remove(p)}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
