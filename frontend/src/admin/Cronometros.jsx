// «Cronómetros» como a página do portal: vários em paralelo, pausa, parar e guardar.
// O cronómetro vive no servidor (só a hora de início): começa num aparelho e pára noutro.
import { useEffect, useState } from 'react'
import { Pause, Play, Square, Trash2 } from 'lucide-react'
import { get, post } from '../comum/api'
import { t } from '../comum/i18n'
import { relogio } from '../comum/fmt'
import { Cabecalho, Campo, Carregando, Erro, Modal, tentar, useDados } from '../comum/ui'
import { SeletorAcordo, SeletorBilheteTarefa } from './EntradaHoras'

export default function Cronometros({ arranque }) {
  const { dados, erro, carregando, recarregar } = useDados(() => get('cronometros'))
  const [lista, setLista] = useState([])
  const [base, setBase] = useState(Date.now())
  const [, setTique] = useState(0)
  const [novo, setNovo] = useState({ acordo: '', descricao: '', bilhete: '', tarefa: '' })
  const [parar, setParar] = useState(null)
  useEffect(() => { if (dados) { setLista(dados); setBase(Date.now()) } }, [dados])
  useEffect(() => { const i = setInterval(() => setTique((x) => x + 1), 1000); return () => clearInterval(i) }, [])
  useEffect(() => {
    const voltar = () => !document.hidden && recarregar()
    document.addEventListener('visibilitychange', voltar)
    return () => document.removeEventListener('visibilitychange', voltar)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const acordos = arranque.acordos || []
  const nomeAcordo = (n) => { const a = acordos.find((x) => x.name === n); return a ? `${a.cliente_nome} · ${a.titulo}` : n }
  const segundos = (c) => c.segundos + (c.pausado_em ? 0 : (Date.now() - base) / 1000)
  const acao = (metodo, args, msg) => tentar(() => post(metodo, args), msg).then((r) => { if (r) { setLista(r); setBase(Date.now()) } })

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro>{erro}</Erro>
  return (
    <div>
      <Cabecalho titulo={t('Cronómetros')} sub={t('Começa num aparelho, pára noutro — ao parar, fica na folha de horas')} />
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div className="card-title">{t('Novo cronómetro')}</div></div>
        <form onSubmit={(e) => { e.preventDefault(); acao('iniciar_cronometro', novo); setNovo({ ...novo, descricao: '', bilhete: '', tarefa: '' }) }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Campo rotulo={t('Acordo')} style={{ gridColumn: '1 / -1' }}><SeletorAcordo acordos={acordos} valor={novo.acordo} onChange={(v) => setNovo({ ...novo, acordo: v, tarefa: '' })} /></Campo>
            <SeletorBilheteTarefa acordo={novo.acordo} helpdesk={arranque.helpdesk} bilhete={novo.bilhete} tarefa={novo.tarefa}
              onBilhete={(v) => setNovo({ ...novo, bilhete: v })} onTarefa={(v) => setNovo({ ...novo, tarefa: v })} />
            <Campo rotulo={t('Descrição')} style={{ gridColumn: '1 / -1' }}><input className="form-input" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} placeholder={t('O que vai fazer? (opcional)')} /></Campo>
          </div>
          <button className="btn btn-primary"><Play size={14} />{t('Iniciar')}</button>
        </form>
      </div>

      {lista.length === 0 && <div className="card empty-state">{t('Nenhum cronómetro a correr.')}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {lista.map((c) => (
          <div key={c.name} className="card" style={{ borderTop: `3px solid ${c.pausado_em ? 'var(--warning-text)' : 'var(--success-text)'}` }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{nomeAcordo(c.acordo)}{c.bilhete && ` · Desk #${c.bilhete}`}</div>
            <div className="mono" style={{ fontSize: '2.2rem', fontWeight: 600, margin: '6px 0', color: c.pausado_em ? 'var(--warning-text)' : 'var(--text)' }}>{relogio(segundos(c))}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', minHeight: 20 }}>{c.descricao}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {c.pausado_em
                ? <button className="btn btn-secondary btn-sm" onClick={() => acao('retomar_cronometro', { nome: c.name })}><Play size={14} />{t('Retomar')}</button>
                : <button className="btn btn-secondary btn-sm" onClick={() => acao('pausar_cronometro', { nome: c.name })}><Pause size={14} />{t('Pausa')}</button>}
              <button className="btn btn-primary btn-sm" onClick={() => setParar({ ...c, faturavel: true })}><Square size={14} />{t('Parar e guardar')}</button>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} title={t('Descartar')}
                onClick={() => confirm(t('Descartar este cronómetro sem guardar?')) && acao('descartar_cronometro', { nome: c.name }, t('Descartado.'))}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {parar && (
        <Modal titulo={t('Guardar o tempo')} onFechar={() => setParar(null)}>
          <div className="mono" style={{ fontSize: '1.6rem', marginBottom: 12 }}>{relogio(segundos(parar))}</div>
          <Campo rotulo={t('Descrição')}><textarea className="form-input" rows={3} value={parar.descricao || ''} onChange={(e) => setParar({ ...parar, descricao: e.target.value })} /></Campo>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16 }}>
            <input type="checkbox" checked={parar.faturavel} onChange={(e) => setParar({ ...parar, faturavel: e.target.checked })} />{t('Faturável')}
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setParar(null)}>{t('Cancelar')}</button>
            <button className="btn btn-primary" onClick={() => { acao('parar_cronometro', { nome: parar.name, descricao: parar.descricao || '', faturavel: parar.faturavel ? 1 : 0 }, t('Registo guardado.')); setParar(null) }}>
              {t('Guardar')}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
