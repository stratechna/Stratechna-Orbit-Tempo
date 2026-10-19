"""O livro de horas do cliente (`Tempo Movimento`), alimentado pela Folha de horas do Orbit.

Versão 2 (decisão T2, 18-10-2026): a **Folha de horas (Timesheet) do ERPNext é a fonte do
trabalho** — é onde o Desk («Registar tempo» no bilhete), o Projects, os cronómetros e a
Entrada de horas escrevem. É o mesmo desenho da Stratechna desde 17-10 (Timesheet do
Orbit → livro do portal). Uma folha só para o Tempo obrigaria a anotar duas vezes.

* antes de validar a folha: o acordo dá o cliente, o arredondamento (`billing_hours`) e o
  preço (`billing_rate`, só se a linha ainda não tiver — o preço fica gravado);
* ao submeter: uma linha da folha = um movimento de **consumo** (chave = a linha);
* ao cancelar: os consumos dessa folha saem — excepto se já estiverem num extrato
  enviado, que só se corrige por ajuste.

Semântica do livro (a do `entrada_tempo` do portal): `credito` (pack, avença) positivo;
`consumo` e `expiracao` negativos; `ajuste` com sinal; as ofertas aparecem mas não gastam
saldo. O trabalho de um acordo a preço fixo não entra no livro (conta só para a
rentabilidade, lida directamente das folhas).
"""
from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, flt, get_datetime, getdate, now_datetime, time_diff_in_seconds, today

from orbit_tempo import calculo

ESTADOS_TRANCADOS = ("Enviado", "Aprovado", "Contestado", "Faturado")


def definicoes():
    return frappe.get_cached_doc("Tempo Definicoes")


def regras_do_acordo(acordo) -> dict:
    """Arredondamento e preço do acordo, com as Definições a preencher o que estiver vazio."""
    d = definicoes()
    if isinstance(acordo, str):
        acordo = frappe.get_cached_doc("Tempo Acordo", acordo)

    def escolher(campo, omissao=None, zero_vazio=False):
        # No acordo, o bloco e o mínimo são escolhas em texto: "" herda, "0" é zero a sério.
        # O preço é numérico e o Frappe grava o vazio como 0 — por isso 0 também herda.
        v = acordo.get(campo)
        if v in (None, "") or (zero_vazio and not v):
            v = d.get(campo)
        return v if v not in (None, "") else omissao

    return {
        "tipo": acordo.tipo,
        "bloco": int(escolher("arredondamento_bloco", 15) or 0),
        "modo": escolher("arredondamento_modo", "cima") or "cima",
        "minimo": int(escolher("minimo_minutos", 0) or 0),
        "preco_hora": float(escolher("preco_hora", 0, zero_vazio=True) or 0),
    }


def acordo_do_cliente(cliente: str | None) -> str | None:
    """O acordo ativo de um cliente, quando há só um (o «Registar tempo» do Desk não sabe de acordos)."""
    if not cliente:
        return None
    ativos = frappe.get_all("Tempo Acordo", filters={"cliente": cliente, "ativo": 1}, pluck="name", limit=2)
    return ativos[0] if len(ativos) == 1 else None


# ── Folha de horas ───────────────────────────────────────────────────────────

def antes_de_validar(doc, method=None):
    """Timesheet.before_validate: o acordo põe cliente, horas a cobrar e preço."""
    if not doc.get("tempo_acordo"):
        doc.tempo_acordo = acordo_do_cliente(doc.get("customer"))
    if not doc.get("tempo_acordo"):
        return
    acordo = frappe.get_cached_doc("Tempo Acordo", doc.tempo_acordo)
    regras = regras_do_acordo(acordo)
    doc.customer = acordo.cliente
    for linha in doc.get("time_logs") or []:
        if linha.from_time and linha.to_time:
            linha.hours = max(time_diff_in_seconds(get_datetime(linha.to_time), get_datetime(linha.from_time)) / 3600, 0)
        if not linha.project and acordo.projeto:
            linha.project = acordo.projeto
        if regras["tipo"] == "Preço fixo":
            linha.is_billable = 0
        if not linha.is_billable:
            linha.billing_hours = 0
            continue
        minutos = calculo.minutos_faturados(flt(linha.hours) * 60, regras["bloco"], regras["modo"], regras["minimo"])
        linha.billing_hours = minutos / 60
        if not flt(linha.billing_rate):
            # Num pack ou avença as horas já estão pagas: a linha não leva preço (não se fatura duas vezes).
            linha.billing_rate = 0 if regras["tipo"] in ("Pack", "Avença") else regras["preco_hora"]


def _linha_trancada(nome_mov: str) -> bool:
    extrato = frappe.db.get_value("Tempo Movimento", nome_mov, "extrato")
    return bool(extrato) and frappe.db.get_value("Tempo Extrato", extrato, "estado") in ESTADOS_TRANCADOS


def ao_submeter(doc, method=None):
    """Timesheet.on_submit: cada linha passa a um consumo no livro do cliente."""
    if not doc.get("tempo_acordo"):
        return
    acordo = frappe.get_cached_doc("Tempo Acordo", doc.tempo_acordo)
    if acordo.tipo == "Preço fixo":
        return
    regras = regras_do_acordo(acordo)
    for linha in doc.get("time_logs") or []:
        reais = flt(linha.hours) * 60
        if linha.is_billable:
            minutos = flt(linha.billing_hours) * 60
        else:
            # oferta: mostra-se arredondada como as outras, mas não gasta saldo
            minutos = calculo.minutos_faturados(reais, regras["bloco"], regras["modo"], regras["minimo"])
        inicio = get_datetime(linha.from_time) if linha.from_time else now_datetime()
        valores = {
            "cliente": acordo.cliente, "acordo": acordo.name, "tipo": "consumo",
            "data": inicio.date(), "hora": inicio.time().replace(microsecond=0),
            "horas": -round(minutos / 60, 4), "minutos_reais": round(reais, 2),
            "valor": flt(linha.billing_amount) if linha.is_billable else 0,
            "faturavel": 1 if linha.is_billable else 0, "oferta": 0 if linha.is_billable else 1,
            "timesheet": doc.name, "timesheet_linha": linha.name,
            "bilhete": doc.get("custom_hd_ticket"), "tarefa": linha.task,
            "utilizador": doc.flags.get("tempo_utilizador") or doc.get("user") or doc.owner,
            "descricao": linha.description or doc.get("note"),
        }
        existente = frappe.db.get_value("Tempo Movimento", {"timesheet_linha": linha.name})
        if existente:
            mov = frappe.get_doc("Tempo Movimento", existente)
            mov.update(valores)
            mov.save(ignore_permissions=True)
        else:
            frappe.get_doc({"doctype": "Tempo Movimento", **valores}).insert(ignore_permissions=True)
    _avisar_saldo(acordo, sum(flt(l.billing_hours) for l in doc.get("time_logs") or [] if l.is_billable))


def _avisar_saldo(acordo, horas_agora):
    """Aviso ao cliente quando um pack/avença desce abaixo do limiar (ou fica negativo) — só ao atravessar."""
    if acordo.tipo not in ("Pack", "Avença") or not horas_agora:
        return
    from orbit_tempo import avisos
    limiar = flt(definicoes().alerta_saldo_horas) or 2
    depois = saldo(acordo.cliente, acordo.name)["disponivel"]
    antes = depois + horas_agora
    if (antes >= limiar > depois) or (antes >= 0 > depois):
        avisos.saldo_baixo(acordo.cliente, acordo.name, depois)


def ao_cancelar(doc, method=None):
    """Timesheet.on_cancel: os consumos dessa folha saem do livro."""
    movs = frappe.get_all("Tempo Movimento", filters={"timesheet": doc.name}, pluck="name")
    if any(_linha_trancada(m) for m in movs):
        frappe.throw(_("Esta folha de horas já está num extrato enviado ao cliente. Corrija com um ajuste."))
    for m in movs:
        frappe.delete_doc("Tempo Movimento", m, ignore_permissions=True, force=True)


# ── Créditos, ajustes e expirações ───────────────────────────────────────────

def lancar_movimento(cliente, acordo, tipo, horas, descricao, data=None, valor=0.0) -> str:
    if tipo not in ("credito", "ajuste", "expiracao"):
        frappe.throw(_("Tipo de movimento inválido."))
    if tipo == "expiracao":
        horas = -abs(horas)
    elif tipo == "credito":
        horas = abs(horas)
    mov = frappe.get_doc({"doctype": "Tempo Movimento", "cliente": cliente, "acordo": acordo, "tipo": tipo,
                          "data": data or today(), "hora": now_datetime().time().replace(microsecond=0),
                          "horas": horas, "valor": valor, "faturavel": 0, "descricao": descricao,
                          "utilizador": frappe.session.user})
    mov.insert(ignore_permissions=True)
    return mov.name


def creditar_pack(acordo_nome: str) -> str | None:
    """O pack foi pago (decisão T6): as horas entram no livro. Uma vez por acordo."""
    a = frappe.get_doc("Tempo Acordo", acordo_nome)
    if a.tipo != "Pack":
        frappe.throw(_("Só um acordo do tipo Pack recebe o crédito do pack."))
    if a.credito_lancado:
        return None
    if not flt(a.horas_pack):
        frappe.throw(_("O acordo não tem as horas do pack."))
    preco = regras_do_acordo(a)["preco_hora"] * (1 - flt(a.desconto_pack) / 100)
    nome = lancar_movimento(a.cliente, a.name, "credito", flt(a.horas_pack),
                            _("Pack de {0} h").format(frappe.format(a.horas_pack, {"fieldtype": "Float"}))
                            + (f" (−{frappe.format(a.desconto_pack, {'fieldtype': 'Float'})} %)" if a.desconto_pack else ""),
                            valor=round(preco * flt(a.horas_pack), 2))
    a.db_set("credito_lancado", 1)
    return nome


def expirar_packs():
    """Diário: o saldo de um pack que passou a validade entra como expiração."""
    for a in frappe.get_all("Tempo Acordo", filters={"tipo": "Pack", "data_fim": ["<", today()], "credito_lancado": 1},
                            fields=["name", "cliente", "data_fim"]):
        if frappe.db.exists("Tempo Movimento", {"acordo": a.name, "tipo": "expiracao"}):
            continue
        s = saldo(a.cliente, a.name)
        if s["disponivel"] > 0:
            lancar_movimento(a.cliente, a.name, "expiracao", s["disponivel"],
                             _("Expiração do pack (validade {0})").format(frappe.format(a.data_fim, {"fieldtype": "Date"})),
                             data=add_days(a.data_fim, 1))
    frappe.db.commit()


# ── Leituras ─────────────────────────────────────────────────────────────────

def saldo(cliente: str, acordo: str | None = None) -> dict:
    """Créditos − consumos − expirações (as ofertas não gastam saldo), e o valor por faturar."""
    filtros = {"cliente": cliente}
    if acordo:
        filtros["acordo"] = acordo
    creditos = consumos = expirados = oferecidas = por_faturar = 0.0
    for m in frappe.get_all("Tempo Movimento", filters=filtros,
                            fields=["tipo", "horas", "valor", "oferta", "faturavel", "extrato"]):
        if m.tipo == "credito":
            creditos += m.horas
        elif m.tipo == "consumo":
            if m.oferta:
                oferecidas += -m.horas
            else:
                consumos += -m.horas
                if m.faturavel and not m.extrato:
                    por_faturar += m.valor or 0
        elif m.tipo == "expiracao":
            expirados += -m.horas
        elif m.tipo == "ajuste":
            creditos += m.horas
    return {
        "creditos": round(creditos, 2), "consumos": round(consumos, 2), "expirados": round(expirados, 2),
        "oferecidas": round(oferecidas, 2), "disponivel": round(creditos - consumos - expirados, 2),
        "por_faturar": round(por_faturar, 2),
    }


def movimentos(cliente: str, acordo: str | None = None, desde=None, ate=None) -> list[dict]:
    """O extrato: movimentos por ordem cronológica, com o saldo acumulado (como o do portal)."""
    filtros = {"cliente": cliente}
    if acordo:
        filtros["acordo"] = acordo
    linhas = frappe.get_all("Tempo Movimento", filters=filtros,
                            fields=["name", "data", "hora", "tipo", "horas", "minutos_reais", "valor", "faturavel",
                                    "oferta", "descricao", "bilhete", "tarefa", "acordo", "extrato", "timesheet",
                                    "utilizador"],
                            order_by="data asc, hora asc, creation asc")
    acumulado = 0.0
    for l in linhas:
        if not (l.tipo == "consumo" and l.oferta):
            acumulado += l.horas
        l["saldo_acumulado"] = round(acumulado, 4)
    if desde:
        linhas = [l for l in linhas if getdate(l.data) >= getdate(desde)]
    if ate:
        linhas = [l for l in linhas if getdate(l.data) <= getdate(ate)]
    return linhas
