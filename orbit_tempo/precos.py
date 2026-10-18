"""Preços nos orçamentos e o orçamento aceite → acordo (passo 4 da versão 2).

* «Hora» e cada pack do catálogo são artigos do ERP (serviço, sem stock), com o preço na
  lista de venda — o da hora vem do estudo do preço/hora em uso; o do pack, da hora com o
  desconto do pack. Assim a Edna faz o orçamento com os artigos de sempre do ERPNext.
* Orçamento aceite = encomenda de cliente (Sales Order) feita a partir dele. Ao submeter a
  encomenda, cada linha «Hora» ou «Pack» dá um acordo e o cliente fica com um projeto.
  O crédito do pack entra quando o pack estiver pago (T6) — à mão, no Admin.
"""
from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_months, cint, flt, getdate, today

from orbit_tempo import livro

ITEM_HORA = "TEMPO-HORA"


def _lista_venda() -> str | None:
    lista = frappe.db.get_single_value("Selling Settings", "selling_price_list") or "Standard Selling"
    return lista if frappe.db.exists("Price List", lista) else None


def _grupo() -> str:
    for g in ("Services", "Serviços", "All Item Groups"):
        if frappe.db.exists("Item Group", g):
            return g
    return frappe.get_all("Item Group", pluck="name", limit=1)[0]


def _uom_hora() -> str:
    for u in ("Hour", "Hora"):
        if frappe.db.exists("UOM", u):
            return u
    return "Nos"


def _item(codigo: str, nome: str, descricao: str, uom: str | None = None) -> str | None:
    if not frappe.db.exists("DocType", "Item") or not frappe.get_all("Item Group", limit=1):
        return None
    if not frappe.db.exists("Item", codigo):
        frappe.get_doc({"doctype": "Item", "item_code": codigo, "item_name": nome[:140], "description": descricao,
                        "item_group": _grupo(), "stock_uom": uom or "Nos", "is_stock_item": 0,
                        "include_item_in_manufacturing": 0, "is_sales_item": 1}).insert(ignore_permissions=True)
    else:
        frappe.db.set_value("Item", codigo, {"item_name": nome[:140], "description": descricao, "disabled": 0})
    return codigo


def _preco(item: str, valor: float) -> None:
    lista = _lista_venda()
    if not lista or not item:
        return
    nome = frappe.db.get_value("Item Price", {"item_code": item, "price_list": lista})
    if nome:
        frappe.db.set_value("Item Price", nome, "price_list_rate", flt(valor))
    else:
        frappe.get_doc({"doctype": "Item Price", "item_code": item, "price_list": lista,
                        "price_list_rate": flt(valor)}).insert(ignore_permissions=True)


def sincronizar() -> None:
    """A hora e todos os packs com o preço/hora por omissão atual."""
    d = livro.definicoes()
    if flt(d.preco_hora):
        item = _item(ITEM_HORA, _("Hora de serviço"), _("Hora de serviço, cobrada pelo tempo registado."), _uom_hora())
        if item:
            _preco(item, d.preco_hora)
            if d.item_hora != item:
                frappe.db.set_single_value("Tempo Definicoes", "item_hora", item)
    for p in frappe.get_all("Tempo Pack", pluck="name"):
        doc = frappe.get_doc("Tempo Pack", p)
        doc.save(ignore_permissions=True)


def calcular_pack(doc) -> None:
    """Tempo Pack.validate: preço efetivo, total, trava do mínimo e o artigo do ERP."""
    d = livro.definicoes()
    base = flt(d.preco_hora)
    doc.preco_hora = round(base * (1 - flt(doc.desconto) / 100), 2)
    doc.preco_total = round(doc.preco_hora * flt(doc.horas), 2)
    minimo = flt(frappe.db.get_value("Tempo Estudo Preco", d.estudo_ativo, "preco_minimo")) if d.estudo_ativo else 0
    doc.abaixo_minimo = 1 if minimo and doc.preco_hora < minimo else 0
    if doc.name and not doc.is_new():
        codigo = f"TEMPO-{doc.name}"
        descricao = _("Pack de {0} horas, válido {1} meses.").format(flt(doc.horas), cint(doc.validade_meses) or 12)
        doc.item = _item(codigo, doc.titulo, descricao)
        if doc.item:
            _preco(doc.item, doc.preco_total)


def encomenda_submetida(doc, method=None):
    """Sales Order.on_submit: as linhas «Hora» e «Pack» dão acordos; o cliente fica com um projeto."""
    item_hora = livro.definicoes().item_hora or ITEM_HORA
    packs = {p.item: p for p in frappe.get_all("Tempo Pack", filters={"item": ["is", "set"]},
                                               fields=["name", "item", "titulo", "horas", "desconto", "validade_meses"])}
    linhas = [l for l in doc.items if l.item_code == item_hora or l.item_code in packs]
    if not linhas:
        return
    orcamento = next((l.prevdoc_docname for l in doc.items if l.get("prevdoc_docname")), None)
    projeto = _projeto(doc)
    for l in linhas:
        base = {"doctype": "Tempo Acordo", "cliente": doc.customer, "projeto": projeto, "cotacao": orcamento,
                "data_inicio": doc.transaction_date or today(), "ativo": 1}
        if l.item_code == item_hora:
            if frappe.db.exists("Tempo Acordo", {"cliente": doc.customer, "tipo": "Hora", "cotacao": orcamento or "-"}):
                continue
            frappe.get_doc({**base, "titulo": l.item_name or _("Serviço à hora"), "tipo": "Hora",
                            "preco_hora": flt(l.rate)}).insert(ignore_permissions=True)
        else:
            p = packs[l.item_code]
            for _i in range(max(cint(l.qty), 1)):
                frappe.get_doc({**base, "titulo": p.titulo, "tipo": "Pack", "horas_pack": p.horas,
                                "desconto_pack": p.desconto,
                                "preco_hora": round(flt(l.rate) / flt(p.horas), 2) if flt(p.horas) else None,
                                "data_fim": add_months(getdate(doc.transaction_date or today()), cint(p.validade_meses) or 12),
                                }).insert(ignore_permissions=True)


def _projeto(doc) -> str | None:
    if not frappe.db.exists("DocType", "Project"):
        return None
    existente = frappe.db.get_value("Project", {"sales_order": doc.name})
    if existente:
        return existente
    nome_cliente = frappe.db.get_value("Customer", doc.customer, "customer_name") or doc.customer
    p = frappe.get_doc({"doctype": "Project", "project_name": f"{nome_cliente} — {doc.name}",
                        "customer": doc.customer, "sales_order": doc.name, "company": doc.company,
                        "expected_start_date": doc.transaction_date})
    p.insert(ignore_permissions=True)
    return p.name


def aceitar_orcamento(orcamento: str, por: str) -> str:
    """O cliente aceita no portal: encomenda feita a partir do orçamento, submetida."""
    from erpnext.selling.doctype.quotation.quotation import make_sales_order
    q = frappe.get_doc("Quotation", orcamento)
    if q.docstatus != 1 or q.status in ("Ordered", "Lost", "Expired", "Cancelled"):
        frappe.throw(_("Este orçamento já não pode ser aceite."))
    so = make_sales_order(orcamento)
    so.delivery_date = so.delivery_date or today()
    for l in so.items:
        l.delivery_date = l.delivery_date or so.delivery_date
    so.flags.ignore_permissions = True
    so.insert()
    so.add_comment("Comment", _("Orçamento aceite no portal do cliente por {0}.").format(por))
    so.submit()
    return so.name
