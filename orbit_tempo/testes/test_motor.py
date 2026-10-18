"""Testes do motor (preço/hora e arredondamento). Correm sem bench:

    python3 -m unittest orbit_tempo.testes.test_motor
"""
import unittest

from orbit_tempo import calculo, preco

# O exemplo do plano (§4.3), que tem de dar sempre os mesmos números.
EXEMPLO = {
    "regime": "PT_IND",
    "despesas": [
        {"descricao": "Contabilista", "valor": 60},
        {"descricao": "Software", "valor": 80},
        {"descricao": "Comunicações", "valor": 50},
        {"descricao": "Seguro", "valor": 25},
        {"descricao": "Portátil", "valor": 2412, "periodicidade": "amortizacao", "anos": 3},
        {"descricao": "Formação", "valor": 40},
        {"descricao": "Deslocações", "valor": 120},
        {"descricao": "Cowork", "valor": 150},
        {"descricao": "Diversos", "valor": 50},
    ],
    "liquido_mensal": 1800, "meses_rendimento": 14,
    "horas_semana": 40, "dias_ferias": 22, "dias_feriados": 13,
    "dias_imprevistos": 5, "dias_formacao": 5,
    "pct_faturavel": 60, "margem": 10,
}
PT = {"ss_taxa": 0.214, "ss_base": 0.70, "irs_coef": 0.75, "irs_taxa_media": 0.20, "iva_taxa": 0.23}


class TestPreco(unittest.TestCase):
    def test_exemplo_do_plano(self):
        r = preco.calcular(EXEMPLO, PT)
        self.assertEqual(r["despesas_mensais"], 642.0)
        self.assertEqual(r["horas_disponiveis"], 1720.0)
        self.assertEqual(r["horas_faturaveis"], 1032.0)
        self.assertAlmostEqual(r["custo_estrutura_hora"], 7.47, places=2)
        self.assertAlmostEqual(r["preco_minimo"], 45.54, places=2)
        self.assertAlmostEqual(r["preco_recomendado"], 50.09, places=2)
        self.assertEqual(r["avisos"], [])

    def test_faturacao_paga_tudo(self):
        # A prova da conta: F menos encargos menos despesas = líquido desejado.
        r = preco.calcular(EXEMPLO, PT)
        sobra = r["faturacao_minima"] - sum(r["encargos"].values()) - r["despesas_anuais"]
        self.assertAlmostEqual(sobra, r["liquido_anual"], delta=0.05)

    def test_primeiro_ano_sem_seguranca_social(self):
        a = preco.calcular(EXEMPLO, PT)
        b = preco.calcular(EXEMPLO, {**PT, "primeiro_ano": 1})
        self.assertLess(b["preco_minimo"], a["preco_minimo"])
        self.assertEqual(b["encargos"]["seguranca_social"], 0)

    def test_espanha_sociedad_limitada(self):
        d = {**EXEMPLO, "regime": "ES_SL", "meses_rendimento": 12}
        p = {"cuota_mensal": 300, "irpf_taxa_media": 0.20, "is_taxa": 0.23}
        r = preco.calcular(d, p)
        # F = 7.704 + 3.600 + 21.600 / 0,8
        self.assertAlmostEqual(r["faturacao_minima"], 7704 + 3600 + 27000, places=2)
        self.assertAlmostEqual(r["imposto_lucros"], r["lucro_antes_impostos"] * 0.23, places=1)
        sobra = r["faturacao_minima"] - sum(r["encargos"].values()) - r["despesas_anuais"]
        self.assertAlmostEqual(sobra, r["liquido_anual"], delta=0.05)

    def test_sociedade_portuguesa_fecha(self):
        d = {**EXEMPLO, "regime": "PT_SOC"}
        p = {"tsu_entidade": 0.2375, "tsu_trabalhador": 0.11, "irs_taxa_media": 0.15, "irc_taxa": 0.17}
        r = preco.calcular(d, p)
        sobra = (r["faturacao_minima"] - sum(r["encargos"].values()) - r["despesas_anuais"])
        self.assertAlmostEqual(sobra, r["liquido_anual"], delta=0.05)

    def test_parametros_em_falta_avisam(self):
        r = preco.calcular({**EXEMPLO, "regime": "ES_AUT"}, {})
        self.assertEqual(r["avisos"][0]["tipo"], "parametros_em_falta")
        self.assertIn("irpf_taxa_media", r["avisos"][0]["campos"])

    def test_sem_horas(self):
        r = preco.calcular({**EXEMPLO, "pct_faturavel": 0}, PT)
        self.assertIsNone(r["preco_minimo"])
        self.assertEqual(r["avisos"][-1]["tipo"], "sem_horas_faturaveis")

    def test_regime_desconhecido(self):
        with self.assertRaises(ValueError):
            preco.calcular({**EXEMPLO, "regime": "XX"}, PT)

    def test_packs_e_trava(self):
        r = preco.calcular(EXEMPLO, PT)
        packs = preco.verificar_packs(r["preco_recomendado"],
                                      [{"horas": 10, "desconto": 5}, {"horas": 20, "desconto": 10}],
                                      r["preco_minimo"])
        self.assertEqual(packs[0]["preco_hora_efetivo"], 47.59)
        self.assertFalse(packs[0]["abaixo_minimo"])
        self.assertEqual(packs[1]["preco_hora_efetivo"], 45.08)
        self.assertTrue(packs[1]["abaixo_minimo"])
        self.assertAlmostEqual(preco.desconto_maximo(r["preco_recomendado"], r["preco_minimo"]), 9.08, places=2)

    def test_sensibilidade_desce_com_mais_horas(self):
        s = preco.sensibilidade(EXEMPLO, PT)
        linha60 = next(l for l in s["linhas"] if l["pct_faturavel"] == 60)["precos"]
        self.assertEqual(linha60, sorted(linha60, reverse=True))


class TestArredondamento(unittest.TestCase):
    def test_blocos(self):
        f = calculo.minutos_faturados
        self.assertEqual(f(0, 15), 0)
        self.assertEqual(f(1, 15), 15)
        self.assertEqual(f(15, 15), 15)
        self.assertEqual(f(16, 15), 30)
        self.assertEqual(f(22, 15, "proximo"), 15)
        self.assertEqual(f(23, 15, "proximo"), 30)
        self.assertEqual(f(3, 15, "proximo"), 15)
        self.assertEqual(f(7.2, 0), 8)
        self.assertEqual(f(10, 6, minimo=30), 30)
        self.assertEqual(f(0, 6, minimo=30), 0)

    def test_ler_horas_como_no_portal(self):
        f = calculo.ler_horas
        self.assertEqual(f("10.8"), 10.8)
        self.assertEqual(f("10,5"), 10.5)
        self.assertEqual(f("10H30m"), 10.5)
        self.assertEqual(f("1H30M"), 1.5)
        self.assertEqual(f("90m"), 1.5)
        self.assertEqual(f("1:30"), 1.5)
        self.assertEqual(f("2h"), 2)
        for mau in ("", "abc", "1h30x"):
            with self.assertRaises(ValueError):
                f(mau)

    def test_valor(self):
        self.assertEqual(calculo.valor(90, 50), 75.0)
        self.assertEqual(calculo.valor(20, 45.54), 15.18)


if __name__ == "__main__":
    unittest.main()
