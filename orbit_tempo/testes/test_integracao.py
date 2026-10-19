"""Testes com o Frappe e o ERPNext (versão 2). Correm no GitHub, num site novo com o ERPNext
preparado pelo `before_tests` do próprio ERPNext — nunca num tenant:

    bench --site teste.local run-tests --module orbit_tempo.testes.test_integracao
"""
import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, add_to_date, flt, get_first_day, get_last_day, now_datetime, today

from orbit_tempo import api, cliente as cli, entrada, extratos, instalar, livro, precos, requisitos
from orbit_tempo.testes.test_motor import EXEMPLO


def _cliente(nome="Cliente Tempo"):
    if not frappe.db.exists("Customer", nome):
        frappe.get_doc({"doctype": "Customer", "customer_name": nome, "customer_type": "Company"}).insert()
    return nome


def _acordo(cliente, titulo, **kw):
    return frappe.get_doc({"doctype": "Tempo Acordo", "titulo": titulo, "cliente": cliente,
                           "tipo": kw.pop("tipo", "Hora"), **kw}).insert().name


def _mov(r):
    return frappe.get_doc("Tempo Movimento", r["movimento"])


class TestTempoV2(IntegrationTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        frappe.set_user("Administrator")
        instalar.garantir()

    def setUp(self):
        frappe.set_user("Administrator")
        frappe.local.conf.pop("orbit_apps", None)

    def test_campos_na_folha(self):
        self.assertTrue(frappe.get_meta("Timesheet").has_field("tempo_acordo"))

    def test_consumo_a_hora_arredonda_e_valoriza(self):
        a = _acordo(_cliente(), "Hora 50", preco_hora=50, arredondamento_bloco="15", arredondamento_modo="cima")
        r = entrada.registar(a, 20 / 60, descricao="Reunião")
        ts = frappe.get_doc("Timesheet", r["timesheet"])
        self.assertEqual(ts.customer, _cliente())
        self.assertAlmostEqual(ts.time_logs[0].billing_hours, 0.5)
        self.assertAlmostEqual(ts.time_logs[0].billing_rate, 50)
        m = _mov(r)
        self.assertEqual((m.tipo, round(m.horas, 4), m.valor, m.oferta), ("consumo", -0.5, 25, 0))
        self.assertAlmostEqual(m.minutos_reais, 20, delta=0.1)

    def test_oferta_nao_gasta_saldo_e_cancelar_tira_do_livro(self):
        c = _cliente("Cliente Oferta")
        a = _acordo(c, "Oferta", preco_hora=40, arredondamento_bloco="0")
        r = entrada.registar(a, 1, faturavel=0)
        self.assertEqual(_mov(r).oferta, 1)
        self.assertEqual(livro.saldo(c, a)["consumos"], 0)
        self.assertEqual(livro.saldo(c, a)["oferecidas"], 1)
        api.anular_registo(r["movimento"])
        self.assertFalse(frappe.db.exists("Tempo Movimento", r["movimento"]))
        self.assertEqual(frappe.db.get_value("Timesheet", r["timesheet"], "docstatus"), 2)

    def test_pack_credito_consumo_sem_valor(self):
        c = _cliente("Cliente Pack")
        a = _acordo(c, "Pack 10", tipo="Pack", horas_pack=10, desconto_pack=10, preco_hora=50, arredondamento_bloco="0")
        self.assertTrue(livro.creditar_pack(a))
        self.assertIsNone(livro.creditar_pack(a))   # só uma vez
        r = entrada.registar(a, 1.5)
        self.assertEqual(_mov(r).valor, 0)          # as horas do pack já estão pagas
        s = livro.saldo(c, a)
        self.assertEqual((s["creditos"], s["consumos"], s["disponivel"]), (10, 1.5, 8.5))

    def test_pack_expira(self):
        c = _cliente("Cliente Expira")
        a = _acordo(c, "Pack curto", tipo="Pack", horas_pack=5, data_fim=add_days(today(), -2))
        livro.creditar_pack(a)
        livro.expirar_packs()
        self.assertEqual(livro.saldo(c, a)["disponivel"], 0)
        self.assertTrue(frappe.db.exists("Tempo Movimento", {"acordo": a, "tipo": "expiracao"}))

    def test_preco_fixo_fica_fora_do_livro(self):
        a = _acordo(_cliente("Cliente Fixo"), "Projeto fechado", tipo="Preço fixo", preco_hora=60)
        r = entrada.registar(a, 2)
        self.assertIsNone(r["movimento"])
        self.assertEqual(frappe.db.get_value("Timesheet Detail", r["linha"], "is_billable"), 0)

    def test_folha_feita_no_erp_escolhe_o_acordo_unico(self):
        c = _cliente("Cliente Desk")
        a = _acordo(c, "Único", preco_hora=30, arredondamento_bloco="0")
        inicio = add_to_date(now_datetime(), hours=-3)
        ts = frappe.get_doc({"doctype": "Timesheet", "customer": c, "company": entrada._empresa(),
                             "time_logs": [{"activity_type": entrada._actividade("Execution"), "from_time": inicio,
                                            "hours": 1, "to_time": add_to_date(inicio, hours=1), "is_billable": 1}]})
        ts.insert()
        ts.submit()
        self.assertEqual(ts.tempo_acordo, a)
        self.assertTrue(frappe.db.exists("Tempo Movimento", {"timesheet": ts.name, "valor": 30}))

    def test_entrada_de_horas_como_no_portal(self):
        a = _acordo(_cliente("Cliente Entrada"), "Entrada", preco_hora=20, arredondamento_bloco="0")
        r = api.registar_horas({"acordo": a, "tipo": "consumo", "horas": "1H30m", "data": today(), "hora": "10:00"})
        self.assertAlmostEqual(_mov(r).horas, -1.5)
        r = api.registar_horas({"acordo": a, "tipo": "credito", "horas": "5", "descricao": "Crédito manual"})
        self.assertEqual(frappe.db.get_value("Tempo Movimento", r["movimento"], "horas"), 5)

    def test_cronometro_pausa_e_para(self):
        a = _acordo(_cliente("Cliente Crono"), "Crono", preco_hora=60, arredondamento_bloco="0")
        nome = entrada.iniciar(a, "a trabalhar")
        frappe.db.set_value("Tempo Cronometro", nome, {"inicio": add_to_date(now_datetime(), minutes=-40),
                                                       "segundos_pausa": 600})
        r = entrada.parar(nome)
        self.assertAlmostEqual(-_mov(r).horas, 0.5, delta=0.02)
        self.assertEqual(_mov(r).utilizador, "Administrator")   # quem registou fica no livro
        self.assertFalse(frappe.db.exists("Tempo Cronometro", nome))

    def test_extrato_tranca_contesta_e_aprova(self):
        c = _cliente("Cliente Extrato")
        a = _acordo(c, "Extrato", preco_hora=50, arredondamento_bloco="0")
        r = entrada.registar(a, 2, inicio=f"{today()} 09:00:00")
        nome = extratos.fechar(c, get_first_day(today()), get_last_day(today()))
        ext = frappe.get_doc("Tempo Extrato", nome)
        self.assertEqual((ext.horas_consumidas, ext.valor), (2, 100))
        extratos.enviar(nome)
        with self.assertRaises(frappe.ValidationError):
            api.anular_registo(r["movimento"])
        extratos.contestar(nome, r["movimento"], "Foram só 1,5 h")
        self.assertEqual(frappe.db.get_value("Tempo Extrato", nome, "estado"), "Contestado")
        extratos.aprovar(nome, "teste")
        frappe.db.set_value("Tempo Extrato", nome, "estado", "Enviado")
        frappe.db.set_value("Tempo Extrato", nome, "enviado_em", add_days(now_datetime(), -8))
        extratos.aprovar_tacitos()
        self.assertEqual(frappe.db.get_value("Tempo Extrato", nome, "aprovacao_tacita"), 1)

    def test_estudo_da_preco_a_hora_e_aos_packs(self):
        api.guardar_estudo({**EXEMPLO, "ano": 2026, "titulo": "Estudo v2"}, usar=1)
        d = frappe.get_doc("Tempo Definicoes")
        self.assertAlmostEqual(d.preco_hora, 50.09, places=2)
        self.assertEqual(d.item_hora, precos.ITEM_HORA)
        lista = frappe.db.get_single_value("Selling Settings", "selling_price_list") or "Standard Selling"
        self.assertAlmostEqual(flt(frappe.db.get_value("Item Price", {"item_code": precos.ITEM_HORA, "price_list": lista},
                                                       "price_list_rate")), 50.09, places=2)
        p = frappe.get_doc({"doctype": "Tempo Pack", "titulo": "Pack 20 h", "horas": 20, "desconto": 10}).insert()
        p.reload()
        self.assertEqual(p.preco_hora, 45.08)
        self.assertEqual(p.abaixo_minimo, 1)
        self.assertTrue(p.item)

    def test_orcamento_aceite_cria_acordos_e_projeto(self):
        api.guardar_estudo({**EXEMPLO, "ano": 2026, "titulo": "Estudo SO"}, usar=1)
        p = frappe.get_doc({"doctype": "Tempo Pack", "titulo": "Pack 10 h SO", "horas": 10, "desconto": 5}).insert()
        p.reload()
        c = _cliente("Cliente Orçamento")
        q = frappe.get_doc({"doctype": "Quotation", "quotation_to": "Customer", "party_name": c,
                            "company": entrada._empresa(), "transaction_date": today(),
                            "items": [{"item_code": precos.ITEM_HORA, "qty": 1, "rate": 50.09},
                                      {"item_code": p.item, "qty": 1, "rate": p.preco_total}]})
        q.insert()
        q.submit()
        so = precos.aceitar_orcamento(q.name, "cliente@exemplo.invalid")
        acordos = frappe.get_all("Tempo Acordo", filters={"cliente": c}, fields=["tipo", "horas_pack", "projeto", "cotacao"])
        self.assertEqual(sorted(a.tipo for a in acordos), ["Hora", "Pack"])
        self.assertTrue(all(a.projeto and a.cotacao == q.name for a in acordos))
        self.assertTrue(frappe.db.exists("Project", {"sales_order": so}))

    def test_cliente_ve_o_seu_extrato_e_so_o_seu(self):
        c = _cliente("Cliente Portal")
        outro = _cliente("Outro Cliente")
        a = _acordo(c, "Portal", preco_hora=50, arredondamento_bloco="0")
        _acordo(outro, "Alheio", preco_hora=50)
        entrada.registar(a, 1)
        ct = frappe.get_doc({"doctype": "Contact", "first_name": "Ana",
                             "email_ids": [{"email_id": "ana@cliente.invalid", "is_primary": 1}],
                             "links": [{"link_doctype": "Customer", "link_name": c}]}).insert()
        email = cli.dar_acesso(ct.name)
        self.assertEqual(frappe.db.get_value("User", email, "user_type"), "Website User")
        frappe.set_user(email)
        try:
            self.assertFalse(api.tem_acesso())
            ex = cli.extrato()
            self.assertEqual(len(ex["movimentos"]), 1)
            self.assertNotIn("utilizador", ex["movimentos"][0])
            with self.assertRaises(frappe.PermissionError):
                cli.extrato(cliente=outro)
        finally:
            frappe.set_user("Administrator")

    def test_requisito_de_subscricao(self):
        frappe.local.conf["orbit_apps"] = ["crm", "mail"]
        try:
            self.assertEqual(requisitos.estado()["faltam"], ["Desk", "Projects"])
            with self.assertRaises(frappe.PermissionError):
                api.inicio()
        finally:
            frappe.local.conf.pop("orbit_apps", None)
        self.assertTrue(requisitos.estado()["ok"])
