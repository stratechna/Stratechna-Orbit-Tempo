"""Testes com o Frappe. Correm no GitHub (workflow «Testes do Tempo»), num site
novo, sem tocar em nenhum tenant:

    bench --site teste.local run-tests --module orbit_tempo.testes.test_integracao
"""
import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, now_datetime, today

from orbit_tempo import api, instalar
from orbit_tempo.testes.test_motor import EXEMPLO


def _cliente(nome="Cliente de Teste"):
    existente = frappe.db.get_value("Tempo Cliente", {"nome_cliente": nome})
    if existente:
        return existente
    return frappe.get_doc({"doctype": "Tempo Cliente", "nome_cliente": nome}).insert().name


def _acordo(cliente, titulo="Consultoria", **kw):
    return frappe.get_doc({"doctype": "Tempo Acordo", "titulo": titulo, "cliente": cliente,
                           "tipo": "Hora", **kw}).insert().name


class TestTempo(IntegrationTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        instalar.garantir()
        frappe.set_user("Administrator")

    def test_instalacao(self):
        self.assertTrue(frappe.db.exists("Role", instalar.PAPEL))
        self.assertTrue(frappe.db.exists("Tempo Parametro Fiscal", "PT_IND-2026-ss_taxa"))
        self.assertTrue(frappe.db.exists("Tempo Parametro Fiscal", "ES_SL-2026-is_taxa"))
        self.assertEqual(frappe.db.count("Tempo Parametro Fiscal", {"validado": 1}), 0)
        # correr de novo não duplica nem reescreve
        frappe.db.set_value("Tempo Parametro Fiscal", "PT_IND-2026-irs_taxa_media", "valor", 0.15)
        instalar.garantir()
        self.assertEqual(frappe.db.get_value("Tempo Parametro Fiscal", "PT_IND-2026-irs_taxa_media", "valor"), 0.15)
        frappe.db.set_value("Tempo Parametro Fiscal", "PT_IND-2026-irs_taxa_media", "valor", 0.20)

    def test_registo_arredonda_e_gera_movimento(self):
        acordo = _acordo(_cliente(), preco_hora=50, arredondamento_bloco=15, arredondamento_modo="cima")
        r = api.guardar_registo({"acordo": acordo, "data": today(), "minutos": 20, "descricao": "Reunião"})
        self.assertEqual(r["minutos_faturados"], 30)
        self.assertEqual(r["valor"], 25)
        reg = frappe.get_doc("Tempo Registo", r["name"])
        mov = frappe.get_doc("Tempo Movimento", reg.movimento)
        self.assertEqual((mov.tipo, mov.horas, mov.valor), ("consumo", -0.5, 25))

        # passar a oferta: não se cobra, o movimento acompanha
        r = api.guardar_registo({"name": r["name"], "oferta": 1})
        self.assertEqual(r["valor"], 0)
        self.assertEqual(frappe.db.get_value("Tempo Movimento", reg.movimento, "oferta"), 1)

        # apagar o registo apaga o movimento
        api.apagar_registo(r["name"])
        self.assertFalse(frappe.db.exists("Tempo Movimento", reg.movimento))

    def test_preco_do_registo_nao_muda_com_o_acordo(self):
        acordo = _acordo(_cliente(), titulo="Preço guardado", preco_hora=40, arredondamento_bloco=0)
        r = api.guardar_registo({"acordo": acordo, "data": today(), "minutos": 60})
        frappe.db.set_value("Tempo Acordo", acordo, "preco_hora", 80)
        frappe.clear_document_cache("Tempo Acordo", acordo)
        r = api.guardar_registo({"name": r["name"], "descricao": "editado"})
        self.assertEqual(r["valor"], 40)

    def test_preco_fixo_nao_cobra(self):
        acordo = _acordo(_cliente(), titulo="Projeto fechado", tipo="Preço fixo", preco_hora=60)
        r = api.guardar_registo({"acordo": acordo, "data": today(), "minutos": 90})
        self.assertEqual(r["valor"], 0)
        self.assertEqual(r["minutos_faturados"], 90)

    def test_cronometro(self):
        a1 = _acordo(_cliente(), titulo="Crono A", preco_hora=60, arredondamento_bloco=0)
        a2 = _acordo(_cliente(), titulo="Crono B", preco_hora=60, arredondamento_bloco=0)
        r1 = api.iniciar(a1, "primeiro")
        self.assertEqual(r1["em_curso"], 1)
        self.assertIsNone(frappe.db.get_value("Tempo Registo", r1["name"], "movimento"))
        # simular 30 minutos
        frappe.db.set_value("Tempo Registo", r1["name"], "inicio", add_to_date(now_datetime(), minutes=-30))
        # iniciar outro pára o primeiro
        r2 = api.iniciar(a2)
        r1 = frappe.get_doc("Tempo Registo", r1["name"])
        self.assertEqual(r1.em_curso, 0)
        self.assertAlmostEqual(r1.duracao_minutos, 30, delta=1)
        self.assertTrue(r1.movimento)
        self.assertEqual(api.cronometro()["name"], r2["name"])
        api.descartar(r2["name"])
        self.assertIsNone(api.cronometro())

    def test_estudo_e_preco_por_omissao(self):
        dados = {**EXEMPLO, "ano": 2026, "titulo": "Estudo de teste"}
        r = api.calcular_estudo({**dados, "packs": [{"horas": 20, "desconto": 10}]})
        self.assertAlmostEqual(r["preco_recomendado"], 50.09, places=2)
        self.assertTrue(r["packs"][0]["abaixo_minimo"])
        self.assertFalse(r["parametros"]["validados"])

        e = api.guardar_estudo(dados, usar=1)
        d = frappe.get_doc("Tempo Definicoes")
        self.assertAlmostEqual(d.preco_hora, 50.09, places=2)
        self.assertEqual(d.estudo_ativo, e["name"])

        # um acordo sem preço usa o das Definições
        acordo = _acordo(_cliente(), titulo="Sem preço", arredondamento_bloco=0)
        r = api.guardar_registo({"acordo": acordo, "data": today(), "minutos": 60})
        self.assertAlmostEqual(r["valor"], 50.09, places=2)

    def test_resumo(self):
        c = _cliente("Cliente do resumo")
        acordo = _acordo(c, titulo="Resumo", preco_hora=30, arredondamento_bloco=0)
        api.guardar_registo({"acordo": acordo, "data": today(), "minutos": 120})
        res = api.resumo(today()[:7])
        linha = next(l for l in res["linhas"] if l.acordo == acordo)
        self.assertEqual(linha.minutos_cobrar, 120)
        self.assertEqual(linha.valor, 60)
        self.assertEqual(res["saldos"][c]["por_faturar"], 60)

    def test_sem_papel_sem_acesso(self):
        email = "sem.papel@exemplo.invalid"
        if not frappe.db.exists("User", email):
            frappe.get_doc({"doctype": "User", "email": email, "first_name": "Sem", "send_welcome_email": 0}).insert()
        frappe.set_user(email)
        try:
            self.assertFalse(api.tem_acesso())
            with self.assertRaises(frappe.PermissionError):
                api.arranque()
        finally:
            frappe.set_user("Administrator")
