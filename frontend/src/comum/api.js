// Pedidos ao Frappe do próprio tenant. Nenhum endereço absoluto: o mesmo código serve em
// qualquer domínio (fortavia.orbit.stratechna.com hoje, orbit.fortavia.es depois).
import { t } from './i18n'

const BOOT = window.TEMPO_BOOT || {}

function mensagem(j) {
  try {
    const msgs = JSON.parse(j._server_messages || '[]').map((m) => JSON.parse(m).message)
    const div = document.createElement('div')
    div.innerHTML = msgs.join(' ')
    return div.textContent
  } catch (e) {
    return j.exception || ''
  }
}

async function chamar(metodo, args, post) {
  const base = metodo.includes('.') ? metodo : `orbit_tempo.api.${metodo}`
  let url = `/api/method/${base}`
  const op = { headers: { Accept: 'application/json', 'X-Frappe-CSRF-Token': BOOT.csrf_token }, credentials: 'same-origin' }
  if (post) {
    op.method = 'POST'
    op.headers['Content-Type'] = 'application/json'
    op.body = JSON.stringify(args || {})
  } else if (args) {
    const q = new URLSearchParams()
    Object.entries(args).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && q.append(k, v))
    url += `?${q}`
  }
  const r = await fetch(url, op)
  let j = {}
  try { j = await r.json() } catch (e) { /* sem corpo */ }
  if (!r.ok || j.exc) throw new Error(mensagem(j) || t('Ocorreu um erro. Tente novamente.'))
  return j.message
}

export const get = (m, a) => chamar(m, a, false)
export const post = (m, a) => chamar(m, a, true)
export const cli = (m) => `orbit_tempo.cliente.${m}`
export { BOOT }
