// «Entrada de horas» — o «Novo Registo» da ficha do cliente no Admin do portal (Financeiro → Extrato
// de horas), com a mesma forma de escrever as horas: 10.8 · 10,5 · 10H30m · 1H30M · 90m.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { get, post } from '../comum/api'
import { t } from '../comum/i18n'
import { data as fData, dinheiro, formatHoras, iso, tipoCor } from '../comum/fmt'
import { Cabecalho, Campo, Carregando, Erro, tentar, useDados } from '../comum/ui'

export function SeletorAcordo({ acordos, valor, onChange, cliente }) {
  const grupos = useMemo(() => {
    const g = {}
    acordos.filter((a) => a.ativo && (!cliente || a.cliente === cliente)).forEach((a) => { (g[a.cliente_nome || a.cliente] = g[a.cliente_nome || a.cliente] || []).push(a) })
    return g
  }, [acordos, cliente])
  return (
    <select className="form-input" required value={valor} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('— Escolha o cliente e o acordo —')}</option>
      {Object.entries(grupos).map(([c, lista]) => (
        <optgroup key={c} label={c}>{lista.map((a) => <option key={a.name} value={a.name}>{a.titulo} · {t(a.tipo)}</option>)}</optgroup>
      ))}
    </select>
  )
}

export function SeletorBilheteTarefa({ acordo, helpdesk, bilhete, tarefa, onBilhete, onTarefa }) {
  const bilhetes = useDados(() => helpdesk ? get('bilhetes') : Promise.resolve([]), [helpdesk])
  const tarefas = useDados(() => acordo ? get('tarefas', { acordo }) : Promise.resolve([]), [acordo])
  return (
    <>
      {helpdesk && (
        <Campo rotulo={t('Pedido (Desk)')}>
          <select className="form-input" value={bilhete} onChange={(e) => onBilhete(e.target.value)}>
            <option value="">—</option>
            {(bilhetes.dados || []).map((b) => <option key={b.name} value={b.name}>#{b.name} {b.subject}</option>)}
          </select>
        </Campo>
      )}
      <Campo rotulo={t('Tarefa (Projects)')}>
        <select className="form-input" value={tarefa} onChange={(e) => onTarefa(e.target.value)}>
          <option value="">—</option>
          {(tarefas.dados || []).map((x) => <option key={x.name} value={x.name}>{x.subject}</option>)}
        </select>
      </Campo>
    </>
  )
}

export default function EntradaHoras({ arranque }) {
  const [params] = useSearchParams()
  const cliente = params.get('cliente') || ''
  const hoje = iso(new Date())
  const vazio = { tipo: 'consumo', acordo: '', horas: '', data: hoje, hora: '', descricao: '', bilhete: '', tarefa: '', faturavel: true, negativo: false }
  const [f, setF] = useState(vazio)
  const [periodo, setPeriodo] = useState({ desde: iso(new Date(Date.now() - 30 * 864e5)), ate: hoje })
  const lista = useDados(() => get('registos', { ...periodo, cliente }), [periodo.desde, periodo.ate, cliente])
  const acordos = arranque.acordos || []
  useEffect(() => {
    if (!f.acordo) {
      try {
        const ultimo = localStorage.getItem('tempo.ultimoAcordo')
        if (ultimo && acordos.some((a) => a.name === ultimo && (!cliente || a.cliente === cliente))) setF((x) => ({ ...x, acordo: ultimo }))
      } catch (e) { /* sem armazenamento */ }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const registar = (e) => {
    e.preventDefault()
    try { localStorage.setItem('tempo.ultimoAcordo', f.acordo) } catch (x) { /* sem armazenamento */ }
    tentar(() => post('registar_horas', { dados: { ...f, faturavel: f.faturavel ? 1 : 0, negativo: f.negativo ? 1 : 0 } }), t('Registo guardado.'))
      .then((r) => { if (r) { setF({ ...vazio, acordo: f.acordo, data: f.data }); lista.recarregar() } })
  }

  return (
    <div>
      <Cabecalho titulo={t('Entrada de horas')} sub={t('Cada registo vai para a folha de horas do Orbit e para o extrato do cliente')} />
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div className="card-title">{t('Novo registo')}</div></div>
        <form onSubmit={registar}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <Campo rotulo={t('Acordo')} style={{ gridColumn: '1 / -1' }}>
              <SeletorAcordo acordos={acordos} valor={f.acordo} onChange={(v) => setF({ ...f, acordo: v, tarefa: '' })} cliente={cliente} />
            </Campo>
            <Campo rotulo={t('Tipo')}>
              <select className="form-input" value={f.tipo} onChange={set('tipo')}>
                <option value="consumo">{t('Trabalho (consumo)')}</option>
                <option value="credito">{t('Crédito de horas')}</option>
                <option value="ajuste">{t('Ajuste')}</option>
              </select>
            </Campo>
            <Campo rotulo={t('Horas')} ajuda={t('Ex.: 10.8 · 10,5 · 10H30m · 1H30M · 90m')}>
              <input className="form-input" required value={f.horas} onChange={set('horas')} placeholder={t('ex: 10.8 ou 1H30m')} />
            </Campo>
            <Campo rotulo={t('Data')}><input className="form-input" type="date" required value={f.data} onChange={set('data')} /></Campo>
            {f.tipo === 'consumo' && <Campo rotulo={t('Hora')}><input className="form-input" type="time" value={f.hora} onChange={set('hora')} /></Campo>}
            {f.tipo === 'consumo' && <SeletorBilheteTarefa acordo={f.acordo} helpdesk={arranque.helpdesk} bilhete={f.bilhete} tarefa={f.tarefa}
              onBilhete={(v) => setF({ ...f, bilhete: v })} onTarefa={(v) => setF({ ...f, tarefa: v })} />}
            <Campo rotulo={t('Descrição')} style={{ gridColumn: '1 / -1' }}>
              <textarea className="form-input" rows={2} value={f.descricao} onChange={set('descricao')} />
            </Campo>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            {f.tipo === 'consumo' && <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.faturavel} onChange={set('faturavel')} />
              {t('Faturável (sem marcar = oferta: aparece ao cliente mas não gasta saldo)')}</label>}
            {f.tipo === 'ajuste' && <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.negativo} onChange={set('negativo')} />
              {t('Retirar horas (ajuste negativo)')}</label>}
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }}>{t('Registar')}</button>
          </div>
        </form>
      </div>

      <div className="card no-print" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{t('Período')}</span>
        <input type="date" className="form-input" style={{ width: 150 }} value={periodo.desde} onChange={(e) => setPeriodo({ ...periodo, desde: e.target.value })} aria-label={t('Desde')} />
        <span style={{ color: 'var(--text-dim)' }}>{t('até')}</span>
        <input type="date" className="form-input" style={{ width: 150 }} value={periodo.ate} onChange={(e) => setPeriodo({ ...periodo, ate: e.target.value })} aria-label={t('Até')} />
      </div>
      {lista.carregando && !lista.dados ? <Carregando /> : lista.erro ? <Erro>{lista.erro}</Erro> : (
        <div className="card" style={{ padding: 0 }}><div className="table-wrap"><table>
          <thead><tr><th>{t('Data')}</th><th>{t('Cliente · acordo')}</th><th>{t('Descrição')}</th><th>{t('Origem')}</th>
            <th style={{ textAlign: 'right' }}>{t('Tempo')}</th><th style={{ textAlign: 'right' }}>{t('Valor')}</th><th /></tr></thead>
          <tbody>
            {lista.dados.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>{t('Sem registos.')}</td></tr>}
            {lista.dados.map((m) => (
              <tr key={m.name}>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fData(m.data)}{m.hora && <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{String(m.hora).slice(0, 5)}</div>}</td>
                <td>{m.cliente_nome}<div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{m.acordo_titulo}</div></td>
                <td style={{ maxWidth: 320 }}>{m.descricao || '—'}</td>
                <td style={{ fontSize: '0.8rem' }}>{m.bilhete ? `Desk #${m.bilhete}` : m.timesheet ? t('Folha de horas') : t('Manual')}</td>
                <td className="mono" style={{ textAlign: 'right', color: tipoCor(m.tipo, m.oferta) }}>{formatHoras(m.horas)}{m.oferta ? ` · ${t('oferta')}` : ''}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{m.valor ? dinheiro(m.valor) : '—'}</td>
                <td style={{ width: 40 }}>{!m.trancado && (
                  <button className="btn btn-ghost btn-icon" title={t('Anular')} aria-label={t('Anular')}
                    onClick={() => confirm(t('Anular este registo? A folha de horas é cancelada.')) && tentar(() => post('anular_registo', { movimento: m.name }), t('Registo anulado.')).then(lista.recarregar)}>
                    <Trash2 size={14} /></button>)}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  )
}
