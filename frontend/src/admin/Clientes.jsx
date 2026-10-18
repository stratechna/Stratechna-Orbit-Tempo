import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, UserPlus } from 'lucide-react'
import { get, post } from '../comum/api'
import { t } from '../comum/i18n'
import { formatHorasSimples, dinheiro } from '../comum/fmt'
import { Cabecalho, Campo, Carregando, Erro, Modal, tentar, useDados } from '../comum/ui'

export const LINGUAS = [['', '—'], ['pt', 'Português'], ['es', 'Español'], ['en', 'English'], ['fr', 'Français']]

export default function Clientes() {
  const [q, setQ] = useState('')
  const [novo, setNovo] = useState(false)
  const navigate = useNavigate()
  const { dados, erro, carregando } = useDados(() => get('clientes', { q }), [q])
  return (
    <div>
      <Cabecalho titulo={t('Gestão de Clientes')} sub={t('Os clientes do Orbit, com os acordos e o saldo de horas')}>
        <button className="btn btn-primary btn-sm" onClick={() => setNovo(true)}><UserPlus size={14} />{t('Novo cliente')}</button>
      </Cabecalho>
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Search size={15} style={{ color: 'var(--text-dim)' }} />
        <input className="form-input" style={{ border: 'none', background: 'transparent' }} placeholder={t('Procurar cliente…')}
          value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Procurar cliente')} />
      </div>
      {carregando && !dados ? <Carregando /> : erro ? <Erro>{erro}</Erro> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap"><table>
            <thead><tr><th>{t('Cliente')}</th><th>{t('NIF')}</th><th style={{ textAlign: 'right' }}>{t('Saldo')}</th><th style={{ textAlign: 'right' }}>{t('Por faturar')}</th></tr></thead>
            <tbody>
              {dados.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>{t('Sem clientes.')}</td></tr>}
              {dados.map((c) => (
                <tr key={c.name} style={{ cursor: 'pointer' }} onClick={() => navigate(`/clientes/${encodeURIComponent(c.name)}`)}>
                  <td><Link to={`/clientes/${encodeURIComponent(c.name)}`} style={{ fontWeight: 600 }}>{c.customer_name}</Link>
                    {!c.tem_acordo && <span className="badge badge-grey" style={{ marginLeft: 8 }}>{t('sem acordo')}</span>}</td>
                  <td className="mono">{c.tax_id || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', color: c.saldo && c.saldo.disponivel < 0 ? 'var(--danger-text)' : undefined }}>
                    {c.saldo && c.saldo.creditos ? formatHorasSimples(c.saldo.disponivel) : '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{c.saldo && c.saldo.por_faturar ? dinheiro(c.saldo.por_faturar) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
      {novo && <NovoCliente onFechar={() => setNovo(false)} onCriado={(n) => navigate(`/clientes/${encodeURIComponent(n)}`)} />}
    </div>
  )
}

function NovoCliente({ onFechar, onCriado }) {
  const [f, setF] = useState({ nome: '', nif: '', email: '', contacto: '', lingua: '', tipo: 'Company' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal titulo={t('Novo cliente')} onFechar={onFechar}>
      <form onSubmit={(e) => { e.preventDefault(); tentar(() => post('novo_cliente', { dados: f }), t('Cliente criado.')).then((n) => n && onCriado(n)) }}>
        <Campo rotulo={t('Nome')}><input className="form-input" required value={f.nome} onChange={set('nome')} /></Campo>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Campo rotulo={t('NIF / NIF-IVA')}><input className="form-input" value={f.nif} onChange={set('nif')} /></Campo>
          <Campo rotulo={t('Língua')}><select className="form-input" value={f.lingua} onChange={set('lingua')}>{LINGUAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Campo rotulo={t('Pessoa de contacto')}><input className="form-input" value={f.contacto} onChange={set('contacto')} /></Campo>
          <Campo rotulo={t('Email')} ajuda={t('Para o portal do cliente e os extratos.')}><input className="form-input" type="email" value={f.email} onChange={set('email')} /></Campo>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onFechar}>{t('Cancelar')}</button>
          <button className="btn btn-primary">{t('Criar')}</button>
        </div>
      </form>
    </Modal>
  )
}
