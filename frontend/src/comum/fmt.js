// Formatação das horas igual à do portal (pages/Horas.jsx): «+ 1h 30m», «- 45m», «2h 15m».
import { LOCALE } from './i18n'

export function formatHoras(h) {
  if (h === undefined || h === null) return '—'
  const abs = Math.abs(h)
  let hh = Math.floor(abs)
  let mm = Math.round((abs - hh) * 60)
  if (mm === 60) { hh += 1; mm = 0 }
  const sinal = h < 0 ? '- ' : '+ '
  if (hh === 0 && mm === 0) return '0m'
  if (hh === 0) return `${sinal}${mm}m`
  if (mm === 0) return `${sinal}${hh}h 00m`
  return `${sinal}${hh}h ${String(mm).padStart(2, '0')}m`
}

export function formatHorasSimples(h) {
  if (h === undefined || h === null) return '—'
  const abs = Math.abs(h)
  let hh = Math.floor(abs)
  let mm = Math.round((abs - hh) * 60)
  if (mm === 60) { hh += 1; mm = 0 }
  const s = h < 0 ? '-' : ''
  if (hh === 0 && mm === 0) return '0m'
  if (hh === 0) return `${s}${mm}m`
  if (mm === 0) return `${s}${hh}h`
  return `${s}${hh}h ${mm}m`
}

export function relogio(seg) {
  seg = Math.max(0, Math.floor(seg))
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

let moeda = 'EUR'
export const definirMoeda = (m) => { moeda = m || 'EUR' }
export const dinheiro = (v) => new Intl.NumberFormat(LOCALE, { style: 'currency', currency: moeda }).format(v || 0)
export const numero = (v, d = 2) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v || 0)

export function data(s, opts) {
  if (!s) return '—'
  const [a, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString(LOCALE, opts || { day: '2-digit', month: 'short', year: 'numeric' })
}

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function tipoCor(tipo, oferta) {
  if (oferta) return 'var(--text-dim)'
  if (tipo === 'credito') return 'var(--success-text)'
  if (tipo === 'consumo' || tipo === 'expiracao') return 'var(--danger-text)'
  return 'var(--warning-text)'
}
