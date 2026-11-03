import { useState } from 'react'
import { supabase, errMsg } from '../../../lib/supabase'

const TEMPLATE = `O QUE LEVAR
- Passaporte e documentos de viagem
- Roupas leves e um casaco para o ar-condicionado
- Protetor solar, boné e garrafa de água
- Capa de chuva (chuvas rápidas à tarde são comuns)

CLIMA E FUSO
- Confira a previsão na véspera de cada dia
- Fuso horário: Eastern Time (ET)

DINHEIRO
- Moeda: dólar americano (US$)
- Cartões são aceitos em quase todo lugar
- Gorjeta em restaurantes: 18% a 20%

REGRAS DO GRUPO
- Chegue 10 minutos antes de cada saída
- Mantenha o app com notificações ligadas
- Em caso de dúvida, fale com o coordenador

FRASES ÚTEIS
- "Where is the restroom?" — Onde fica o banheiro?
- "How much is this?" — Quanto custa?
- "I need help." — Preciso de ajuda.`

export default function Guide({ trip, reloadTrip }) {
  const [text, setText] = useState(trip.guide || '')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function save() {
    setMsg(''); setError('')
    const { error } = await supabase.from('trips').update({ guide: text }).eq('id', trip.id)
    if (error) return setError(errMsg(error))
    setMsg('Guia publicado.'); reloadTrip()
  }

  return (
    <div className="card">
      <div className="split">
        <h3 style={{ margin: 0 }}>Guia da viagem</h3>
        {!text && <button className="btn secondary small" onClick={() => setText(TEMPLATE)}>Usar modelo</button>}
      </div>
      <p className="muted">O que levar, clima, moeda, regras do grupo e frases úteis. Os participantes leem na aba Guia, mesmo sem internet depois de abrir uma vez.</p>
      {error && <div className="error">{error}</div>}
      {msg && <p className="badge good">{msg}</p>}
      <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 360, fontFamily: 'inherit' }} />
      <button className="btn" style={{ marginTop: 12 }} onClick={save}>Salvar e publicar</button>
    </div>
  )
}
