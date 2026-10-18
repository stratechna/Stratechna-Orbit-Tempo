import { useState } from 'react'
import { post } from '../comum/api'
import { t } from '../comum/i18n'
import { Cabecalho, Campo, tentar } from '../comum/ui'

export default function Definicoes({ arranque, atualizar }) {
  const d = arranque.definicoes
  const [f, setF] = useState({
    nome_comercial: d.nome_comercial || '', cor: d.cor || '#880000', moeda: d.moeda || 'EUR', preco_hora: d.preco_hora || '',
    arredondamento_bloco: d.arredondamento_bloco ?? 15, arredondamento_modo: d.arredondamento_modo || 'cima', minimo_minutos: d.minimo_minutos || 0,
    alerta_saldo_horas: d.alerta_saldo_horas ?? 2, dias_aprovacao_tacita: d.dias_aprovacao_tacita ?? 7, aviso_validade_dias: d.aviso_validade_dias ?? 15,
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const grelha = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }
  return (
    <div>
      <Cabecalho titulo={t('Definições')} sub={t('Marca, preço por omissão, arredondamento e regras dos clientes')} />
      <form className="card" onSubmit={(e) => { e.preventDefault(); tentar(() => post('guardar_definicoes', { dados: f }), t('Definições guardadas.')).then((r) => r && atualizar()) }}>
        <div className="card-header"><div className="card-title">{t('Marca')}</div></div>
        <div style={grelha}>
          <Campo rotulo={t('Nome comercial')} ajuda={t('Como aparece aos seus clientes.')}><input className="form-input" value={f.nome_comercial} onChange={set('nome_comercial')} /></Campo>
          <Campo rotulo={t('Cor')}><input className="form-input" type="color" value={f.cor} onChange={set('cor')} style={{ height: 40, padding: 4 }} /></Campo>
          <Campo rotulo={t('Moeda')}><select className="form-input" value={f.moeda} onChange={set('moeda')}>{['EUR', 'USD', 'GBP', 'BRL', 'CHF'].map((m) => <option key={m}>{m}</option>)}</select></Campo>
        </div>
        <div className="card-header" style={{ marginTop: 12 }}><div className="card-title">{t('Preço e arredondamento por omissão')}</div></div>
        <div style={grelha}>
          <Campo rotulo={t('Preço/hora por omissão')} ajuda={d.estudo_ativo ? t('Vem do estudo em uso ({0}).', d.estudo_ativo) : t('Faça o estudo do preço/hora para o calcular.')}>
            <input className="form-input" type="number" step="0.01" min="0" value={f.preco_hora} onChange={set('preco_hora')} /></Campo>
          <Campo rotulo={t('Bloco (min)')} ajuda={t('0 = ao minuto')}><input className="form-input" type="number" min="0" value={f.arredondamento_bloco} onChange={set('arredondamento_bloco')} /></Campo>
          <Campo rotulo={t('Arredondar')}><select className="form-input" value={f.arredondamento_modo} onChange={set('arredondamento_modo')}>
            <option value="cima">{t('Para cima')}</option><option value="proximo">{t('Ao mais próximo')}</option></select></Campo>
          <Campo rotulo={t('Mínimo (min)')}><input className="form-input" type="number" min="0" value={f.minimo_minutos} onChange={set('minimo_minutos')} /></Campo>
        </div>
        <div className="card-header" style={{ marginTop: 12 }}><div className="card-title">{t('Clientes e extratos')}</div></div>
        <div style={grelha}>
          <Campo rotulo={t('Avisar quando o saldo ficar abaixo de (horas)')}><input className="form-input" type="number" min="0" step="0.5" value={f.alerta_saldo_horas} onChange={set('alerta_saldo_horas')} /></Campo>
          <Campo rotulo={t('Aprovação tácita do extrato (dias)')}><input className="form-input" type="number" min="1" value={f.dias_aprovacao_tacita} onChange={set('dias_aprovacao_tacita')} /></Campo>
          <Campo rotulo={t('Avisar antes do fim do pack (dias)')}><input className="form-input" type="number" min="0" value={f.aviso_validade_dias} onChange={set('aviso_validade_dias')} /></Campo>
        </div>
        <button className="btn btn-primary">{t('Guardar')}</button>
      </form>
    </div>
  )
}
