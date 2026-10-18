"""Todos os textos da interface e das mensagens têm tradução em es e en.

Corre sem bench: python3 -m unittest orbit_tempo.testes.test_traducoes
"""
import csv
import glob
import os
import re
import unittest

from orbit_tempo import preco

APP = os.path.dirname(os.path.dirname(__file__))
FRONTEND = os.path.join(os.path.dirname(APP), "frontend", "src")

# Frases que a interface traduz por variável — t(c), t(a.tipo), t(e.estado), t(NOMES_…[k]) —
# e que por isso não aparecem como t('…') no código.
POR_VARIAVEL = {
    "Contabilidade", "Software", "Comunicações", "Espaço", "Seguros", "Deslocações", "Formação", "Marketing",
    "Equipamento", "Banco e pagamentos", "Outros",
    "Taxa da Segurança Social", "Base de incidência da Segurança Social", "Coeficiente do regime simplificado",
    "Taxa média de IRS", "1.º ano (isento de Segurança Social)", "IVA", "TSU da empresa", "TSU do gerente", "IRC",
    "Cuota de autónomos (€/mês)", "Taxa média de IRPF", "Impuesto de Sociedades", "Taxa média de impostos",
    "Segurança Social", "IRS", "Cuota de autónomos", "IRPF", "Impostos",
    "Contabilista / gestoria", "Software e assinaturas", "Telemóvel e internet", "Escritório / cowork / parte da casa",
    "Seguro de responsabilidade civil", "Computador",
    "Horas por semana", "Dias por semana", "Tempo faturável (%)", "Férias (dias)", "Feriados (dias)",
    "Doença e imprevistos (dias)", "Formação (dias)",
    "À hora", "Pack de horas", "Avença", "Preço fixo (só para medir a rentabilidade)", "Hora", "Pack", "Preço fixo",
    "Cobrar à hora", "Abater no próximo", "Bloquear",
    "Rascunho", "Enviado", "Contestado", "Aprovado", "Faturado", "Todos",
}


def textos() -> set[str]:
    s = set(POR_VARIAVEL) | set(preco.REGIMES.values())
    for f in glob.glob(os.path.join(FRONTEND, "**", "*.js*"), recursive=True):
        codigo = open(f, encoding="utf-8").read()
        s |= set(re.findall(r"\bt\(\s*'((?:[^'\\]|\\.)*)'", codigo))
        s |= set(re.findall(r'\bt\(\s*"((?:[^"\\]|\\.)*)"', codigo))
    for f in glob.glob(os.path.join(APP, "**", "*.py"), recursive=True):
        if os.sep + "testes" + os.sep in f:
            continue
        s |= set(re.findall(r'\b_\("((?:[^"\\]|\\.)*)"', open(f, encoding="utf-8").read()))
    return {x for x in s if len(x) > 1}


def traducoes(lang) -> dict:
    with open(os.path.join(APP, "translations", f"{lang}.csv"), encoding="utf-8") as fh:
        return {l[0]: l[1] for l in csv.reader(fh) if len(l) >= 2}


class TestTraducoes(unittest.TestCase):
    def test_todos_traduzidos(self):
        precisos = textos()
        self.assertGreater(len(precisos), 300)
        for lang in ("es", "en"):
            em_falta = sorted(precisos - set(traducoes(lang)))
            self.assertEqual(em_falta, [], f"sem tradução {lang}")

    def test_marcadores_iguais(self):
        for lang in ("es", "en"):
            for pt, tr in traducoes(lang).items():
                self.assertEqual(sorted(re.findall(r"\{\d\}", pt)), sorted(re.findall(r"\{\d\}", tr)), f"{lang}: {pt}")


if __name__ == "__main__":
    unittest.main()
