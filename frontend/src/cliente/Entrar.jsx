// Entrada do cliente: ligação por email (sem palavra-passe) ou palavra-passe própria (T4).
import { useState } from 'react'
import { Mail } from 'lucide-react'
import { post, cli } from '../comum/api'
import { t } from '../comum/i18n'

export default function Entrar({ marca, expirada }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState('ligacao')
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState(expirada ? t('A ligação expirou ou já foi usada. Peça outra.') : '')
  const [ocupado, setOcupado] = useState(false)

  const pedir = async (e) => {
    e.preventDefault()
    setOcupado(true); setErro('')
    try { await post(cli('pedir_ligacao'), { email }); setEnviado(true) } catch (x) { setErro(x.message) }
    setOcupado(false)
  }
  const entrar = async (e) => {
    e.preventDefault()
    setOcupado(true); setErro('')
    const r = await fetch('/api/method/login', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ usr: email, pwd: senha }) })
    if (r.ok) location.href = '/cliente'
    else { setErro(t('Email ou palavra-passe errados.')); setOcupado(false) }
  }
  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-card">
        <div className="login-logo" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <img src={marca?.logotipo || '/assets/orbit_tempo/icons/tempo.svg'} alt="" style={{ height: 44, width: 44, objectFit: 'contain' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{marca?.nome || 'Stratechna Tempo'}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{t('Área de cliente')}</div>
          </div>
        </div>
        {erro && <div className="login-error">{erro}</div>}
        {enviado ? (
          <p style={{ color: 'var(--text-muted)' }}><Mail size={16} style={{ verticalAlign: -3 }} /> {t('Se este email tiver acesso, enviámos uma ligação de entrada. Veja a sua caixa de correio.')}</p>
        ) : (
          <form onSubmit={modo === 'ligacao' ? pedir : entrar}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">{t('Email')}</label>
              <input id="email" className="form-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {modo === 'senha' && (
              <div className="form-group">
                <label className="form-label" htmlFor="senha">{t('Palavra-passe')}</label>
                <input id="senha" className="form-input" type="password" required autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
              </div>
            )}
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={ocupado}>
              {modo === 'ligacao' ? t('Enviar-me uma ligação de entrada') : t('Entrar')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
              onClick={() => { setModo(modo === 'ligacao' ? 'senha' : 'ligacao'); setErro('') }}>
              {modo === 'ligacao' ? t('Prefiro entrar com palavra-passe') : t('Prefiro receber uma ligação por email')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
