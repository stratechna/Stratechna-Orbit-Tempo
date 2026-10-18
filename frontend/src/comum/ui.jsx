// Peças pequenas, com as classes do portal (.card, .btn, .alert, .stat-card, .tabs…).
import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { t } from './i18n'

export function Carregando() {
  return <div className="loading-page"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
}

export function Erro({ children }) {
  if (!children) return null
  return <div className="alert alert-danger"><AlertTriangle size={16} />{children}</div>
}

export function Aviso({ tipo = 'warning', children }) {
  return <div className={`alert alert-${tipo}`}><AlertTriangle size={16} />{children}</div>
}

export function Cabecalho({ titulo, sub, children }) {
  return (
    <div className="section-header">
      <div>
        <div className="section-title">{titulo}</div>
        {sub && <div className="section-sub">{sub}</div>}
      </div>
      {children && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>}
    </div>
  )
}

export function Stat({ rotulo, valor, sub, cor }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{rotulo}</div>
      <div className="stat-value mono" style={cor ? { color: cor } : undefined}>{valor}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function Separadores({ itens, ativo, onChange }) {
  return (
    <div className="tabs" style={{ marginBottom: 20 }}>
      {itens.map((i) => (
        <button key={i.id} className={`tab ${ativo === i.id ? 'active' : ''}`} onClick={() => onChange(i.id)}
          style={ativo === i.id && i.cor ? { borderColor: i.cor, color: i.cor, background: `${i.cor}18` } : undefined}>
          {i.label}
        </button>
      ))}
    </div>
  )
}

export function Campo({ rotulo, ajuda, children, style }) {
  return (
    <div className="form-group" style={style}>
      {rotulo && <label className="form-label">{rotulo}</label>}
      {children}
      {ajuda && <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4 }}>{ajuda}</div>}
    </div>
  )
}

export function Modal({ titulo, onFechar, children, largura = 520 }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onFechar()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onFechar])
  return (
    <div onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="card"
        style={{ width: `min(${largura}px, 100%)`, maxHeight: 'calc(100vh - 32px)', overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ flex: 1, fontSize: '1rem', fontWeight: 700 }}>{titulo}</div>
          <button className="btn btn-ghost btn-icon" onClick={onFechar} aria-label={t('Fechar')}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

let avisar = () => {}
export const toast = (msg, tipo = 'success') => avisar(msg, tipo)

export function Toasts() {
  const [lista, setLista] = useState([])
  useEffect(() => {
    avisar = (msg, tipo) => {
      const id = Math.random()
      setLista((l) => [...l, { id, msg, tipo }])
      setTimeout(() => setLista((l) => l.filter((x) => x.id !== id)), 4000)
    }
  }, [])
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 2000, display: 'grid', gap: 8 }} role="status">
      {lista.map((x) => (
        <div key={x.id} className={`alert alert-${x.tipo === 'erro' ? 'danger' : 'success'}`} style={{ margin: 0, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
          {x.tipo === 'erro' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}{x.msg}
        </div>
      ))}
    </div>
  )
}

// Executa uma acção e mostra o erro do servidor, se houver.
export async function tentar(fn, sucesso) {
  try {
    const r = await fn()
    if (sucesso) toast(sucesso)
    return r
  } catch (e) {
    toast(e.message, 'erro')
    return undefined
  }
}

// Carrega dados de um método; recarregar() volta a pedir.
export function useDados(fn, deps = []) {
  const [estado, setEstado] = useState({ dados: null, erro: '', carregando: true })
  const [n, setN] = useState(0)
  useEffect(() => {
    let vivo = true
    setEstado((s) => ({ ...s, carregando: true }))
    fn().then((dados) => vivo && setEstado({ dados, erro: '', carregando: false }))
      .catch((e) => vivo && setEstado({ dados: null, erro: e.message, carregando: false }))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n])
  return { ...estado, recarregar: () => setN((x) => x + 1) }
}
