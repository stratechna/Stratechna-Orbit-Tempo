// O «Extrato de Horas» do portal (pages/Horas.jsx), igual nos dois lados: separadores por
// acordo, cabeçalho com Contratadas · Gastas · Expiradas · Saldo, avisos, filtro de período,
// tabela Data · Descrição · Tempo · Saldo e impressão em PDF.
import { useMemo, useState } from 'react'
import { AlertTriangle, Filter, Printer } from 'lucide-react'
import { t } from './i18n'
import { data as fData, formatHoras, formatHorasSimples, tipoCor } from './fmt'
import { Separadores } from './ui'

export default function ExtratoHoras({ acordos, acordo, onAcordo, saldo, movimentos, alerta = 2, extra, titulo }) {
  const [desde, setDesde] = useState('')
  const [ate, setAte] = useState('')
  const filtrados = useMemo(() => (movimentos || []).filter((m) => (!desde || m.data >= desde) && (!ate || m.data <= ate)),
    [movimentos, desde, ate])
  const desc = [...filtrados].reverse()
  const atual = (acordos || []).find((a) => a.name === acordo)
  const s = saldo || { creditos: 0, consumos: 0, expirados: 0, disponivel: 0, oferecidas: 0 }
  const usaSaldo = atual && (atual.tipo === 'Pack' || atual.tipo === 'Avença' || s.creditos > 0)

  return (
    <div id="extrato-print">
      <div className="section-header">
        <div>
          <div className="section-title">{titulo || t('Extrato de Horas')}</div>
          <div className="section-sub">{t('Conta corrente de tempo por acordo')}</div>
        </div>
        <button className="btn btn-secondary btn-sm no-print" onClick={() => window.print()}>
          <Printer size={14} />{t('Imprimir PDF')}
        </button>
      </div>

      {(acordos || []).length > 1 && (
        <div className="no-print">
          <Separadores itens={acordos.map((a) => ({ id: a.name, label: a.titulo, cor: a.cor }))} ativo={acordo} onChange={onAcordo} />
        </div>
      )}

      {atual && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 100 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', marginBottom: 4 }}>{atual.titulo}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{usaSaldo ? t('Saldo total') : t('Tempo registado')}</div>
          </div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            {usaSaldo && <Numero rotulo={t('Contratadas')} valor={formatHorasSimples(s.creditos)} cor="var(--success-text)" />}
            <Numero rotulo={t('Gastas')} valor={formatHorasSimples(s.consumos)} cor="var(--danger-text)" />
            {s.expirados > 0 && <Numero rotulo={t('Expiradas')} valor={formatHorasSimples(s.expirados)} cor="var(--text-muted)" />}
            {s.oferecidas > 0 && <Numero rotulo={t('Oferecidas')} valor={formatHorasSimples(s.oferecidas)} cor="var(--text-muted)" />}
            {usaSaldo && (
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 32 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{t('Saldo')}</div>
                <div className="mono" style={{ fontSize: '1.3rem', fontWeight: 700, color: s.disponivel >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                  {formatHorasSimples(s.disponivel)}
                </div>
              </div>
            )}
          </div>
          {extra}
        </div>
      )}

      {usaSaldo && s.disponivel < alerta && s.disponivel >= 0 && (
        <div className="alert alert-warning"><AlertTriangle size={16} />{t('Saldo reduzido — menos de {0} horas disponíveis.', alerta)}</div>
      )}
      {usaSaldo && s.disponivel < 0 && (
        <div className="alert alert-danger"><AlertTriangle size={16} />{t('Saldo negativo — {0} em débito.', formatHorasSimples(Math.abs(s.disponivel)))}</div>
      )}

      <div className="card no-print" style={{ padding: '14px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Filter size={14} style={{ color: 'var(--text-dim)' }} />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{t('Período')}</span>
          <input type="date" className="form-input" style={{ width: 150, padding: '6px 10px', fontSize: '0.85rem' }} value={desde} onChange={(e) => setDesde(e.target.value)} aria-label={t('Desde')} />
          <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{t('até')}</span>
          <input type="date" className="form-input" style={{ width: 150, padding: '6px 10px', fontSize: '0.85rem' }} value={ate} onChange={(e) => setAte(e.target.value)} aria-label={t('Até')} />
          {(desde || ate) && <button className="btn btn-ghost btn-sm" onClick={() => { setDesde(''); setAte('') }}>{t('Limpar')}</button>}
          {(desde || ate) && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{t('{0} registos no período', filtrados.length)}</span>}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 105 }}>{t('Data')}</th>
                <th>{t('Descrição do Movimento')}</th>
                <th style={{ textAlign: 'right', width: 110 }}>{t('Tempo')}</th>
                {usaSaldo && <th style={{ textAlign: 'right', width: 130 }}>{t('Saldo')}</th>}
              </tr>
            </thead>
            <tbody>
              {desc.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  {desde || ate ? t('Sem registos no período selecionado.') : t('Sem registos.')}
                </td></tr>
              ) : desc.map((m) => (
                <tr key={m.name}>
                  <td className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap', verticalAlign: 'top', paddingTop: 12 }}>
                    {fData(m.data)}
                    {m.hora && <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 2 }}>{String(m.hora).slice(0, 5)}</div>}
                  </td>
                  <td style={{ verticalAlign: 'top', paddingTop: 10 }}>
                    <div style={{ fontSize: '0.875rem', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{m.descricao || rotuloTipo(m)}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 4 }}>
                      {[m.oferta ? t('oferta — não gasta saldo') : null, m.bilhete ? t('pedido #{0}', m.bilhete) : null,
                        m.tipo === 'consumo' && m.minutos_reais && Math.abs(Math.abs(m.horas) * 60 - m.minutos_reais) > 0.5
                          ? t('tempo real {0}', formatHorasSimples(m.minutos_reais / 60)) : null].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: 12 }}>
                    <span className="mono" style={{ fontWeight: 700, fontSize: '0.875rem', color: tipoCor(m.tipo, m.oferta), textDecoration: m.oferta ? 'line-through' : 'none' }}>
                      {formatHoras(m.horas)}
                    </span>
                  </td>
                  {usaSaldo && (
                    <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: 12 }}>
                      <span className="mono" style={{ fontWeight: 700, fontSize: '0.875rem', color: m.saldo_acumulado >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                        {formatHoras(m.saldo_acumulado)}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print, .sidebar, .topbar, .alert { display: none !important; }
          body { background: white !important; color: black !important; }
          .card { border: 1px solid #ccc !important; background: white !important; box-shadow: none !important; }
          table { font-size: 11px; }
          thead tr { background: #3D5163 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          thead th { color: white !important; }
          .main-content, .topbar { margin-left: 0 !important; }
          .page-body { padding: 8px !important; }
        }
      `}</style>
    </div>
  )
}

function Numero({ rotulo, valor, cor }) {
  return (
    <div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{rotulo}</div>
      <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: cor }}>{valor}</div>
    </div>
  )
}

export function rotuloTipo(m) {
  return { credito: t('Crédito de horas'), consumo: t('Trabalho'), expiracao: t('Expiração'), ajuste: t('Ajuste') }[m.tipo] || m.tipo
}
