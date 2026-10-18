// Lado Admin — o freelancer e a sua equipa. Menu em grupos, como o Admin do portal.
import { Navigate, Route, Routes } from 'react-router-dom'
import { Calculator, ClipboardList, Clock, FileCheck, Home, Package, PlusCircle, Settings, Timer, Users } from 'lucide-react'
import Layout from '../comum/Layout'
import { t } from '../comum/i18n'
import Inicio from './Inicio'
import Clientes from './Clientes'
import FichaCliente from './FichaCliente'
import EntradaHoras from './EntradaHoras'
import Cronometros from './Cronometros'
import Packs from './Packs'
import PrecoHora from './PrecoHora'
import Extratos from './Extratos'
import Definicoes from './Definicoes'

export default function AdminApp({ arranque, atualizar }) {
  const grupos = [
    { label: t('Tempo'), items: [{ to: '/', icon: Home, label: t('Início'), end: true }] },
    { label: t('Clientes'), items: [
      { to: '/clientes', icon: Users, label: t('Gestão de Clientes') },
      { to: '/entrada', icon: PlusCircle, label: t('Entrada de horas') },
      { to: '/cronometros', icon: Timer, label: t('Cronómetros') },
      { to: '/extratos', icon: FileCheck, label: t('Extratos') },
    ] },
    { label: t('Preços'), items: [
      { to: '/packs', icon: Package, label: t('Packs e preços') },
      { to: '/preco', icon: Calculator, label: t('Preço/hora') },
    ] },
    { label: t('Sistema'), items: [
      { to: '/definicoes', icon: Settings, label: t('Definições') },
    ] },
  ]
  const rodape = (
    <div className="sidebar-footer" style={{ padding: 12, display: 'grid', gap: 6 }}>
      <a className="sidebar-link" href="/app/timesheet" title={t('Folhas de horas no ERP')}><ClipboardList size={16} /><span className="sidebar-label">{t('Folhas de horas (ERP)')}</span></a>
      <a className="sidebar-link" href="/apps" title={t('Voltar ao Orbit')}><Clock size={16} /><span className="sidebar-label">{t('Voltar ao Orbit')}</span></a>
    </div>
  )
  const props = { arranque, atualizar }
  return (
    <Layout grupos={grupos} marca={arranque.marca} utilizador={arranque.nome} rodape={rodape}>
      <Routes>
        <Route path="/" element={<Inicio {...props} />} />
        <Route path="/clientes" element={<Clientes {...props} />} />
        <Route path="/clientes/:cliente" element={<FichaCliente {...props} />} />
        <Route path="/entrada" element={<EntradaHoras {...props} />} />
        <Route path="/cronometros" element={<Cronometros {...props} />} />
        <Route path="/extratos" element={<Extratos {...props} />} />
        <Route path="/packs" element={<Packs {...props} />} />
        <Route path="/preco" element={<PrecoHora {...props} />} />
        <Route path="/definicoes" element={<Definicoes {...props} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
