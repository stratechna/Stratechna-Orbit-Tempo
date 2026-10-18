"""Entrada de horas e cronómetros — tudo acaba numa linha da Folha de horas (decisão T2).

O mesmo caminho que o `orbit.portal.registar_tempo` da Stratechna: Timesheet com a linha,
inserida e submetida; ao submeter, o livro recebe o consumo (`livro.ao_submeter`).
"""
from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, get_datetime, getdate, now_datetime, time_diff_in_seconds

ACTIVIDADE_GERAL = "Execution"
ACTIVIDADE_BILHETE = "Apoio ao cliente"


def _empresa() -> str:
    empresa = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
    if not empresa:
        empresas = frappe.get_all("Company", pluck="name", limit=1)
        empresa = empresas[0] if empresas else None
    if not empresa:
        frappe.throw(_("O Orbit ainda não tem empresa configurada."))
    return empresa


def _actividade(nome: str) -> str:
    if not frappe.db.exists("Activity Type", nome):
        frappe.get_doc({"doctype": "Activity Type", "activity_type": nome}).insert(ignore_permissions=True)
    return nome


def _bilhete(valor) -> str | None:
    if not valor or not frappe.db.exists("DocType", "HD Ticket"):
        return None
    return str(valor) if frappe.db.exists("HD Ticket", str(valor)) else None


def registar(acordo: str, horas: float, inicio=None, descricao: str | None = None, bilhete=None,
             tarefa: str | None = None, faturavel: int = 1, utilizador: str | None = None) -> dict:
    """Uma linha na Folha de horas, submetida. Devolve a folha, a linha e o movimento no livro."""
    horas = flt(horas)
    if horas <= 0:
        frappe.throw(_("As horas têm de ser mais do que zero."))
    if horas > 24:
        frappe.throw(_("Um registo não pode passar de 24 horas."))
    a = frappe.get_doc("Tempo Acordo", acordo)
    if not a.ativo:
        frappe.throw(_("O acordo «{0}» não está ativo.").format(a.titulo))
    inicio = get_datetime(inicio) if inicio else add_to_date(now_datetime(), hours=-horas)
    bilhete = _bilhete(bilhete)
    if tarefa and not frappe.db.exists("Task", tarefa):
        tarefa = None
    projeto = (frappe.db.get_value("Task", tarefa, "project") if tarefa else None) or a.projeto
    ts = frappe.get_doc({
        "doctype": "Timesheet", "company": _empresa(), "customer": a.cliente, "tempo_acordo": a.name,
        "parent_project": projeto, "note": descricao or None,
        "time_logs": [{
            "activity_type": _actividade(ACTIVIDADE_BILHETE if bilhete else ACTIVIDADE_GERAL),
            "from_time": inicio, "hours": horas, "to_time": add_to_date(inicio, seconds=int(round(horas * 3600))),
            "project": projeto, "task": tarefa, "description": descricao, "is_billable": 1 if cint(faturavel) else 0,
        }],
    })
    if bilhete and ts.meta.has_field("custom_hd_ticket"):
        ts.custom_hd_ticket = bilhete
    if utilizador:
        ts.user = utilizador
    ts.insert()
    ts.submit()
    linha = ts.time_logs[0].name
    return {"timesheet": ts.name, "linha": linha,
            "movimento": frappe.db.get_value("Tempo Movimento", {"timesheet_linha": linha})}


# ── Cronómetros ──────────────────────────────────────────────────────────────

def segundos(c) -> float:
    """Tempo contado por um cronómetro, descontadas as pausas."""
    fim = get_datetime(c.pausado_em) if c.pausado_em else now_datetime()
    return max(time_diff_in_seconds(fim, get_datetime(c.inicio)) - cint(c.segundos_pausa), 0)


def iniciar(acordo: str, descricao=None, bilhete=None, tarefa=None) -> str:
    c = frappe.get_doc({"doctype": "Tempo Cronometro", "utilizador": frappe.session.user, "acordo": acordo,
                        "inicio": now_datetime(), "descricao": descricao, "bilhete": _bilhete(bilhete),
                        "tarefa": tarefa if tarefa and frappe.db.exists("Task", tarefa) else None})
    c.insert()
    return c.name


def _meu(nome: str):
    c = frappe.get_doc("Tempo Cronometro", nome)
    if c.utilizador != frappe.session.user and "System Manager" not in frappe.get_roles():
        frappe.throw(_("Este cronómetro não é seu."), frappe.PermissionError)
    return c


def pausar(nome: str) -> None:
    c = _meu(nome)
    if not c.pausado_em:
        c.pausado_em = now_datetime()
        c.save()


def retomar(nome: str) -> None:
    c = _meu(nome)
    if c.pausado_em:
        c.segundos_pausa = cint(c.segundos_pausa) + int(time_diff_in_seconds(now_datetime(), get_datetime(c.pausado_em)))
        c.pausado_em = None
        c.save()


def parar(nome: str, descricao=None, faturavel: int = 1) -> dict:
    """Pára e guarda: a linha da folha começa à hora de início e dura o tempo contado."""
    c = _meu(nome)
    horas = segundos(c) / 3600
    if horas < 1 / 60:
        frappe.throw(_("O cronómetro tem menos de um minuto. Descarte-o ou continue."))
    r = registar(c.acordo, horas, inicio=c.inicio, descricao=descricao if descricao is not None else c.descricao,
                 bilhete=c.bilhete, tarefa=c.tarefa, faturavel=faturavel, utilizador=c.utilizador)
    c.delete()
    return r


def descartar(nome: str) -> None:
    _meu(nome).delete()
