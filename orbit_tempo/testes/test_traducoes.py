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


def textos() -> set[str]:
    js = open(os.path.join(APP, "public", "js", "tempo.js"), encoding="utf-8").read()
    s = set(re.findall(r'\bt\("((?:[^"\\]|\\.)*)"', js))
    # listas que se traduzem por variável: t(nome), t(c), t(NOMES_…[k]), t(r)
    for inicio, fim in (("const VISTAS", "function render"), ("const CATEGORIAS", "function estudoNovo")):
        bloco = js[js.index(inicio):js.index(fim)]
        s |= {m for m in re.findall(r'"([^"]+)"', bloco) if not re.fullmatch(r"[a-z_]+", m)}
    # as opções do tipo de acordo: [["Hora", "À hora"], …] — valor e rótulo
    s |= set(re.findall(r'\["(?:Hora|Pack|Avença|Preço fixo)", "([^"]+)"\]', js))
    s |= {"Hora", "Pack", "Avença", "Preço fixo"}
    for f in glob.glob(os.path.join(APP, "**", "*.py"), recursive=True):
        if "testes" in f:
            continue
        s |= set(re.findall(r'\b_\("((?:[^"\\]|\\.)*)"', open(f, encoding="utf-8").read()))
    s |= set(preco.REGIMES.values())
    # símbolos de um carácter (ícones da navegação) não se traduzem
    return {x for x in s if len(x) > 1 and not x.startswith("tp-")}


def traducoes(lang) -> dict:
    with open(os.path.join(APP, "translations", f"{lang}.csv"), encoding="utf-8") as fh:
        return {l[0]: l[1] for l in csv.reader(fh) if len(l) >= 2}


class TestTraducoes(unittest.TestCase):
    def test_todos_traduzidos(self):
        precisos = textos()
        self.assertGreater(len(precisos), 150)
        for lang in ("es", "en"):
            em_falta = sorted(precisos - set(traducoes(lang)))
            self.assertEqual(em_falta, [], f"sem tradução {lang}")

    def test_marcadores_iguais(self):
        for lang in ("es", "en"):
            for pt, tr in traducoes(lang).items():
                self.assertEqual(sorted(re.findall(r"\{\d\}", pt)), sorted(re.findall(r"\{\d\}", tr)), f"{lang}: {pt}")


if __name__ == "__main__":
    unittest.main()
