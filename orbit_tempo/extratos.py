"""Extratos do período (decisão T7): o Admin fecha, envia; o cliente aprova ou contesta uma
linha; sem resposta, fica aprovado ao fim de N dias (Definições, 7 por omissão). Depois do
envio as linhas ficam trancadas — corrige-se com um ajuste, que fica visível.
"""
from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_url, getdate, now_datetime

from orbit_tempo import avisos, livro


def fechar(cliente: str, desde, ate, acordo: str | None = None) -> str:
    """Cria (ou refaz, se ainda em rascunho) o extrato do período e prende-lhe os movimentos."""
    desde, ate = getdate(desde), getdate(ate)
    if ate < desde:
        frappe.throw(_("O fim do período é anterior ao início."))
    existente = frappe.db.get_value("Tempo Extrato", {"cliente": cliente, "acordo": acordo or ["is", "not set"],
                                                      "desde": desde, "ate": ate})
    ext = frappe.get_doc("Tempo Extrato", existente) if existente else frappe.get_doc(
        {"doctype": "Tempo Extrato", "cliente": cliente, "acordo": acordo, "desde": desde, "ate": ate})
    # um documento novo só recebe o estado por omissão («Rascunho») ao gravar
    if (ext.estado or "Rascunho") != "Rascunho":
        frappe.throw(_("Este extrato já foi enviado."))
    filtros = {"cliente": cliente, "data": ["between", [desde, ate]], "extrato": ["in", ["", None] + ([ext.name] if ext.name else [])]}
    if acordo:
        filtros["acordo"] = acordo
    movs = frappe.get_all("Tempo Movimento", filters=filtros, fields=["name", "tipo", "horas", "valor", "oferta", "faturavel"])
    ext.horas_consumidas = round(sum(-m.horas for m in movs if m.tipo == "consumo" and not m.oferta), 2)
    ext.horas_oferta = round(sum(-m.horas for m in movs if m.tipo == "consumo" and m.oferta), 2)
    ext.valor = round(sum(m.valor or 0 for m in movs if m.tipo == "consumo" and m.faturavel and not m.oferta), 2)
    ext.saldo_final = livro.saldo(cliente, acordo)["disponivel"]
    ext.save() if existente else ext.insert()
    for m in movs:
        frappe.db.set_value("Tempo Movimento", m.name, "extrato", ext.name, update_modified=False)
    return ext.name


def enviar(nome: str) -> None:
    ext = frappe.get_doc("Tempo Extrato", nome)
    if ext.estado != "Rascunho":
        frappe.throw(_("Este extrato já foi enviado."))
    ext.estado = "Enviado"
    ext.enviado_em = now_datetime()
    ext.save()
    avisos.extrato_enviado(ext)


def aprovar(nome: str, por: str, tacita: bool = False) -> None:
    ext = frappe.get_doc("Tempo Extrato", nome)
    if ext.estado not in ("Enviado", "Contestado"):
        frappe.throw(_("Este extrato não está à espera de aprovação."))
    ext.estado = "Aprovado"
    ext.aprovado_em = now_datetime()
    ext.aprovado_por = por
    ext.aprovacao_tacita = 1 if tacita else 0
    ext.save(ignore_permissions=True)


def contestar(nome: str, movimento: str, motivo: str) -> None:
    ext = frappe.get_doc("Tempo Extrato", nome)
    if ext.estado not in ("Enviado", "Contestado"):
        frappe.throw(_("Este extrato não está à espera de aprovação."))
    if frappe.db.get_value("Tempo Movimento", movimento, "extrato") != ext.name:
        frappe.throw(_("Essa linha não pertence a este extrato."))
    if not (motivo or "").strip():
        frappe.throw(_("Diga o motivo."))
    ext.append("contestacoes", {"movimento": movimento, "motivo": motivo.strip()})
    ext.estado = "Contestado"
    ext.save(ignore_permissions=True)
    avisos.extrato_contestado(ext, movimento, motivo)


def registar_fatura(nome: str, numero: str, pdf: str | None = None) -> None:
    ext = frappe.get_doc("Tempo Extrato", nome)
    if ext.estado != "Aprovado":
        frappe.throw(_("Só se fatura um extrato aprovado."))
    ext.fatura_numero = numero
    if pdf:
        ext.fatura_pdf = pdf
    ext.estado = "Faturado"
    ext.save()


def aprovar_tacitos():
    """Diário: extratos enviados há mais de N dias sem resposta ficam aprovados."""
    dias = cint(livro.definicoes().dias_aprovacao_tacita) or 7
    limite = add_days(now_datetime(), -dias)
    for nome in frappe.get_all("Tempo Extrato", filters={"estado": "Enviado", "enviado_em": ["<", limite]}, pluck="name"):
        aprovar(nome, "aprovação tácita", tacita=True)
    frappe.db.commit()


def ligacao_cliente(caminho: str = "") -> str:
    return get_url(f"/cliente{caminho}")
