import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

// Leitor de QR pela câmera traseira. Chama onScan(texto) a cada leitura nova.
export default function QrScanner({ onScan, onError }) {
  const last = useRef({ text: '', at: 0 })

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader')
    let running = false
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => {
          const now = Date.now()
          // ignora a mesma leitura repetida em menos de 3 segundos
          if (text === last.current.text && now - last.current.at < 3000) return
          last.current = { text, at: now }
          onScan(text)
        },
        () => {}
      )
      .then(() => { running = true })
      .catch((err) => onError && onError(String(err)))
    return () => {
      if (running) scanner.stop().then(() => scanner.clear()).catch(() => {})
    }
  }, [])

  return <div id="qr-reader" />
}
