"""O que um site precisa para a app Tempo funcionar. Idempotente: corre na
instalação e no fim de cada migração."""
from __future__ import annotations

import json
import os

import frappe

PAPEL = "Tempo Utilizador"


def garantir():
    papel()
    parametros_fiscais()
    definicoes()
    frappe.db.commit()


def papel():
    if not frappe.db.exists("Role", PAPEL):
        frappe.get_doc({"doctype": "Role", "role_name": PAPEL, "desk_access": 1}).insert(ignore_permissions=True)


def parametros_fiscais():
    """Cria os parâmetros que faltam. Nunca reescreve um que exista: pode ter sido
    validado (ou corrigido) pela contabilidade deste freelancer."""
    caminho = os.path.join(os.path.dirname(__file__), "dados", "parametros_fiscais.json")
    with open(caminho, encoding="utf-8") as fh:
        dados = json.load(fh)
    for p in dados["parametros"]:
        nome = f"{p['regime']}-{p['ano']}-{p['chave']}"
        if frappe.db.exists("Tempo Parametro Fiscal", nome):
            continue
        frappe.get_doc({"doctype": "Tempo Parametro Fiscal", **p, "validado": 0}).insert(ignore_permissions=True)


def definicoes():
    d = frappe.get_doc("Tempo Definicoes")
    mudou = False
    for campo, valor in (("moeda", "EUR"), ("pais", "PT"), ("regime", "PT_IND"),
                         ("arredondamento_bloco", 15), ("arredondamento_modo", "cima")):
        if d.get(campo) in (None, ""):
            d.set(campo, valor)
            mudou = True
    if mudou:
        d.flags.ignore_mandatory = True
        d.save(ignore_permissions=True)
