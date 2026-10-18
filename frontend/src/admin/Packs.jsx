// Catálogo de packs com desconto. O preço vem do preço/hora por omissão e a trava avisa
// quando o desconto deixa o pack abaixo do preço mínimo do estudo (D7 = avisar).
import { useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { get, post } from '../comum/api'
import { t } from '../comum/i18n'
import { dinheiro } from '../comum/fmt'
import { Aviso, Cabecalho, Campo, Carregando, Erro, Modal, tentar, useDados } from '../comum/ui'

export default function Packs({ arranque }) {
  const { dados, erro, carregando, recarregar } = useDados(() => get('packs'))
  const [editar, setEditar] = useState(null)
  const preco = arranque.definicoes.preco_hora
  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro>{erro}</Erro>
  return (
    <div>
      <Cabecalho titulo={t('Packs e preços')} sub={t('Packs de horas com desconto, para vender nos orçamentos')}>
        <button className="btn btn-primary btn-sm" onClick={() => setEditar({ horas: 10, desconto: 5, validade_meses: 12, ativo: 1, titulo: '' })}><Plus size={14} />{t('Novo pack')}</button>
      </Cabecalho>
      {!preco ? <Aviso>{t('Defina primeiro o preço/hora (estudo do preço/hora ou Definições).')}</Aviso> :
        <div className="alert alert-success" style={{ marginBottom: 16 }}>{t('Preço/hora de referência: {0}. A hora e os packs entram nos orçamentos do ERP como artigos.', dinheiro(preco))}</div>}
      <div className="card" style={{ padding: 0 }}><div className="table-wrap"><table>
        <thead><tr><th>{t('Pack')}</th><th style={{ textAlign: 'right' }}>{t('Horas')}</th><th style={{ textAlign: 'right' }}>{t('Desconto')}</th>
          <th style={{ textAlign: 'right' }}>{t('Preço/hora efetivo')}</th><th style={{ textAlign: 'right' }}>{t('Preço do pack')}</th><th>{t('Artigo do ERP')}</th><th /></tr></thead>
        <tbody>
          {dados.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>{t('Ainda não há packs.')}</td></tr>}
          {dados.map((p) => (
            <tr key={p.name} style={{ opacity: p.ativo ? 1 : 0.5 }}>
              <td>{p.titulo}{p.abaixo_minimo ? <div style={{ fontSize: '0.75rem', color: 'var(--warning-text)' }}><AlertTriangle size={12} /> {t('abaixo do preço mínimo')}</div> : null}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{p.horas}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{p.desconto ? `${p.desconto} %` : '—'}</td>
              <td className="mono" style={{ textAlign: 'right', color: p.abaixo_minimo ? 'var(--warning-text)' : undefined }}>{dinheiro(p.preco_hora)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{dinheiro(p.preco_total)}</td>
              <td className="mono" style={{ fontSize: '0.78rem' }}>{p.item || '—'}</td>
              <td><button className="btn btn-secondary btn-sm" onClick={() => setEditar(p)}>{t('Editar')}</button></td>
            </tr>
          ))}
        </tbody>
      </table></div></div>
      {editar && (
        <Modal titulo={editar.name ? t('Editar pack') : t('Novo pack')} onFechar={() => setEditar(null)}>
          <form onSubmit={(e) => { e.preventDefault(); tentar(() => post('guardar_pack', { dados: editar }), t('Pack guardado.')).then((r) => { if (r) { setEditar(null); recarregar() } }) }}>
            <Campo rotulo={t('Título')}><input className="form-input" required value={editar.titulo} onChange={(e) => setEditar({ ...editar, titulo: e.target.value })} placeholder={t('ex.: Pack 20 horas')} /></Campo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Campo rotulo={t('Horas')}><input className="form-input" type="number" min="1" step="0.5" required value={editar.horas} onChange={(e) => setEditar({ ...editar, horas: e.target.value })} /></Campo>
              <Campo rotulo={t('Desconto (%)')}><input className="form-input" type="number" min="0" max="90" value={editar.desconto} onChange={(e) => setEditar({ ...editar, desconto: e.target.value })} /></Campo>
              <Campo rotulo={t('Validade (meses)')}><input className="form-input" type="number" min="1" value={editar.validade_meses} onChange={(e) => setEditar({ ...editar, validade_meses: e.target.value })} /></Campo>
            </div>
            {preco > 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {t('{0} h × {1} = {2}', editar.horas || 0, dinheiro(preco * (1 - (editar.desconto || 0) / 100)), dinheiro(preco * (1 - (editar.desconto || 0) / 100) * (editar.horas || 0)))}</p>}
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
              <input type="checkbox" checked={!!editar.ativo} onChange={(e) => setEditar({ ...editar, ativo: e.target.checked ? 1 : 0 })} />{t('À venda')}</label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditar(null)}>{t('Cancelar')}</button>
              <button className="btn btn-primary">{t('Guardar')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
