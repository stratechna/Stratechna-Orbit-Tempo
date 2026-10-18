"""Emails do Tempo aos clientes do freelancer e ao próprio freelancer.

Saem pela fila de correio do Frappe do tenant, com a marca do freelancer e na língua do
cliente. Aos clientes, só em dia útil das 08:00 às 19:00 (a mesma regra dos emails da
Stratechna): fora disso ficam agendados para a próxima janela.
"""
from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, get_datetime, get_url, now_datetime

JANELA = (8, 19)


def proxima_janela(agora=None):
    """None se já estamos na janela; senão, a data/hora em que abre."""
    agora = get_datetime(agora) if agora else now_datetime()
    if agora.weekday() < 5 and JANELA[0] <= agora.hour < JANELA[1]:
        return None
    alvo = agora.replace(hour=JANELA[0], minute=0, second=0, microsecond=0)
    if agora.hour >= JANELA[1] or agora.weekday() >= 5:
        alvo = add_days(alvo, 1)
    while alvo.weekday() >= 5:
        alvo = add_days(alvo, 1)
    return alvo


def _marca() -> str:
    d = frappe.get_cached_doc("Tempo Definicoes")
    return d.nome_comercial or frappe.db.get_single_value("Website Settings", "app_name") or "Tempo"


def emails_do_cliente(cliente: str) -> list[str]:
    """Os contactos do cliente com acesso ao portal (ou, sem nenhum, os contactos com email)."""
    contactos = frappe.get_all("Dynamic Link", filters={"link_doctype": "Customer", "link_name": cliente,
                                                        "parenttype": "Contact"}, pluck="parent")
    if not contactos:
        return []
    linhas = frappe.get_all("Contact", filters={"name": ["in", contactos]}, fields=["email_id", "user"])
    com_acesso = [l.email_id for l in linhas if l.user and l.email_id]
    return com_acesso or [l.email_id for l in linhas if l.email_id]


def _lingua(cliente: str) -> str | None:
    return frappe.db.get_value("Customer", cliente, "language") or None


def _enviar(destinatarios, assunto, corpo, cliente=None, referencia=None):
    if not destinatarios:
        return
    lang = _lingua(cliente) if cliente else None
    _mandar(recipients=destinatarios, subject=assunto, message=corpo, reference_doctype=referencia and referencia.doctype,
            reference_name=referencia and referencia.name, send_after=proxima_janela() if cliente else None,
            header=[_marca(), "gray"], now=False)
    return lang


def _mandar(**kw) -> bool:
    """Um aviso por email nunca trava a operação (o extrato, o saldo, a entrada continuam visíveis no
    portal do cliente). Sem conta de correio de saída, fica no registo de erros e um aviso no ecrã."""
    try:
        frappe.sendmail(**kw)
        return True
    except frappe.OutgoingEmailError:
        frappe.log_error(title="Stratechna Tempo: email não enviado (sem conta de saída)", message=str(kw.get("subject")))
        frappe.msgprint(_("O email não foi enviado: este Orbit ainda não tem conta de correio de saída."), indicator="orange", alert=True)
        return False


def extrato_enviado(ext):
    lang = _lingua(ext.cliente)
    with _na_lingua(lang):
        assunto = _("Extrato de horas de {0} a {1}").format(frappe.format(ext.desde, {"fieldtype": "Date"}),
                                                            frappe.format(ext.ate, {"fieldtype": "Date"}))
        corpo = (f"<p>{_('O extrato de horas do período está disponível para consulta e aprovação.')}</p>"
                 f"<p>{_('Horas a cobrar')}: <b>{frappe.format(ext.horas_consumidas, {'fieldtype': 'Float'})}</b></p>"
                 f"<p><a href=\"{get_url('/cliente/aprovacoes')}\">{_('Ver e aprovar')}</a></p>")
    _enviar(emails_do_cliente(ext.cliente), assunto, corpo, ext.cliente, ext)


def extrato_contestado(ext, movimento, motivo):
    responsaveis = [u for u in frappe.get_all("Has Role", filters={"role": "System Manager", "parenttype": "User"},
                                              pluck="parent") if u not in ("Administrator", "Guest")]
    _enviar(responsaveis, _("Extrato {0} contestado").format(ext.name),
            f"<p>{frappe.utils.escape_html(motivo)}</p><p>{movimento}</p>", referencia=ext)


def saldo_baixo(cliente, acordo, disponivel):
    lang = _lingua(cliente)
    with _na_lingua(lang):
        if disponivel < 0:
            assunto = _("Saldo de horas negativo")
        else:
            assunto = _("Saldo de horas reduzido")
        corpo = f"<p>{assunto}: <b>{frappe.format(disponivel, {'fieldtype': 'Float'})} h</b></p>" \
                f"<p><a href=\"{get_url('/cliente')}\">{_('Ver o extrato de horas')}</a></p>"
    _enviar(emails_do_cliente(cliente), assunto, corpo, cliente)


def ligacao_de_entrada(email, ligacao):
    corpo = (f"<p>{_('Use esta ligação para entrar na sua área de cliente. É válida durante 30 minutos e só uma vez.')}</p>"
             f"<p><a href=\"{ligacao}\">{_('Entrar')}</a></p>")
    _mandar(recipients=[email], subject=_("A sua ligação de entrada — {0}").format(_marca()), message=corpo,
            header=[_marca(), "gray"], now=True)


class _na_lingua:
    def __init__(self, lang):
        self.lang, self.antes = lang, None

    def __enter__(self):
        if self.lang:
            self.antes = frappe.local.lang
            frappe.local.lang = self.lang
            frappe.local.lang_full_dict = None

    def __exit__(self, *a):
        if self.lang and self.antes:
            frappe.local.lang = self.antes
            frappe.local.lang_full_dict = None
