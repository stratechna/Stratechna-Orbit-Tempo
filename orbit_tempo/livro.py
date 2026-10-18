"""O livro de horas do freelancer (`Tempo Movimento`).

Mesma semântica do `entrada_tempo` do portal da Stratechna, que está em uso há
meses com clientes reais:

* `credito`   horas que o cliente comprou (pack) ou a que tem direito (avença) — positivas;
* `consumo`   trabalho feito — negativas;
* `expiracao` horas de um pack que caducaram — negativas;
* `ajuste`    correcção manual, com descrição.

O freelancer nunca escreve no livro directamente: anota `Tempo Registo` e o livro
segue-o. Um registo = no máximo um movimento de consumo. Assim o tempo que vier
do Desk ou do ERP (F5) entra pelo mesmo caminho sem se anotar duas vezes.
"""
from __future__ import annotations

import frappe
from frappe import _

from orbit_tempo import calculo


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


def cobra_valor(registo, regras) -> bool:
    return bool(registo.faturavel) and not registo.oferta and regras["tipo"] != "Preço fixo"


def bloqueado(registo) -> bool:
    """Um registo que já entrou num extrato enviado não muda em silêncio."""
    if not registo.get("movimento"):
        return False
    return bool(frappe.db.get_value("Tempo Movimento", registo.movimento, "extrato"))


def sincronizar(registo) -> None:
    """Põe o movimento de consumo de acordo com o registo (cria, actualiza ou apaga)."""
    nome = registo.get("movimento")
    if registo.em_curso or not registo.minutos_faturados:
        if nome and frappe.db.exists("Tempo Movimento", nome):
            frappe.delete_doc("Tempo Movimento", nome, ignore_permissions=True, force=True)
            registo.db_set("movimento", None, update_modified=False)
        return

    valores = {
        "cliente": registo.cliente,
        "acordo": registo.acordo,
        "data": registo.data,
        "tipo": "consumo",
        "horas": -calculo.horas(registo.minutos_faturados),
        "valor": registo.valor or 0,
        "faturavel": registo.faturavel,
        "oferta": registo.oferta,
        "registo": registo.name,
        "descricao": registo.descricao,
    }
    if nome and frappe.db.exists("Tempo Movimento", nome):
        mov = frappe.get_doc("Tempo Movimento", nome)
        mov.update(valores)
        mov.save(ignore_permissions=True)
    else:
        mov = frappe.get_doc({"doctype": "Tempo Movimento", **valores})
        mov.insert(ignore_permissions=True)
        registo.db_set("movimento", mov.name, update_modified=False)


def apagar_movimento(registo) -> None:
    if bloqueado(registo):
        frappe.throw(_("Este registo já está num extrato e não pode ser apagado."))
    if registo.get("movimento") and frappe.db.exists("Tempo Movimento", registo.movimento):
        frappe.delete_doc("Tempo Movimento", registo.movimento, ignore_permissions=True, force=True)


def resumo(desde, ate) -> list[dict]:
    """Por acordo, no período: horas reais, horas a cobrar, ofertas e valor por faturar."""
    linhas = frappe.db.sql(
        """
        select r.acordo, a.titulo, a.tipo, a.cor, r.cliente, c.nome_cliente,
               sum(r.duracao_minutos) as minutos_reais,
               sum(case when r.faturavel = 1 and r.oferta = 0 then r.minutos_faturados else 0 end) as minutos_cobrar,
               sum(case when r.oferta = 1 then r.minutos_faturados else 0 end) as minutos_oferta,
               sum(r.valor) as valor,
               count(*) as registos
        from `tabTempo Registo` r
        join `tabTempo Acordo` a on a.name = r.acordo
        join `tabTempo Cliente` c on c.name = r.cliente
        where r.em_curso = 0 and r.data between %(desde)s and %(ate)s
        group by r.acordo, a.titulo, a.tipo, a.cor, r.cliente, c.nome_cliente
        order by c.nome_cliente, a.titulo
        """,
        {"desde": desde, "ate": ate},
        as_dict=True,
    )
    for l in linhas:
        for k in ("minutos_reais", "minutos_cobrar", "minutos_oferta", "valor"):
            l[k] = float(l[k] or 0)
    return linhas


def saldo(cliente: str, acordo: str | None = None) -> dict:
    """Saldo do livro: créditos − consumos − expirações (as ofertas não gastam saldo)."""
    filtros = {"cliente": cliente}
    if acordo:
        filtros["acordo"] = acordo
    creditos = consumos = expirados = 0.0
    por_faturar = 0.0
    for m in frappe.get_all("Tempo Movimento", filters=filtros,
                            fields=["tipo", "horas", "valor", "oferta", "faturavel", "extrato"]):
        if m.tipo == "credito":
            creditos += m.horas
        elif m.tipo == "consumo":
            if not m.oferta:
                consumos += -m.horas
            if m.faturavel and not m.oferta and not m.extrato:
                por_faturar += m.valor or 0
        elif m.tipo == "expiracao":
            expirados += -m.horas
        elif m.tipo == "ajuste":
            creditos += m.horas
    return {
        "creditos": round(creditos, 2),
        "consumos": round(consumos, 2),
        "expirados": round(expirados, 2),
        "disponivel": round(creditos - consumos - expirados, 2),
        "por_faturar": round(por_faturar, 2),
    }
