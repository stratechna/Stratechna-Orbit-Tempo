"""O que um site precisa para a app Tempo funcionar. Idempotente: corre na
instalação e no fim de cada migração."""
from __future__ import annotations

import json
import os

import frappe

PAPEL = "Tempo Utilizador"


def garantir():
    papel()
    campos()
    projetos()
    parametros_fiscais()
    definicoes()
    frappe.db.commit()


def campos():
    """A ligação da Folha de horas ao acordo (e ao bilhete do Desk, quando o Helpdesk existe).

    O `custom_hd_ticket` tem o mesmo nome e forma que o `orbit_tempo_bilhetes.py` do Apps02
    já instala nos tenants com o botão «Registar tempo» no bilhete: se existir, não se toca."""
    from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
    if not frappe.db.exists("DocType", "Timesheet"):
        return
    novos = [dict(fieldname="tempo_acordo", label="Acordo (Tempo)", fieldtype="Link", options="Tempo Acordo",
                  insert_after="customer", in_standard_filter=1,
                  description="Dá o cliente, o arredondamento e o preço. Com um só acordo ativo, escolhe-se sozinho.")]
    if frappe.db.exists("DocType", "HD Ticket") and not frappe.db.exists("Custom Field", "Timesheet-custom_hd_ticket"):
        novos.append(dict(fieldname="custom_hd_ticket", label="Bilhete", fieldtype="Link", options="HD Ticket",
                          insert_after="tempo_acordo"))
    create_custom_fields({"Timesheet": novos}, ignore_validate=True, update=True)


def projetos():
    """Cronómetros em paralelo e registos manuais de horas já passadas sobrepõem-se no tempo — como no
    portal, onde vários cronómetros correm ao mesmo tempo. O ERPNext recusa-o por omissão (OverlapError)."""
    if not frappe.db.exists("DocType", "Projects Settings"):
        return
    for campo in ("ignore_user_time_overlap", "ignore_employee_time_overlap"):
        if frappe.get_meta("Projects Settings").has_field(campo) and not frappe.db.get_single_value("Projects Settings", campo):
            frappe.db.set_single_value("Projects Settings", campo, 1)


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
