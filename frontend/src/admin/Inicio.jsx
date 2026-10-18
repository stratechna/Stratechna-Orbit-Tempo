import { Link } from 'react-router-dom'
import { get } from '../comum/api'
import { t } from '../comum/i18n'
import { data as fData, dinheiro, formatHorasSimples } from '../comum/fmt'
import { Aviso, Cabecalho, Carregando, Erro, Stat, useDados } from '../comum/ui'

export default function Inicio({ arranque }) {
  const { dados, erro, carregando } = useDados(() => get('inicio'))
  if (carregando) return <Carregando />
  if (erro) return <Erro>{erro}</Erro>
  const d = arranque.definicoes
  return (
    <div>
      <Cabecalho titulo={t('Olá, {0}', (arranque.nome || '').split(' ')[0])} sub={t('O seu tempo, os seus clientes e o que está pendente')}>
        <Link className="btn btn-primary btn-sm" to="/entrada">{t('Registar horas')}</Link>
        <Link className="btn btn-secondary btn-sm" to="/cronometros">{t('Cronómetros')}</Link>
      </Cabecalho>
      {!d.preco_hora && <Aviso>{t('Ainda não há preço/hora por omissão. Faça o estudo do preço/hora em «Preço/hora».')}</Aviso>}
      <div className="stats-grid">
        <Stat rotulo={t('Hoje')} valor={formatHorasSimples(dados.horas_hoje)} />
        <Stat rotulo={t('Esta semana')} valor={formatHorasSimples(dados.horas_semana)} />
        <Stat rotulo={t('Por faturar')} valor={dinheiro(dados.por_faturar)} sub={t('trabalho à hora fora de extratos')} />
        <Stat rotulo={t('Cronómetros a correr')} valor={dados.cronometros.filter((c) => !c.pausado_em).length} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">{t('Packs e avenças a acabar')}</div></div>
          {dados.packs_a_acabar.length === 0 ? <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{t('Nenhum.')}</div> :
            dados.packs_a_acabar.map((p) => (
              <Link key={p.name} to={`/clientes/${encodeURIComponent(p.cliente)}`} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ flex: 1 }}>{p.cliente_nome} · {p.titulo}</span>
                <span className="mono" style={{ color: p.disponivel < 0 ? 'var(--danger-text)' : 'var(--warning-text)' }}>{formatHorasSimples(p.disponivel)}</span>
              </Link>
            ))}
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">{t('Extratos à espera do cliente')}</div></div>
          {dados.extratos_pendentes.length === 0 ? <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{t('Nenhum.')}</div> :
            dados.extratos_pendentes.map((e) => (
              <Link key={e.name} to="/extratos" style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ flex: 1 }}>{e.cliente}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{fData(e.desde)} – {fData(e.ate)}</span>
                <span className={`badge ${e.estado === 'Contestado' ? 'badge-red' : 'badge-yellow'}`}>{t(e.estado)}</span>
              </Link>
            ))}
        </div>
      </div>
    </div>
  )
}
