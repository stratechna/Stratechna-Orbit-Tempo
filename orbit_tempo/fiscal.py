"""Parâmetros fiscais para o estudo do preço/hora.

Vêm da tabela `Tempo Parametro Fiscal` (regime + ano). Se o ano pedido ainda não
tiver valores, usa-se o ano mais recente anterior — e diz-se isso ao utilizador,
porque um parâmetro de outro ano é uma aproximação, não um facto.
"""
from __future__ import annotations

import json

import frappe


def parametros(regime: str, ano: int) -> dict:
    """{"valores": {chave: valor}, "linhas": [...], "ano_usado": n, "validados": bool}"""
    anos = frappe.get_all("Tempo Parametro Fiscal", filters={"regime": regime, "ano": ["<=", int(ano)]},
                          pluck="ano", distinct=True, order_by="ano desc")
    if not anos:
        anos = frappe.get_all("Tempo Parametro Fiscal", filters={"regime": regime},
                              pluck="ano", distinct=True, order_by="ano asc")
    if not anos:
        return {"valores": {}, "linhas": [], "ano_usado": None, "validados": False}
    ano_usado = anos[0]
    linhas = frappe.get_all(
        "Tempo Parametro Fiscal",
        filters={"regime": regime, "ano": ano_usado},
        fields=["chave", "valor", "unidade", "descricao", "fonte", "validado", "validado_por", "validado_em"],
        order_by="chave asc",
    )
    return {
        "valores": {l.chave: l.valor for l in linhas},
        "linhas": linhas,
        "ano_usado": ano_usado,
        "validados": bool(linhas) and all(l.validado for l in linhas),
    }


def proprios(texto) -> dict:
    """Os parâmetros do próprio estudo (JSON), só números."""
    if not texto:
        return {}
    if isinstance(texto, str):
        try:
            texto = json.loads(texto)
        except ValueError:
            return {}
    if not isinstance(texto, dict):
        return {}
    saida = {}
    for k, v in texto.items():
        try:
            saida[str(k)] = float(v)
        except (TypeError, ValueError):
            continue
    return saida
