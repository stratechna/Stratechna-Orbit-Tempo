import { useState } from 'react'
import { post } from '../comum/api'
import { t } from '../comum/i18n'
import { dinheiro } from '../comum/fmt'
import { Campo, Modal, tentar } from '../comum/ui'

const TIPOS = [['Hora', 'À hora'], ['Pack', 'Pack de horas'], ['Avença', 'Avença'], ['Preço fixo', 'Preço fixo (só para medir a rentabilidade)']]
const BLOCOS = ['', '0', '1', '5', '6', '10', '15', '30', '60']
const MINIMOS = ['', '0', '5', '10', '15', '30', '60']

export default function FormAcordo({ acordo, arranque, onFechar, onGuardado }) {
  const d = arranque.definicoes
  const [f, setF] = useState({
    name: acordo.name, cliente: acordo.cliente, titulo: acordo.titulo || '', tipo: acordo.tipo || 'Hora',
    preco_hora: acordo.preco_hora || '', horas_pack: acordo.horas_pack || '', desconto_pack: acordo.desconto_pack || '',
    horas_mes: acordo.horas_mes || '', valor_mensal: acordo.valor_mensal || '', regra_excedente: acordo.regra_excedente || 'Cobrar à hora',
    data_inicio: acordo.data_inicio || '', data_fim: acordo.data_fim || '', arredondamento_bloco: acordo.arredondamento_bloco ?? '',
    arredondamento_modo: acordo.arredondamento_modo || '', minimo_minutos: acordo.minimo_minutos ?? '', cor: acordo.cor || '#3D5163',
    ativo: acordo.ativo !== 0, notas: acordo.notas || '',
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const guardar = (e) => {
    e.preventDefault()
    tentar(() => post('guardar_acordo', { dados: { ...f, ativo: f.ativo ? 1 : 0 } }), t('Acordo guardado.')).then((r) => r && onGuardado())
  }
  const grelha = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }
  return (
    <Modal titulo={acordo.name ? t('Editar acordo') : t('Novo acordo')} onFechar={onFechar} largura={620}>
      <form onSubmit={guardar}>
        <div style={grelha}>
          <Campo rotulo={t('Título')} style={{ gridColumn: '1 / -1' }}><input className="form-input" required value={f.titulo} onChange={set('titulo')} placeholder={t('ex.: Consultoria de exportação')} /></Campo>
          <Campo rotulo={t('Tipo')}><select className="form-input" value={f.tipo} onChange={set('tipo')}>{TIPOS.map(([v, r]) => <option key={v} value={v}>{t(r)}</option>)}</select></Campo>
          <Campo rotulo={t('Preço/hora')} ajuda={d.preco_hora ? t('Vazio = {0} (Definições).', dinheiro(d.preco_hora)) : t('Vazio = o das Definições.')}>
            <input className="form-input" type="number" step="0.01" min="0" value={f.preco_hora} onChange={set('preco_hora')} /></Campo>
          {f.tipo === 'Pack' && <>
            <Campo rotulo={t('Horas do pack')}><input className="form-input" type="number" step="0.5" min="0" value={f.horas_pack} onChange={set('horas_pack')} /></Campo>
            <Campo rotulo={t('Desconto (%)')}><input className="form-input" type="number" step="1" min="0" max="90" value={f.desconto_pack} onChange={set('desconto_pack')} /></Campo>
          </>}
          {f.tipo === 'Avença' && <>
            <Campo rotulo={t('Horas por mês')}><input className="form-input" type="number" step="0.5" min="0" value={f.horas_mes} onChange={set('horas_mes')} /></Campo>
            <Campo rotulo={t('Valor mensal')}><input className="form-input" type="number" step="0.01" min="0" value={f.valor_mensal} onChange={set('valor_mensal')} /></Campo>
          </>}
          {(f.tipo === 'Pack' || f.tipo === 'Avença') &&
            <Campo rotulo={t('Horas para além do pack/avença')}><select className="form-input" value={f.regra_excedente} onChange={set('regra_excedente')}>
              {['Cobrar à hora', 'Abater no próximo', 'Bloquear'].map((v) => <option key={v} value={v}>{t(v)}</option>)}</select></Campo>}
          <Campo rotulo={t('Início')}><input className="form-input" type="date" value={f.data_inicio} onChange={set('data_inicio')} /></Campo>
          <Campo rotulo={f.tipo === 'Pack' ? t('Validade do pack') : t('Fim')}><input className="form-input" type="date" value={f.data_fim} onChange={set('data_fim')} /></Campo>
          <Campo rotulo={t('Bloco (min)')}><select className="form-input" value={String(f.arredondamento_bloco)} onChange={set('arredondamento_bloco')}>
            {BLOCOS.map((v) => <option key={v} value={v}>{v === '' ? `${t('Das Definições')} (${d.arredondamento_bloco ?? 15})` : v === '0' ? t('ao minuto') : v}</option>)}</select></Campo>
          <Campo rotulo={t('Arredondar')}><select className="form-input" value={f.arredondamento_modo} onChange={set('arredondamento_modo')}>
            <option value="">{t('Das Definições')}</option><option value="cima">{t('Para cima')}</option><option value="proximo">{t('Ao mais próximo')}</option></select></Campo>
          <Campo rotulo={t('Mínimo (min)')}><select className="form-input" value={String(f.minimo_minutos)} onChange={set('minimo_minutos')}>
            {MINIMOS.map((v) => <option key={v} value={v}>{v === '' ? `${t('Das Definições')} (${d.minimo_minutos || 0})` : v}</option>)}</select></Campo>
          <Campo rotulo={t('Cor')}><input className="form-input" type="color" value={f.cor} onChange={set('cor')} style={{ height: 40, padding: 4 }} /></Campo>
          <Campo rotulo={t('Notas')} style={{ gridColumn: '1 / -1' }}><textarea className="form-input" rows={2} value={f.notas} onChange={set('notas')} /></Campo>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
          <input type="checkbox" checked={f.ativo} onChange={set('ativo')} /> {t('Ativo')}
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onFechar}>{t('Cancelar')}</button>
          <button className="btn btn-primary">{t('Guardar')}</button>
        </div>
      </form>
    </Modal>
  )
}
