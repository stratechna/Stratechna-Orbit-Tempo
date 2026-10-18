// A ficha do cliente, com abas como no Admin do portal: Dados · Acordos e packs · Extrato de horas ·
// Pedidos · Trabalhos · Documentos.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, KeyRound, Plus } from 'lucide-react'
import { get, post } from '../comum/api'
import { t } from '../comum/i18n'
import { data as fData, dinheiro, formatHorasSimples } from '../comum/fmt'
import ExtratoHoras from '../comum/ExtratoHoras'
import { Cabecalho, Carregando, Erro, Separadores, tentar, useDados } from '../comum/ui'
import FormAcordo from './FormAcordo'

export default function FichaCliente({ arranque }) {
  const { cliente } = useParams()
  const [aba, setAba] = useState('acordos')
  const { dados, erro, carregando, recarregar } = useDados(() => get('ficha_cliente', { cliente }), [cliente])
  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro>{erro}</Erro>
  const abas = [
    { id: 'dados', label: t('Dados') }, { id: 'acordos', label: t('Acordos e packs') }, { id: 'extrato', label: t('Extrato de horas') },
    { id: 'pedidos', label: t('Pedidos') }, { id: 'trabalhos', label: t('Trabalhos') }, { id: 'documentos', label: t('Documentos') },
  ]
  return (
    <div>
      <Link to="/clientes" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}><ArrowLeft size={14} />{t('Clientes')}</Link>
      <Cabecalho titulo={dados.cliente.nome} sub={[dados.cliente.nif, dados.cliente.lingua].filter(Boolean).join(' · ')}>
        <Link className="btn btn-primary btn-sm" to={`/entrada?cliente=${encodeURIComponent(cliente)}`}>{t('Registar horas')}</Link>
      </Cabecalho>
      <Separadores itens={abas} ativo={aba} onChange={setAba} />
      {aba === 'dados' && <Dados dados={dados} recarregar={recarregar} />}
      {aba === 'acordos' && <Acordos dados={dados} cliente={cliente} arranque={arranque} recarregar={recarregar} />}
      {aba === 'extrato' && <ExtratoAdmin cliente={cliente} acordos={dados.acordos.filter((a) => a.tipo !== 'Preço fixo')} arranque={arranque} />}
      {aba === 'pedidos' && <Tabela linhas={dados.pedidos} vazio={t('Sem pedidos com tempo registado.')}
        colunas={[['#', (b) => <span className="mono">{b.name}</span>], [t('Assunto'), (b) => b.subject], [t('Estado'), (b) => b.status],
          [t('Tempo'), (b) => <span className="mono">{formatHorasSimples(b.horas)}</span>, true]]} />}
      {aba === 'trabalhos' && <Tabela linhas={dados.projetos} vazio={t('Sem projetos.')}
        colunas={[[t('Projeto'), (p) => <a href={`/app/project/${encodeURIComponent(p.name)}`}>{p.project_name}</a>], [t('Estado'), (p) => p.status],
          [t('Progresso'), (p) => `${Math.round(p.percent_complete || 0)} %`, true], [t('Fim previsto'), (p) => fData(p.expected_end_date), true]]} />}
      {aba === 'documentos' && <>
        <h3 style={{ fontSize: '1rem', margin: '0 0 10px' }}>{t('Orçamentos')}</h3>
        <Tabela linhas={dados.orcamentos} vazio={t('Sem orçamentos.')}
          colunas={[[t('Orçamento'), (o) => <a className="mono" href={`/app/quotation/${encodeURIComponent(o.name)}`}>{o.name}</a>], [t('Data'), (o) => fData(o.transaction_date)],
            [t('Estado'), (o) => o.status], [t('Total'), (o) => <span className="mono">{dinheiro(o.grand_total)}</span>, true]]} />
        <h3 style={{ fontSize: '1rem', margin: '20px 0 10px' }}>{t('Extratos')}</h3>
        <Tabela linhas={dados.extratos} vazio={t('Sem extratos.')}
          colunas={[[t('Período'), (e) => `${fData(e.desde)} – ${fData(e.ate)}`], [t('Estado'), (e) => t(e.estado)],
            [t('Horas'), (e) => <span className="mono">{formatHorasSimples(e.horas_consumidas)}</span>, true],
            [t('Valor'), (e) => <span className="mono">{dinheiro(e.valor)}</span>, true], [t('Fatura'), (e) => e.fatura_numero || '—', true]]} />
        <p style={{ marginTop: 12 }}><a className="btn btn-secondary btn-sm" href={`/app/quotation/new?party_name=${encodeURIComponent(cliente)}`}><Plus size={14} />{t('Novo orçamento no ERP')}</a></p>
      </>}
    </div>
  )
}

function Dados({ dados, recarregar }) {
  return (
    <div className="card">
      <div className="card-header"><div className="card-title">{t('Contactos e acesso ao portal do cliente')}</div></div>
      {dados.contactos.length === 0 && <p style={{ color: 'var(--text-dim)' }}>{t('Sem contactos. Crie-os no CRM ou no ERP, ligados a este cliente.')}</p>}
      {dados.contactos.map((c) => (
        <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{[c.first_name, c.last_name].filter(Boolean).join(' ')}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{[c.email_id, c.phone].filter(Boolean).join(' · ')}</div>
          </div>
          {c.user ? <span className="badge badge-green">{t('com acesso')}</span> : c.email_id && (
            <button className="btn btn-secondary btn-sm" onClick={() => tentar(() => post('dar_acesso', { contacto: c.name }),
              t('Acesso dado. O cliente entra em /cliente com uma ligação por email.')).then(recarregar)}>
              <KeyRound size={14} />{t('Dar acesso ao portal')}</button>
          )}
        </div>
      ))}
      <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 12 }}>
        {t('Os clientes entram na área de cliente deste Orbit, sem conta Stratechna, e não contam como utilizadores.')}
      </p>
    </div>
  )
}

function Acordos({ dados, cliente, arranque, recarregar }) {
  const [editar, setEditar] = useState(null)
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setEditar({ cliente, tipo: 'Hora', ativo: 1 })}><Plus size={14} />{t('Novo acordo')}</button>
      </div>
      {dados.acordos.length === 0 && <div className="card empty-state">{t('Sem acordos: crie um para poder registar tempo.')}</div>}
      <div className="stats-grid">
        {dados.acordos.map((a) => (
          <div className="stat-card" key={a.name} style={{ opacity: a.ativo ? 1 : 0.55, borderLeft: `3px solid ${a.cor || 'var(--slate)'}` }}>
            <div className="stat-label">{a.titulo} · {t(a.tipo)}</div>
            <div className="stat-value mono">
              {a.tipo === 'Pack' || a.tipo === 'Avença' ? formatHorasSimples(a.saldo.disponivel)
                : a.tipo === 'Preço fixo' ? t('preço fixo') : `${dinheiro(a.preco_efetivo)}/h`}
            </div>
            <div className="stat-sub">
              {a.tipo === 'Pack' && t('{0} h · {1} gastas', a.horas_pack || 0, formatHorasSimples(a.saldo.consumos))}
              {a.tipo === 'Hora' && a.saldo.por_faturar > 0 && t('{0} por faturar', dinheiro(a.saldo.por_faturar))}
              {a.data_fim && <> · {t('até {0}', fData(a.data_fim))}</>}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditar(a)}>{t('Editar')}</button>
              {a.tipo === 'Pack' && !a.credito_lancado && (
                <button className="btn btn-primary btn-sm" onClick={() => confirm(t('Lançar o crédito das {0} horas do pack?', a.horas_pack)) &&
                  tentar(() => post('creditar_pack', { acordo: a.name }), t('Crédito do pack lançado.')).then(recarregar)}>
                  {t('Pack pago — lançar horas')}</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {editar && <FormAcordo acordo={editar} arranque={arranque} onFechar={() => setEditar(null)} onGuardado={() => { setEditar(null); recarregar() }} />}
    </div>
  )
}

function ExtratoAdmin({ cliente, acordos, arranque }) {
  const [acordo, setAcordo] = useState(acordos[0]?.name || null)
  const { dados, erro, carregando } = useDados(() => acordo ? post('extrato_cliente', { cliente, acordo }) : Promise.resolve(null), [cliente, acordo])
  if (!acordos.length) return <div className="card empty-state">{t('Sem acordos com extrato.')}</div>
  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro>{erro}</Erro>
  return <ExtratoHoras acordos={acordos} acordo={acordo} onAcordo={setAcordo} saldo={dados?.saldo} movimentos={dados?.movimentos}
    alerta={arranque.definicoes.alerta_saldo_horas || 2} />
}

export function Tabela({ linhas, colunas, vazio }) {
  if (!linhas || !linhas.length) return <div className="card empty-state">{vazio}</div>
  return (
    <div className="card" style={{ padding: 0 }}><div className="table-wrap"><table>
      <thead><tr>{colunas.map(([n, , direita]) => <th key={n} style={direita ? { textAlign: 'right' } : undefined}>{n}</th>)}</tr></thead>
      <tbody>{linhas.map((l, i) => (
        <tr key={l.name || i}>{colunas.map(([n, f, direita]) => <td key={n} style={direita ? { textAlign: 'right' } : undefined}>{f(l)}</td>)}</tr>
      ))}</tbody>
    </table></div></div>
  )
}
