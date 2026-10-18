"""API da interface /tempo.

Tudo passa pelas permissões normais do Frappe (papel «Tempo Utilizador» ou
System Manager): estes métodos só juntam o que o ecrã precisa num pedido e dão
nomes claros às acções. As escritas são POST.
"""
from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_first_day, get_last_day, getdate, now_datetime, today

from orbit_tempo import fiscal, livro, preco
from orbit_tempo.instalar import PAPEL
from orbit_tempo.tempo.doctype.tempo_estudo_preco import tempo_estudo_preco as estudo_mod

CAMPOS_REGISTO = ["name", "acordo", "cliente", "data", "descricao", "inicio", "fim", "em_curso",
                  "duracao_minutos", "minutos_faturados", "faturavel", "oferta", "preco_hora", "valor"]


def exigir_acesso() -> None:
    if frappe.session.user == "Guest":
        raise frappe.PermissionError
    papeis = set(frappe.get_roles())
    if not ({PAPEL, "System Manager"} & papeis):
        frappe.throw(_("Sem acesso à app Tempo."), frappe.PermissionError)


def _json(v):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


# ── arranque ─────────────────────────────────────────────────────────────────

@frappe.whitelist()
def arranque():
    exigir_acesso()
    d = livro.definicoes()
    return {
        "utilizador": frappe.session.user,
        "nome": frappe.utils.get_fullname(frappe.session.user),
        "hoje": today(),
        "agora": str(now_datetime()),
        "definicoes": {
            "nome_comercial": d.nome_comercial, "logotipo": d.logotipo, "cor": d.cor,
            "moeda": d.moeda or "EUR", "pais": d.pais, "regime": d.regime,
            "arredondamento_bloco": d.arredondamento_bloco, "arredondamento_modo": d.arredondamento_modo,
            "minimo_minutos": d.minimo_minutos, "preco_hora": d.preco_hora, "estudo_ativo": d.estudo_ativo,
        },
        "regimes": preco.REGIMES,
        "cronometro": cronometro(),
        **dados(),
    }


@frappe.whitelist()
def dados():
    exigir_acesso()
    clientes = frappe.get_all("Tempo Cliente", fields=["name", "nome_cliente", "nif", "email", "telefone",
                                                       "idioma", "ativo", "notas"], order_by="nome_cliente asc")
    acordos = frappe.get_all("Tempo Acordo", fields=["name", "titulo", "cliente", "tipo", "ativo", "cor",
                                                     "preco_hora", "arredondamento_bloco", "arredondamento_modo",
                                                     "minimo_minutos", "data_inicio", "data_fim", "notas"],
                             order_by="titulo asc")
    for a in acordos:
        a["preco_efetivo"] = livro.regras_do_acordo(a.name)["preco_hora"]
    return {"clientes": clientes, "acordos": acordos}


# ── cronómetro ───────────────────────────────────────────────────────────────

@frappe.whitelist()
def cronometro():
    exigir_acesso()
    r = frappe.get_all("Tempo Registo", filters={"em_curso": 1, "utilizador": frappe.session.user},
                       fields=CAMPOS_REGISTO, limit=1)
    return r[0] if r else None


@frappe.whitelist(methods=["POST"])
def iniciar(acordo, descricao=None):
    exigir_acesso()
    # Iniciar com outro a correr pára o anterior — é o que se espera de um cronómetro.
    actual = cronometro()
    if actual:
        parar(actual["name"])
    doc = frappe.get_doc({
        "doctype": "Tempo Registo", "acordo": acordo, "descricao": descricao or "",
        "em_curso": 1, "inicio": now_datetime(), "data": today(), "utilizador": frappe.session.user,
    }).insert()
    return _registo(doc.name)


@frappe.whitelist(methods=["POST"])
def parar(registo, descricao=None):
    exigir_acesso()
    doc = frappe.get_doc("Tempo Registo", registo)
    if not doc.em_curso:
        return _registo(doc.name)
    doc.em_curso = 0
    doc.fim = now_datetime()
    if descricao is not None:
        doc.descricao = descricao
    doc.save()
    return _registo(doc.name)


@frappe.whitelist(methods=["POST"])
def descartar(registo):
    exigir_acesso()
    doc = frappe.get_doc("Tempo Registo", registo)
    if not doc.em_curso:
        frappe.throw(_("Só se descarta um cronómetro a correr."))
    doc.delete()
    return True


# ── registos ─────────────────────────────────────────────────────────────────

@frappe.whitelist()
def registos(desde=None, ate=None, cliente=None):
    exigir_acesso()
    desde = getdate(desde or add_days(today(), -6))
    ate = getdate(ate or today())
    filtros = {"data": ["between", [desde, ate]], "em_curso": 0}
    if cliente:
        filtros["cliente"] = cliente
    return frappe.get_all("Tempo Registo", filters=filtros, fields=CAMPOS_REGISTO,
                          order_by="data desc, inicio desc, creation desc", limit_page_length=2000)


@frappe.whitelist(methods=["POST"])
def guardar_registo(dados):
    """Cria ou altera um registo manual. `minutos` ou (`inicio`, `fim`)."""
    exigir_acesso()
    dados = _json(dados) or {}
    nome = dados.get("name")
    doc = frappe.get_doc("Tempo Registo", nome) if nome else frappe.new_doc("Tempo Registo")
    if doc.get("em_curso") and nome:
        frappe.throw(_("Pare o cronómetro antes de editar o registo."))
    for campo in ("acordo", "data", "descricao"):
        if campo in dados:
            doc.set(campo, dados[campo])
    for campo in ("faturavel", "oferta"):
        if campo in dados:
            doc.set(campo, cint(dados[campo]))
    if dados.get("inicio") and dados.get("fim"):
        doc.inicio, doc.fim = dados["inicio"], dados["fim"]
    elif "minutos" in dados:
        doc.inicio = doc.fim = None
        doc.duracao_minutos = flt(dados["minutos"])
    if not doc.data:
        doc.data = today()
    doc.save() if nome else doc.insert()
    return _registo(doc.name)


@frappe.whitelist(methods=["POST"])
def apagar_registo(registo):
    exigir_acesso()
    frappe.get_doc("Tempo Registo", registo).delete()
    return True


def _registo(nome):
    return frappe.get_all("Tempo Registo", filters={"name": nome}, fields=CAMPOS_REGISTO)[0]


# ── resumo ───────────────────────────────────────────────────────────────────

@frappe.whitelist()
def resumo(mes=None):
    """Por acordo no mês (AAAA-MM), mais o saldo do livro de cada cliente."""
    exigir_acesso()
    base = getdate(f"{mes}-01") if mes else getdate(today())
    desde, ate = get_first_day(base), get_last_day(base)
    linhas = livro.resumo(desde, ate)
    clientes = sorted({l.cliente for l in linhas})
    return {
        "desde": str(desde), "ate": str(ate), "linhas": linhas,
        "saldos": {c: livro.saldo(c) for c in clientes},
    }


# ── clientes e acordos ───────────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def guardar_cliente(dados):
    exigir_acesso()
    dados = _json(dados) or {}
    doc = frappe.get_doc("Tempo Cliente", dados["name"]) if dados.get("name") else frappe.new_doc("Tempo Cliente")
    for c in ("nome_cliente", "nif", "email", "telefone", "idioma", "notas"):
        if c in dados:
            doc.set(c, dados[c] or None)
    if "ativo" in dados:
        doc.ativo = cint(dados["ativo"])
    doc.save() if dados.get("name") else doc.insert()
    return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def guardar_acordo(dados):
    exigir_acesso()
    dados = _json(dados) or {}
    doc = frappe.get_doc("Tempo Acordo", dados["name"]) if dados.get("name") else frappe.new_doc("Tempo Acordo")
    for c in ("titulo", "cliente", "tipo", "cor", "data_inicio", "data_fim", "notas", "arredondamento_modo"):
        if c in dados:
            doc.set(c, dados[c] or None)
    for c in ("preco_hora",):
        if c in dados:
            doc.set(c, flt(dados[c]) if dados[c] not in (None, "") else None)
    for c in ("arredondamento_bloco", "minimo_minutos"):
        if c in dados:
            doc.set(c, cint(dados[c]) if dados[c] not in (None, "") else None)
    if "ativo" in dados:
        doc.ativo = cint(dados["ativo"])
    doc.save() if dados.get("name") else doc.insert()
    return doc.as_dict()


# ── estudo do preço/hora ─────────────────────────────────────────────────────

@frappe.whitelist()
def estudos():
    exigir_acesso()
    return frappe.get_all("Tempo Estudo Preco",
                          fields=["name", "titulo", "ano", "regime", "ativo", "preco_minimo", "preco_recomendado", "modified"],
                          order_by="ativo desc, modified desc")


@frappe.whitelist()
def estudo(nome):
    exigir_acesso()
    doc = frappe.get_doc("Tempo Estudo Preco", nome)
    d = estudo_mod.dados_do_estudo(doc)
    d.update({"name": doc.name, "titulo": doc.titulo, "ano": doc.ano, "pais": doc.pais,
              "ativo": doc.ativo, "parametros_json": fiscal.proprios(doc.parametros_json)})
    return d


@frappe.whitelist(methods=["POST"])
def calcular_estudo(dados):
    """Calcula sem gravar — o ecrã chama isto a cada alteração."""
    exigir_acesso()
    dados = _json(dados) or {}
    ano = cint(dados.get("ano")) or getdate().year
    try:
        r = estudo_mod.calcular(dados, ano, dados.get("parametros_json"))
    except ValueError as e:
        return {"erro": str(e)}
    packs = _json(dados.get("packs")) or []
    if packs and r.get("preco_recomendado"):
        r["packs"] = preco.verificar_packs(r["preco_recomendado"], packs, r["preco_minimo"])
        r["desconto_maximo"] = preco.desconto_maximo(r["preco_recomendado"], r["preco_minimo"])
    return r


@frappe.whitelist(methods=["POST"])
def guardar_estudo(dados, usar=0):
    exigir_acesso()
    dados = _json(dados) or {}
    nome = dados.get("name")
    doc = frappe.get_doc("Tempo Estudo Preco", nome) if nome else frappe.new_doc("Tempo Estudo Preco")
    for c in ("titulo", "ano", "pais", *estudo_mod.CAMPOS):
        if c in dados:
            doc.set(c, dados[c])
    if not doc.titulo:
        doc.titulo = _("Estudo de {0}").format(doc.ano or getdate().year)
    doc.parametros_json = json.dumps(fiscal.proprios(dados.get("parametros_json"))) if dados.get("parametros_json") else None
    if "despesas" in dados:
        doc.set("despesas", [])
        for l in dados["despesas"] or []:
            if not l.get("descricao") and not flt(l.get("valor")):
                continue
            doc.append("despesas", {k: l.get(k) for k in ("categoria", "descricao", "valor", "periodicidade", "anos")})
    if cint(usar):
        doc.ativo = 1
    doc.save() if nome else doc.insert()
    return estudo(doc.name)


@frappe.whitelist()
def parametros_fiscais(regime, ano=None):
    exigir_acesso()
    return fiscal.parametros(regime, cint(ano) or getdate().year)


# ── definições ───────────────────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def guardar_definicoes(dados):
    exigir_acesso()
    dados = _json(dados) or {}
    d = frappe.get_doc("Tempo Definicoes")
    for c in ("nome_comercial", "cor", "moeda", "pais", "regime", "arredondamento_modo"):
        if c in dados:
            d.set(c, dados[c] or None)
    for c in ("arredondamento_bloco", "minimo_minutos"):
        if c in dados:
            d.set(c, cint(dados[c]))
    if "preco_hora" in dados:
        d.preco_hora = flt(dados["preco_hora"])
    d.save()
    return arranque()["definicoes"]


def tem_acesso() -> bool:
    """Para o ecrã de apps: mostra o Tempo a quem o pode usar."""
    if frappe.session.user == "Guest":
        return False
    return bool({PAPEL, "System Manager"} & set(frappe.get_roles()))
