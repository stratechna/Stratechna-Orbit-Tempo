// Stratechna Tempo — uma só interface, dois lados: Admin em /tempo, Cliente em /cliente.
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './comum/portal.css'
import './comum/tempo.css'
import { BOOT, cli, get } from './comum/api'
import { t } from './comum/i18n'
import { definirMoeda } from './comum/fmt'
import { Carregando, Erro } from './comum/ui'
import AdminApp from './admin/AdminApp'
import ClienteApp from './cliente/ClienteApp'
import Entrar from './cliente/Entrar'

function marcaNaPagina(marca) {
  if (marca && marca.cor) {
    document.documentElement.style.setProperty('--red', marca.cor)
    document.documentElement.style.setProperty('--red-light', marca.cor)
    document.documentElement.style.setProperty('--red-hover', marca.cor)
  }
  document.title = `${marca && marca.nome ? `${marca.nome} · ` : ''}${BOOT.modo === 'admin' ? 'Stratechna Tempo' : t('Área de cliente')}`
}

function NaoSubscrito({ sub }) {
  return (
    <div className="login-page"><div className="login-card">
      <div style={{ fontWeight: 700, fontSize: '1.2rem', marginBottom: 8 }}>Stratechna Tempo</div>
      <p style={{ color: 'var(--text-muted)' }}>{t('O Stratechna Tempo precisa de {0} no seu Orbit.', sub.faltam.join(', '))}</p>
      <a className="btn btn-primary" href={sub.portal} style={{ marginTop: 12 }}>{t('Subscrever no portal Stratechna')}</a>
    </div></div>
  )
}

function App() {
  const [arranque, setArranque] = useState(null)
  const [erro, setErro] = useState('')
  const carregar = () => get(BOOT.modo === 'admin' ? 'arranque' : cli('arranque'))
    .then((a) => { setArranque(a); definirMoeda(a.moeda || (a.definicoes && a.definicoes.moeda)); marcaNaPagina(a.marca) })
    .catch((e) => setErro(e.message))
  useEffect(() => { if (BOOT.modo !== 'entrar') carregar(); else marcaNaPagina(BOOT.marca) }, [])

  if (BOOT.modo === 'entrar') return <Entrar marca={BOOT.marca} expirada={BOOT.expirada} />
  if (erro) return <div style={{ padding: 24 }}><Erro>{erro}</Erro></div>
  if (!arranque) return <Carregando />
  if (BOOT.modo === 'admin' && !arranque.subscricao.ok) return <NaoSubscrito sub={arranque.subscricao} />
  return (
    <BrowserRouter basename={BOOT.modo === 'admin' ? '/tempo' : '/cliente'}>
      {BOOT.modo === 'admin' ? <AdminApp arranque={arranque} atualizar={carregar} /> : <ClienteApp arranque={arranque} />}
    </BrowserRouter>
  )
}

createRoot(document.getElementById('tempo')).render(<StrictMode><App /></StrictMode>)
