// Extratos do período (T7): fechar o mês de um cliente, enviar, ver a resposta, registar a fatura
// emitida no software certificado.
import { useState } from 'react'
import { Send } from 'lucide-react'
import { get, post } from '../comum/api'
import { t } from '../comum/i18n'
import { data as fData, dinheiro, formatHorasSimples, iso } from '../comum/fmt'
import { Cabecalho, Campo, Carregando, Erro, Modal, Separadores, tentar, useDados } from '../comum/ui'

const COR = { Rascunho: 'badge-grey', Enviado: 'badge-yellow', Contestado: 'badge-red', Aprovado: 'badge-green', Faturado: 'badge-blue' }

export default function Extratos() {
  const [estado, setEstado] = useState('')
  const lista = useDados(() => get('lista_extratos', { estado }), [estado])
  const clientes = useDados(() => get('clientes'))
  const mesPassado = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return iso(d).slice(0, 7) })()
  const [fechar, setFechar] = useState(null)
  const [fatura, setFatura] = useState(null)
  return (
    <div>
      <Cabecalho titulo={t('Extratos')} sub={t('Feche o período, envie ao cliente e registe a fatura emitida')}>
        <button className="btn btn-primary btn-sm" onClick={() => setFechar({ cliente: '', mes: mesPassado })}>{t('Fechar um período')}</button>
      </Cabecalho>
      <Separadores ativo={estado} onChange={setEstado} itens={[['', 'Todos'], ['Rascunho', 'Rascunho'], ['Enviado', 'Enviado'], ['Contestado', 'Contestado'],
        ['Aprovado', 'Aprovado'], ['Faturado', 'Faturado']].map(([id, l]) => ({ id, label: t(l) }))} />
      {lista.carregando && !lista.dados ? <Carregando /> : lista.erro ? <Erro>{lista.erro}</Erro> : (
        <div className="card" style={{ padding: 0 }}><div className="table-wrap"><table>
          <thead><tr><th>{t('Extrato')}</th><th>{t('Cliente')}</th><th>{t('Período')}</th><th>{t('Estado')}</th>
            <th style={{ textAlign: 'right' }}>{t('Horas')}</th><th style={{ textAlign: 'right' }}>{t('Valor')}</th><th /></tr></thead>
          <tbody>
            {lista.dados.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>{t('Sem extratos.')}</td></tr>}
            {lista.dados.map((e) => (
              <tr key={e.name}>
                <td className="mono">{e.name}</td><td>{e.cliente}</td><td>{fData(e.desde)} – {fData(e.ate)}</td>
                <td><span className={`badge ${COR[e.estado]}`}>{t(e.estado)}</span>{e.aprovacao_tacita ? <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}> · {t('tácita')}</span> : null}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{formatHorasSimples(e.horas_consumidas)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{dinheiro(e.valor)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {e.estado === 'Rascunho' && <button className="btn btn-primary btn-sm" onClick={() => confirm(t('Enviar este extrato ao cliente? As linhas ficam trancadas.')) &&
                    tentar(() => post('enviar_extrato', { nome: e.name }), t('Extrato enviado.')).then(lista.recarregar)}><Send size={13} />{t('Enviar')}</button>}
                  {e.estado === 'Aprovado' && <button className="btn btn-secondary btn-sm" onClick={() => setFatura({ nome: e.name, numero: '' })}>{t('Registar fatura')}</button>}
                  {e.fatura_numero && <span className="mono" style={{ fontSize: '0.8rem' }}>{e.fatura_numero}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
      {fechar && (
        <Modal titulo={t('Fechar um período')} onFechar={() => setFechar(null)}>
          <Campo rotulo={t('Cliente')}><select className="form-input" value={fechar.cliente} onChange={(e) => setFechar({ ...fechar, cliente: e.target.value })}>
            <option value="">—</option>{(clientes.dados || []).filter((c) => c.tem_acordo).map((c) => <option key={c.name} value={c.name}>{c.customer_name}</option>)}</select></Campo>
          <Campo rotulo={t('Mês')}><input className="form-input" type="month" value={fechar.mes} onChange={(e) => setFechar({ ...fechar, mes: e.target.value })} /></Campo>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{t('O extrato fica em rascunho: confira e envie. Depois de enviado, as linhas só se corrigem por ajuste.')}</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setFechar(null)}>{t('Cancelar')}</button>
            <button className="btn btn-primary" disabled={!fechar.cliente || !fechar.mes} onClick={() =>
              tentar(() => post('fechar_extrato', { cliente: fechar.cliente, mes: fechar.mes }), t('Extrato em rascunho.')).then(() => { setFechar(null); lista.recarregar() })}>{t('Fechar')}</button>
          </div>
        </Modal>
      )}
      {fatura && (
        <Modal titulo={t('Registar fatura')} onFechar={() => setFatura(null)}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('A fatura emite-se no seu software certificado. Aqui fica só o número, para o cliente a ver em Documentos.')}</p>
          <Campo rotulo={t('N.º da fatura')}><input className="form-input" value={fatura.numero} onChange={(e) => setFatura({ ...fatura, numero: e.target.value })} /></Campo>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setFatura(null)}>{t('Cancelar')}</button>
            <button className="btn btn-primary" disabled={!fatura.numero.trim()} onClick={() =>
              tentar(() => post('registar_fatura', fatura), t('Fatura registada.')).then(() => { setFatura(null); lista.recarregar() })}>{t('Guardar')}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
