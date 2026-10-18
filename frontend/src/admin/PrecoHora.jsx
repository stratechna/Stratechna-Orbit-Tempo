// Estudo do preço/hora: despesas da estrutura, rendimento, tempo, impostos PT/ES e resultado.
// As contas são todas do servidor (orbit_tempo.preco); aqui só se mostra.
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { get, post } from '../comum/api'
import { t } from '../comum/i18n'
import { dinheiro, numero } from '../comum/fmt'
import { Aviso, Cabecalho, Campo, Carregando, Erro, Stat, tentar, useDados } from '../comum/ui'

const CATEGORIAS = ['Contabilidade', 'Software', 'Comunicações', 'Espaço', 'Seguros', 'Deslocações', 'Formação', 'Marketing', 'Equipamento', 'Banco e pagamentos', 'Outros']
const NOMES_PARAMETROS = {
  ss_taxa: 'Taxa da Segurança Social', ss_base: 'Base de incidência da Segurança Social', irs_coef: 'Coeficiente do regime simplificado',
  irs_taxa_media: 'Taxa média de IRS', primeiro_ano: '1.º ano (isento de Segurança Social)', iva_taxa: 'IVA',
  tsu_entidade: 'TSU da empresa', tsu_trabalhador: 'TSU do gerente', irc_taxa: 'IRC', cuota_mensal: 'Cuota de autónomos (€/mês)',
  irpf_taxa_media: 'Taxa média de IRPF', is_taxa: 'Impuesto de Sociedades', taxa_media: 'Taxa média de impostos',
}
const NOMES_ENCARGOS = { seguranca_social: 'Segurança Social', irs: 'IRS', tsu_entidade: 'TSU da empresa', tsu_trabalhador: 'TSU do gerente',
  cuota_autonomos: 'Cuota de autónomos', irpf: 'IRPF', impostos: 'Impostos' }

function estudoNovo(d) {
  return {
    titulo: t('Estudo de {0}', new Date().getFullYear()), ano: new Date().getFullYear(), pais: d.pais || 'PT', regime: d.regime || 'PT_IND',
    despesas: [
      ['Contabilidade', 'Contabilista / gestoria', 'mensal'], ['Software', 'Software e assinaturas', 'mensal'],
      ['Comunicações', 'Telemóvel e internet', 'mensal'], ['Espaço', 'Escritório / cowork / parte da casa', 'mensal'],
      ['Seguros', 'Seguro de responsabilidade civil', 'anual'], ['Equipamento', 'Computador', 'amortizacao'],
      ['Deslocações', 'Deslocações', 'mensal'], ['Formação', 'Formação', 'anual'],
    ].map(([categoria, descricao, periodicidade]) => ({ categoria, descricao: t(descricao), valor: '', periodicidade, anos: periodicidade === 'amortizacao' ? 3 : '' })),
    liquido_mensal: '', meses_rendimento: '12', horas_semana: 40, dias_semana: 5, dias_ferias: 22, dias_feriados: 13,
    dias_imprevistos: 5, dias_formacao: 5, pct_faturavel: 60, margem: 10, parametros_json: {},
    packs: [{ horas: 10, desconto: 5 }, { horas: 20, desconto: 10 }],
  }
}

export default function PrecoHora({ arranque, atualizar }) {
  const lista = useDados(() => get('estudos'))
  const [estudo, setEstudo] = useState(null)
  if (estudo) return <Editor inicial={estudo} arranque={arranque} onVoltar={() => { setEstudo(null); lista.recarregar() }} atualizar={atualizar} />
  if (lista.carregando && !lista.dados) return <Carregando />
  if (lista.erro) return <Erro>{lista.erro}</Erro>
  return (
    <div>
      <Cabecalho titulo={t('Estudo do preço/hora')} sub={t('Preencha as despesas mensais da sua estrutura, o rendimento que quer receber e o tempo que consegue faturar. A app diz o preço/hora mínimo e o recomendado.')}>
        <button className="btn btn-primary btn-sm" onClick={() => setEstudo(estudoNovo(arranque.definicoes))}><Plus size={14} />{t('Novo estudo')}</button>
      </Cabecalho>
      {lista.dados.length === 0 ? <div className="card empty-state">{t('Ainda não há estudos.')}</div> : (
        <div className="card" style={{ padding: 0 }}><div className="table-wrap"><table>
          <thead><tr><th>{t('Estudo')}</th><th>{t('Regime')}</th><th style={{ textAlign: 'right' }}>{t('Preço mínimo')}</th><th style={{ textAlign: 'right' }}>{t('Preço recomendado')}</th></tr></thead>
          <tbody>{lista.dados.map((e) => (
            <tr key={e.name} style={{ cursor: 'pointer' }} onClick={() => get('estudo', { nome: e.name }).then((d) => setEstudo({ ...d, packs: [{ horas: 10, desconto: 5 }, { horas: 20, desconto: 10 }] }))}>
              <td>{e.titulo} {e.ativo ? <span className="badge badge-green">{t('em uso')}</span> : null}<div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{e.ano}</div></td>
              <td>{t(arranque.regimes[e.regime] || e.regime)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{dinheiro(e.preco_minimo)}</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{dinheiro(e.preco_recomendado)}</td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}
    </div>
  )
}

function Editor({ inicial, arranque, onVoltar, atualizar }) {
  const [E, setE] = useState(inicial)
  const [r, setR] = useState(null)
  const temp = useRef(null)
  useEffect(() => {
    clearTimeout(temp.current)
    temp.current = setTimeout(() => post('calcular_estudo', { dados: E }).then(setR).catch((e) => setR({ erro: e.message })), 250)
  }, [E])
  const set = (k) => (e) => setE({ ...E, [k]: e.target.value })
  const linha = (i, k, v) => setE({ ...E, despesas: E.despesas.map((l, j) => (j === i ? { ...l, [k]: v } : l)) })
  const proprios = E.parametros_json || {}
  const guardar = (usar) => tentar(() => post('guardar_estudo', { dados: E, usar: usar ? 1 : 0 }),
    usar ? t('Estudo guardado. O preço recomendado passa a ser o preço/hora por omissão.') : t('Estudo guardado.'))
    .then((d) => { if (d) { setE({ ...d, packs: E.packs }); if (usar) atualizar() } })
  const grelha = (n) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${n}px, 1fr))`, gap: 12 })

  return (
    <div style={{ paddingBottom: 70 }}>
      <button className="btn btn-ghost btn-sm" onClick={onVoltar} style={{ marginBottom: 12 }}><ArrowLeft size={14} />{t('Estudos')}</button>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={grelha(200)}>
          <Campo rotulo={t('Título')}><input className="form-input" value={E.titulo} onChange={set('titulo')} /></Campo>
          <Campo rotulo={t('Regime fiscal')}><select className="form-input" value={E.regime} onChange={(e) => setE({ ...E, regime: e.target.value, pais: e.target.value.slice(0, 2) === 'PT' ? 'PT' : e.target.value.slice(0, 2) === 'ES' ? 'ES' : 'Outro', parametros_json: {} })}>
            {Object.entries(arranque.regimes).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></Campo>
          <Campo rotulo={t('Ano')}><input className="form-input" type="number" value={E.ano} onChange={set('ano')} /></Campo>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">1. {t('Despesas da estrutura')}</div></div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 12 }}>{t('Tudo o que paga para poder trabalhar, mesmo sem clientes. Compras grandes (computador, carro) entram divididas pelos anos de uso.')}</p>
        {E.despesas.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1fr) minmax(160px,2fr) 110px 150px 70px 34px', gap: 8, marginBottom: 8, alignItems: 'center' }} className="tp-desp">
            <select className="form-input" value={l.categoria} onChange={(e) => linha(i, 'categoria', e.target.value)} aria-label={t('Categoria')}>{CATEGORIAS.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select>
            <input className="form-input" value={l.descricao} onChange={(e) => linha(i, 'descricao', e.target.value)} aria-label={t('Descrição')} />
            <input className="form-input" type="number" step="any" min="0" placeholder="0" value={l.valor} onChange={(e) => linha(i, 'valor', e.target.value)} aria-label={t('Valor')} />
            <select className="form-input" value={l.periodicidade} onChange={(e) => linha(i, 'periodicidade', e.target.value)} aria-label={t('Periodicidade')}>
              <option value="mensal">{t('por mês')}</option><option value="anual">{t('por ano')}</option><option value="amortizacao">{t('compra, em anos')}</option></select>
            {l.periodicidade === 'amortizacao' ? <input className="form-input" type="number" min="1" value={l.anos || 3} onChange={(e) => linha(i, 'anos', e.target.value)} aria-label={t('Anos')} /> : <span />}
            <button type="button" className="btn btn-ghost btn-icon" aria-label={t('Retirar')} onClick={() => setE({ ...E, despesas: E.despesas.filter((_, j) => j !== i) })}><X size={14} /></button>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={() => setE({ ...E, despesas: [...E.despesas, { categoria: 'Outros', descricao: '', valor: '', periodicidade: 'mensal' }] })}><Plus size={14} />{t('Despesa')}</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">2. {t('Rendimento que quer receber')}</div></div>
        <div style={grelha(220)}>
          <Campo rotulo={t('Líquido por mês')} ajuda={t('O que quer que lhe fique no bolso, depois de impostos e contribuições.')}><input className="form-input" type="number" min="0" value={E.liquido_mensal} onChange={set('liquido_mensal')} /></Campo>
          <Campo rotulo={t('Meses por ano')}><select className="form-input" value={String(E.meses_rendimento)} onChange={set('meses_rendimento')}>
            <option value="12">{t('12 meses')}</option><option value="14">{t('14 meses (como subsídios de férias e Natal)')}</option></select></Campo>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">3. {t('Tempo')}</div></div>
        <div style={grelha(150)}>
          {[['horas_semana', 'Horas por semana'], ['dias_semana', 'Dias por semana'], ['pct_faturavel', 'Tempo faturável (%)'], ['dias_ferias', 'Férias (dias)'],
            ['dias_feriados', 'Feriados (dias)'], ['dias_imprevistos', 'Doença e imprevistos (dias)'], ['dias_formacao', 'Formação (dias)']].map(([k, r]) => (
            <Campo key={k} rotulo={t(r)}><input className="form-input" type="number" min="0" step="any" value={E[k]} onChange={set(k)} /></Campo>
          ))}
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{t('Comercial, propostas, administração e formação não se faturam. Entre 55 % e 70 % é o habitual.')}</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">4. {t('Impostos e contribuições')}</div></div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 12 }}>{t('Valores de referência do ano. Confirme-os com o seu contabilista ou gestoria; pode ajustá-los ao seu caso.')}</p>
        <div style={grelha(260)}>
          {((r && r.parametros && r.parametros.linhas) || []).map((p) => {
            const f = p.unidade === 'fração' ? 100 : 1
            const atual = proprios[p.chave] ?? p.valor
            return (
              <Campo key={p.chave} rotulo={<>{t(NOMES_PARAMETROS[p.chave] || p.chave)}{f === 100 ? ' (%)' : ''} <span className={`badge ${p.validado ? 'badge-green' : 'badge-yellow'}`}>{p.validado ? t('validado') : t('por validar')}</span></>}
                ajuda={`${p.descricao || ''}${p.fonte ? ` — ${p.fonte}` : ''}`}>
                <input className="form-input" type="number" step="any" defaultValue={Math.round(Number(atual) * f * 10000) / 10000}
                  onChange={(e) => { const v = e.target.value === '' ? null : Number(e.target.value) / f; const n = { ...proprios }; if (v === null || Math.abs(v - p.valor) < 1e-9) delete n[p.chave]; else n[p.chave] = v; setE({ ...E, parametros_json: n }) }} />
              </Campo>
            )
          })}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">5. {t('Margem e packs')}</div></div>
        <div style={grelha(200)}><Campo rotulo={t('Margem (%)')} ajuda={t('Para reinvestir e aguentar meses fracos.')}><input className="form-input" type="number" min="0" value={E.margem} onChange={set('margem')} /></Campo></div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, margin: '8px 0' }}>{t('Packs a testar')}</div>
        {E.packs.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <input className="form-input" style={{ width: 80 }} type="number" min="1" value={p.horas} aria-label={t('Horas')} onChange={(e) => setE({ ...E, packs: E.packs.map((x, j) => (j === i ? { ...x, horas: Number(e.target.value) } : x)) })} />
            <span>{t('h com')}</span>
            <input className="form-input" style={{ width: 80 }} type="number" min="0" max="90" value={p.desconto} aria-label={t('Desconto')} onChange={(e) => setE({ ...E, packs: E.packs.map((x, j) => (j === i ? { ...x, desconto: Number(e.target.value) } : x)) })} />
            <span>{t('% de desconto')}</span>
            <button className="btn btn-ghost btn-icon" onClick={() => setE({ ...E, packs: E.packs.filter((_, j) => j !== i) })} aria-label={t('Retirar')}><X size={14} /></button>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={() => setE({ ...E, packs: [...E.packs, { horas: 40, desconto: 15 }] })}><Plus size={14} />{t('Pack')}</button>
      </div>

      <Resultado r={r} />

      <div style={{ position: 'sticky', bottom: 12, display: 'flex', justifyContent: 'flex-end', gap: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 10, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={() => guardar(false)}>{t('Guardar')}</button>
        <button className="btn btn-primary" onClick={() => guardar(true)}>{t('Guardar e usar este preço')}</button>
      </div>
    </div>
  )
}

function Resultado({ r }) {
  if (!r) return <div className="card"><Carregando /></div>
  if (r.erro) return <Aviso tipo="danger">{r.erro}</Aviso>
  const p = r.parametros || {}
  return (
    <div className="card" aria-live="polite">
      <div className="card-header"><div className="card-title">{t('Resultado')}</div></div>
      <div className="stats-grid">
        <Stat rotulo={t('Custo da estrutura/hora')} valor={r.custo_estrutura_hora != null ? dinheiro(r.custo_estrutura_hora) : '—'} sub={t('só para manter a atividade aberta')} />
        <Stat rotulo={t('Preço mínimo')} valor={r.preco_minimo != null ? dinheiro(r.preco_minimo) : '—'} sub={t('abaixo disto não chega ao rendimento')} />
        <Stat rotulo={t('Preço recomendado')} cor="var(--success-text)" valor={r.preco_recomendado != null ? dinheiro(r.preco_recomendado) : '—'}
          sub={r.preco_recomendado_com_iva ? t('{0} com IVA', dinheiro(r.preco_recomendado_com_iva)) : t('sem IVA')} />
      </div>
      {(r.avisos || []).map((a, i) => <Aviso key={i}>{a.tipo === 'parametros_em_falta' ? t('Faltam parâmetros fiscais para este regime: {0}.', a.campos.map((c) => t(NOMES_PARAMETROS[c] || c)).join(', '))
        : a.tipo === 'sem_horas_faturaveis' ? t('Sem horas faturáveis não há preço possível.') : t('Mais de 75 % de tempo faturável é raro. Confirme se é realista.')}</Aviso>)}
      {p.ano_usado && Number(p.ano_usado) !== Number(p.ano_pedido) && <Aviso>{t('Ainda não há parâmetros de {0}; usam-se os de {1}.', p.ano_pedido, p.ano_usado)}</Aviso>}
      {!p.validados && <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{t('Estimativa: os parâmetros fiscais ainda não foram validados por um contabilista.')}</p>}
      <div className="table-wrap" style={{ marginTop: 12 }}><table><tbody>
        {[[t('Despesas por ano'), r.despesas_anuais], [t('Rendimento líquido por ano'), r.liquido_anual],
          ...Object.entries(r.encargos || {}).map(([k, v]) => [t(NOMES_ENCARGOS[k] || k), v]),
          [t('Faturação mínima por ano'), r.faturacao_minima], [t('Faturação recomendada por ano'), r.faturacao_recomendada],
          ...(r.imposto_lucros != null ? [[t('Imposto sobre o lucro da margem'), r.imposto_lucros]] : [])].map(([n, v]) => (
          <tr key={n}><td>{n}</td><td className="mono" style={{ textAlign: 'right' }}>{dinheiro(v)}</td></tr>
        ))}
        <tr><td>{t('Horas faturáveis por ano')}</td><td className="mono" style={{ textAlign: 'right' }}>{numero(r.horas_faturaveis, 0)}</td></tr>
      </tbody></table></div>
      {r.packs && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('Packs')}</div>
          {r.packs.map((pk, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', color: pk.abaixo_minimo ? 'var(--warning-text)' : undefined }}>
              <span style={{ flex: 1 }}>{t('{0} h com {1} %', pk.horas, numero(pk.desconto, 0))} · {pk.abaixo_minimo ? `⚠ ${t('abaixo do preço mínimo')}` : `✓ ${t('acima do preço mínimo')}`}</span>
              <span className="mono">{dinheiro(pk.preco_hora_efetivo)}/h</span><span className="mono" style={{ fontWeight: 700 }}>{dinheiro(pk.total)}</span>
            </div>
          ))}
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 6 }}>{t('Desconto máximo sem descer do preço mínimo: {0} %.', numero(r.desconto_maximo))}</p>
        </div>
      )}
      {r.sensibilidade && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('E se trabalhar mais ou menos horas?')}</summary>
          <div className="table-wrap"><table>
            <thead><tr><th>{t('Faturável')}</th>{r.sensibilidade.horas_semana.map((h) => <th key={h} style={{ textAlign: 'right' }}>{t('{0} h/semana', h)}</th>)}</tr></thead>
            <tbody>{r.sensibilidade.linhas.map((l) => (
              <tr key={l.pct_faturavel}><td>{l.pct_faturavel} %</td>{l.precos.map((v, i) => <td key={i} className="mono" style={{ textAlign: 'right' }}>{v != null ? dinheiro(v) : '—'}</td>)}</tr>
            ))}</tbody>
          </table></div>
        </details>
      )}
    </div>
  )
}
