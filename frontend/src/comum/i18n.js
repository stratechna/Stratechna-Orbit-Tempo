// A interface escreve-se em português; cada frase traduz-se pelo csv da própria app
// (window.TEMPO_BOOT.traducoes), sem passar pelas traduções globais do site.
const TR = (window.TEMPO_BOOT || {}).traducoes || {}
export const LANG = (window.TEMPO_BOOT || {}).lang || 'pt'
export const LOCALE = { pt: 'pt-PT', es: 'es-ES', en: 'en-GB', fr: 'fr-FR' }[LANG.slice(0, 2)] || LANG

export function t(s, ...a) {
  let r = TR[s] || s
  a.forEach((v, i) => { r = r.split(`{${i}}`).join(v) })
  return r
}
