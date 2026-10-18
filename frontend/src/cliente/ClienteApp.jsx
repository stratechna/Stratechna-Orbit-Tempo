// Lado Cliente — o cliente do freelancer (decisão T4). Menu curto «A minha empresa».
import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { CheckSquare, Clock, FileText, LifeBuoy, Package } from 'lucide-react'
import Layout from '../comum/Layout'
import ExtratoHoras from '../comum/ExtratoHoras'
import { cli, get, post } from '../comum/api'
import { t } from '../comum/i18n'
import { data as fData, dinheiro, formatHorasSimples } from '../comum/fmt'
import { Aviso, Cabecalho, Carregando, Erro, Modal, tentar, useDados } from '../comum/ui'

export default function ClienteApp({ arranque }) {
  const [cliente, setCliente] = useState(arranque.cliente)
  const grupos = [{
    label: t('A minha empresa'),
    items: [
      { to: '/', icon: Clock, label: t('Extrato de Horas'), end: true },
      { to: '/packs', icon: Package, label: t('Packs') },
      { to: '/aprovacoes', icon: CheckSquare, label: t('Aprovações') },
      { to: '/pedidos', icon: LifeBuoy, label: t('Pedidos') },
      { to: '/documentos', icon: FileText, label: t('Documentos') },
    ],
  }]
  const sair = async () => { await fetch('/api/method/logout', { credentials: 'same-origin' }); location.href = '/cliente' }
  const rodape = arranque.clientes.length > 1 && (
    <div className="sidebar-footer" style={{ padding: 12 }}>
      <select className="form-input" value={cliente} onChange={(e) => setCliente(e.target.value)} aria-label={t('Empresa')}>
        {arranque.clientes.map((c) => <option key={c.name} value={c.name}>{c.nome}</option>)}
      </select>
    </div>
  )
  return (
    <Layout grupos={grupos} marca={arranque.marca} utilizador={arranque.nome} sair={sair} rodape={rodape}>
      <Routes>
        <Route path="/" element={<Extrato cliente={cliente} alerta={arranque.alerta_saldo_horas} key={cliente} />} />
        <Route path="/packs" element={<Packs cliente={cliente} key={cliente} />} />
        <Route path="/aprovacoes" element={<Aprovacoes cliente={cliente} key={cliente} />} />
        <Route path="/pedidos" element={<Pedidos cliente={cliente} key={cliente} />} />
        <Route path="/documentos" element={<Documentos cliente={cliente} key={cliente} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

function Extrato({ cliente, alerta }) {
  const [acordo, setAcordo] = useState(null)
  const { dados, erro, carregando } = useDados(() => get(cli('extrato'), { cliente, acordo }), [cliente, acordo])
  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro>{erro}</Erro>
  if (!dados.acordos.length) return <Aviso tipo="warning">{t('Ainda não há horas registadas para a sua empresa.')}</Aviso>
  return <ExtratoHoras acordos={dados.acordos} acordo={dados.acordo} onAcordo={setAcordo} saldo={dados.saldo}
    movimentos={dados.movimentos} alerta={alerta} />
}

function Packs({ cliente }) {
  const { dados, erro, carregando } = useDados(() => get(cli('packs'), { cliente }), [cliente])
  if (carregando) return <Carregando />
  if (erro) return <Erro>{erro}</Erro>
  return (
    <div>
      <Cabecalho titulo={t('Packs de horas')} sub={t('O seu pack ativo e os packs disponíveis para renovar')} />
      {dados.packs.length === 0 && <div className="card empty-state">{t('Ainda não tem nenhum pack.')}</div>}
      <div className="stats-grid">
        {dados.packs.map((p) => (
          <div className="stat-card" key={p.name}>
            <div className="stat-label">{p.titulo}</div>
            <div className="stat-value mono" style={{ color: p.saldo.disponivel >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>
              {formatHorasSimples(p.saldo.disponivel)}
            </div>
            <div className="stat-sub">
              {t('{0} contratadas · {1} gastas', formatHorasSimples(p.saldo.creditos), formatHorasSimples(p.saldo.consumos))}
              {p.data_fim && <><br />{t('Válido até {0}', fData(p.data_fim))}</>}
            </div>
          </div>
        ))}
      </div>
      {dados.catalogo.length > 0 && (
        <>
          <h3 style={{ margin: '24px 0 12px', fontSize: '1rem' }}>{t('Packs disponíveis')}</h3>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap"><table>
              <thead><tr><th>{t('Pack')}</th><th style={{ textAlign: 'right' }}>{t('Horas')}</th><th style={{ textAlign: 'right' }}>{t('Desconto')}</th>
                <th style={{ textAlign: 'right' }}>{t('Validade')}</th><th style={{ textAlign: 'right' }}>{t('Preço')}</th></tr></thead>
              <tbody>{dados.catalogo.map((p) => (
                <tr key={p.name}><td>{p.titulo}</td><td className="mono" style={{ textAlign: 'right' }}>{p.horas}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{p.desconto ? `${p.desconto} %` : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{t('{0} meses', p.validade_meses)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{dinheiro(p.preco_total)}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 8 }}>{t('Para renovar, peça-nos um orçamento: aparece em Documentos para aceitar.')}</p>
        </>
      )}
    </div>
  )
}

const COR_ESTADO = { Enviado: 'badge-yellow', Contestado: 'badge-red', Aprovado: 'badge-green', Faturado: 'badge-blue' }

function Aprovacoes({ cliente }) {
  const { dados, erro, carregando, recarregar } = useDados(() => get(cli('aprovacoes'), { cliente }), [cliente])
  const [contestar, setContestar] = useState(null)
  const [motivo, setMotivo] = useState('')
  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro>{erro}</Erro>
  return (
    <div>
      <Cabecalho titulo={t('Aprovações')} sub={t('Os extratos de cada período: aprove, ou conteste uma linha')} />
      {dados.length === 0 && <div className="card empty-state">{t('Não há extratos para aprovar.')}</div>}
      {dados.map((e) => (
        <div className="card" key={e.name} style={{ marginBottom: 16 }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="card-title" style={{ flex: 1 }}>{t('{0} a {1}', fData(e.desde), fData(e.ate))}</div>
            <span className={`badge ${COR_ESTADO[e.estado] || 'badge-grey'}`}>{t(e.estado)}{e.aprovacao_tacita ? ` · ${t('tácita')}` : ''}</span>
            <span className="mono">{formatHorasSimples(e.horas_consumidas)}</span>
            {e.valor > 0 && <span className="mono">{dinheiro(e.valor)}</span>}
            {['Enviado', 'Contestado'].includes(e.estado) && (
              <button className="btn btn-primary btn-sm" onClick={() => tentar(() => post(cli('aprovar'), { extrato: e.name }), t('Extrato aprovado.')).then(recarregar)}>
                {t('Aprovar')}
              </button>
            )}
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>{t('Data')}</th><th>{t('Descrição')}</th><th style={{ textAlign: 'right' }}>{t('Tempo')}</th><th /></tr></thead>
            <tbody>{e.linhas.map((l) => {
              const c = e.contestacoes.find((x) => x.movimento === l.name)
              return (
                <tr key={l.name}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fData(l.data)}</td>
                  <td>{l.descricao || '—'}{c && <div style={{ fontSize: '0.75rem', color: 'var(--warning-text)' }}>{t('Contestado: {0}', c.motivo)}{c.resposta && ` — ${c.resposta}`}</div>}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatHorasSimples(Math.abs(l.horas))}{l.oferta ? ` (${t('oferta')})` : ''}</td>
                  <td style={{ width: 90 }}>{['Enviado', 'Contestado'].includes(e.estado) && !c && l.tipo === 'consumo' &&
                    <button className="btn btn-ghost btn-sm" onClick={() => { setContestar({ extrato: e.name, movimento: l.name }); setMotivo('') }}>{t('Contestar')}</button>}</td>
                </tr>
              )
            })}</tbody>
          </table></div>
          {e.fatura_numero && <div style={{ padding: '10px 4px 0', fontSize: '0.85rem' }}>{t('Fatura {0}', e.fatura_numero)}{e.fatura_pdf && <> · <a href={e.fatura_pdf} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>PDF</a></>}</div>}
        </div>
      ))}
      {contestar && (
        <Modal titulo={t('Contestar uma linha')} onFechar={() => setContestar(null)}>
          <textarea className="form-input" rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={t('Diga o que não está certo nesta linha.')} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setContestar(null)}>{t('Cancelar')}</button>
            <button className="btn btn-primary" disabled={!motivo.trim()} onClick={() =>
              tentar(() => post(cli('contestar'), { ...contestar, motivo }), t('Enviado ao responsável.')).then(() => { setContestar(null); recarregar() })}>
              {t('Enviar')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Pedidos({ cliente }) {
  const { dados, erro, carregando } = useDados(() => get(cli('pedidos'), { cliente }), [cliente])
  if (carregando) return <Carregando />
  if (erro) return <Erro>{erro}</Erro>
  return (
    <div>
      <Cabecalho titulo={t('Pedidos')} sub={t('Os seus pedidos de apoio e o tempo gasto em cada um')} />
      {dados.length === 0 ? <div className="card empty-state">{t('Sem pedidos com tempo registado.')}</div> : (
        <div className="card" style={{ padding: 0 }}><div className="table-wrap"><table>
          <thead><tr><th>#</th><th>{t('Assunto')}</th><th>{t('Estado')}</th><th>{t('Aberto em')}</th><th style={{ textAlign: 'right' }}>{t('Tempo')}</th></tr></thead>
          <tbody>{dados.map((b) => (
            <tr key={b.name}><td className="mono">{b.name}</td><td>{b.subject}</td><td><span className="badge badge-grey">{b.status}</span></td>
              <td className="mono">{fData(b.opening_date)}</td><td className="mono" style={{ textAlign: 'right' }}>{formatHorasSimples(b.horas)}</td></tr>
          ))}</tbody>
        </table></div></div>
      )}
    </div>
  )
}

function Documentos({ cliente }) {
  const { dados, erro, carregando, recarregar } = useDados(() => get(cli('documentos'), { cliente }), [cliente])
  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro>{erro}</Erro>
  return (
    <div>
      <Cabecalho titulo={t('Documentos')} sub={t('Orçamentos e faturas')} />
      <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>{t('Orçamentos')}</h3>
      {dados.orcamentos.length === 0 ? <div className="card empty-state">{t('Sem orçamentos.')}</div> : (
        <div className="card" style={{ padding: 0, marginBottom: 24 }}><div className="table-wrap"><table>
          <thead><tr><th>{t('Orçamento')}</th><th>{t('Data')}</th><th>{t('Válido até')}</th><th style={{ textAlign: 'right' }}>{t('Total')}</th><th /></tr></thead>
          <tbody>{dados.orcamentos.map((o) => (
            <tr key={o.name}><td className="mono">{o.name}</td><td className="mono">{fData(o.transaction_date)}</td><td className="mono">{fData(o.valid_till)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{dinheiro(o.grand_total)}</td>
              <td style={{ textAlign: 'right' }}>{o.status === 'Ordered' ? <span className="badge badge-green">{t('Aceite')}</span> :
                ['Open', 'Replied', 'Partially Ordered'].includes(o.status) &&
                <button className="btn btn-primary btn-sm" onClick={() => confirm(t('Aceitar este orçamento?')) &&
                  tentar(() => post(cli('aceitar_orcamento'), { orcamento: o.name }), t('Orçamento aceite.')).then(recarregar)}>{t('Aceitar')}</button>}</td></tr>
          ))}</tbody>
        </table></div></div>
      )}
      <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>{t('Faturas')}</h3>
      {dados.faturas.length === 0 ? <div className="card empty-state">{t('Sem faturas.')}</div> : (
        <div className="card" style={{ padding: 0 }}><div className="table-wrap"><table>
          <thead><tr><th>{t('Fatura')}</th><th>{t('Período até')}</th><th style={{ textAlign: 'right' }}>{t('Valor')}</th><th /></tr></thead>
          <tbody>{dados.faturas.map((f) => (
            <tr key={f.name}><td className="mono">{f.fatura_numero}</td><td className="mono">{fData(f.ate)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{dinheiro(f.valor)}</td>
              <td style={{ textAlign: 'right' }}>{f.fatura_pdf && <a className="btn btn-secondary btn-sm" href={f.fatura_pdf} target="_blank" rel="noreferrer">PDF</a>}</td></tr>
          ))}</tbody>
        </table></div></div>
      )}
    </div>
  )
}
