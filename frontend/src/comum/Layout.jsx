// O esqueleto do portal (components/Layout.jsx): barra de cima, barra lateral com grupos,
// recolhível em computador e em gaveta no telemóvel. A marca é a do freelancer.
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, LogOut, Menu, X } from 'lucide-react'
import { t } from './i18n'
import { Toasts } from './ui'

function guardado(chave, omissao) {
  try { return localStorage.getItem(chave) ?? omissao } catch (e) { return omissao }
}

export default function Layout({ grupos, marca, utilizador, sair, children, rodape }) {
  const [aberta, setAberta] = useState(false)
  const [recolhida, setRecolhida] = useState(guardado('tempo.recolhida', '0') === '1')
  const alternar = () => {
    setRecolhida((r) => {
      try { localStorage.setItem('tempo.recolhida', r ? '0' : '1') } catch (e) { /* sem armazenamento */ }
      return !r
    })
  }
  const nome = marca?.nome || 'Stratechna Tempo'
  const logo = marca?.logotipo || '/assets/orbit_tempo/icons/tempo.svg'
  return (
    <div className={`layout${recolhida ? ' sidebar-recolhida' : ''}`}>
      <header className="topbar">
        <button className="sidebar-recolher" onClick={alternar}
          aria-label={recolhida ? t('Expandir o menu') : t('Recolher o menu')} title={recolhida ? t('Expandir o menu') : t('Recolher o menu')}>
          {recolhida ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
        <div className="topbar-brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logo} alt="" style={{ height: 32, width: 32, objectFit: 'contain' }} />
          <span className="topbar-title">{nome}</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{utilizador}</span>
          {sair && (
            <button className="btn btn-ghost btn-sm" onClick={sair} title={t('Terminar sessão')} aria-label={t('Terminar sessão')}>
              <LogOut size={15} />
            </button>
          )}
          <button className="sidebar-toggle" onClick={() => setAberta(!aberta)} aria-label={t('Menu')}>
            {aberta ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {aberta && <div className="sidebar-overlay" onClick={() => setAberta(false)} />}

      <aside className={`sidebar ${aberta ? 'open' : ''}`}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img className="sidebar-logo-mini" src={logo} alt="" style={{ height: 32 }} />
          <div className="sidebar-logo-cheio" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logo} alt="" style={{ height: 36, width: 36, objectFit: 'contain' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{nome}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Stratechna Tempo</div>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav" style={{ flex: 1, overflowY: 'auto' }}>
          {grupos.map((g) => (
            <div className="sidebar-section" key={g.label}>
              <div className="sidebar-section-label">{g.label}</div>
              {g.items.map(({ to, icon: Icon, label, end }) => (
                <NavLink key={to} to={to} end={end} title={label} onClick={() => setAberta(false)}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                  <Icon size={16} /><span className="sidebar-label">{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        {rodape}
      </aside>

      <main className="main-content">
        <div className="page-body">{children}</div>
      </main>
      <Toasts />
    </div>
  )
}
