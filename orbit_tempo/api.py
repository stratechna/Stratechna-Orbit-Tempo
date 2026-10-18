"""API do lado Admin (o freelancer e a sua equipa) — a interface /tempo.

Tudo passa pelas permissões do Frappe e pelo requisito de subscrição (T3). As escritas são POST.
"""
from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_first_day, get_last_day, getdate, now_datetime, today

from orbit_tempo import calculo, cliente as cliente_mod, entrada, extratos, fiscal, livro, preco, requisitos
from orbit_tempo.instalar import PAPEL
from orbit_tempo.tempo.doctype.tempo_estudo_preco import tempo_estudo_preco as estudo_mod

PAPEIS_ADMIN = {PAPEL, "System Manager", "Projects User", "Projects Manager"}


def tem_acesso() -> bool:
    if frappe.session.user == "Guest":
        return False
    return bool(PAPEIS_ADMIN & set(frappe.get_roles()))


def exigir_acesso(escrita: bool = False) -> None:
    if not tem_acesso():
        frappe.throw(_("Sem acesso à app Tempo."), frappe.PermissionError)
    est = requisitos.estado()
    if not est["ok"]:
        frappe.throw(_("O Tempo precisa de {0} no seu Orbit.").format(", ".join(est["faltam"])), frappe.PermissionError)
    if escrita and est["so_leitura"]:
        frappe.throw(_("O Orbit está suspenso: o Tempo fica só de leitura até regularizar."), frappe.PermissionError)


def _json(v):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


# ── Arranque ─────────────────────────────────────────────────────────────────

@frappe.whitelist()
def arranque():
    if not tem_acesso():
        frappe.throw(_("Sem acesso à app Tempo."), frappe.PermissionError)
    d = livro.definicoes()
    est = requisitos.estado()
    base = {
        "modo": "admin", "utilizador": frappe.session.user, "nome": frappe.utils.get_fullname(frappe.session.user),
        "hoje": today(), "agora": str(now_datetime()), "subscricao": est,
        "marca": {"nome": d.nome_comercial, "logotipo": d.logotipo, "cor": d.cor},
        "definicoes": {k: d.get(k) for k in ("nome_comercial", "logotipo", "cor", "moeda", "pais", "regime",
                                             "arredondamento_bloco", "arredondamento_modo", "minimo_minutos",
                                             "preco_hora", "estudo_ativo", "alerta_saldo_horas",
                                             "dias_aprovacao_tacita", "aviso_validade_dias")},
        "regimes": preco.REGIMES,
        "helpdesk": bool(frappe.db.exists("DocType", "HD Ticket")),
    }
    if est["ok"]:
        base.update(acordos=_acordos())
    return base


def _acordos(cliente=None):
    filtros = {"cliente": cliente} if cliente else {}
    lista = frappe.get_all("Tempo Acordo", filters=filtros,
                           fields=["name", "titulo", "cliente", "cliente_nome", "tipo", "ativo", "cor", "preco_hora",
                                   "arredondamento_bloco", "arredondamento_modo", "minimo_minutos", "data_inicio",
                                   "data_fim", "horas_pack", "desconto_pack", "horas_mes", "valor_mensal",
                                   "regra_excedente", "projeto", "cotacao", "credito_lancado", "notas"],
                           order_by="cliente_nome asc, titulo asc")
    for a in lista:
        a["preco_efetivo"] = livro.regras_do_acordo(a.name)["preco_hora"]
    return lista


@frappe.whitelist()
def inicio():
    exigir_acesso()
    eu = frappe.session.user
    hoje = getdate(today())
    segunda = add_days(hoje, -hoje.weekday())

    def horas_desde(d):
        r = frappe.db.sql("""select coalesce(sum(minutos_reais), 0) from `tabTempo Movimento`
            where tipo = 'consumo' and utilizador = %s and data >= %s""", (eu, d))
        return round(flt(r[0][0]) / 60, 2)

    alerta = flt(livro.definicoes().alerta_saldo_horas) or 2
    a_acabar = []
    for a in frappe.get_all("Tempo Acordo", filters={"ativo": 1, "tipo": ["in", ["Pack", "Avença"]]},
                            fields=["name", "titulo", "cliente", "cliente_nome", "data_fim"]):
        s = livro.saldo(a.cliente, a.name)
        if s["disponivel"] < alerta:
            a_acabar.append({**a, "disponivel": s["disponivel"]})
    return {
        "horas_hoje": horas_desde(hoje), "horas_semana": horas_desde(segunda),
        "cronometros": cronometros(),
        "packs_a_acabar": a_acabar,
        "extratos_pendentes": frappe.get_all("Tempo Extrato", filters={"estado": ["in", ["Enviado", "Contestado"]]},
                                             fields=["name", "cliente", "estado", "desde", "ate", "enviado_em"]),
        "por_faturar": round(flt(frappe.db.sql("""select coalesce(sum(valor), 0) from `tabTempo Movimento`
            where tipo = 'consumo' and faturavel = 1 and oferta = 0 and ifnull(extrato, '') = ''""")[0][0]), 2),
    }


# ── Clientes ─────────────────────────────────────────────────────────────────

@frappe.whitelist()
def clientes(q=None):
    exigir_acesso()
    filtros = {"disabled": 0}
    if q:
        filtros["customer_name"] = ["like", f"%{q}%"]
    lista = frappe.get_all("Customer", filters=filtros, fields=["name", "customer_name", "language", "tax_id"],
                           order_by="customer_name asc", limit_page_length=500)
    com_acordo = set(frappe.get_all("Tempo Acordo", pluck="cliente", distinct=True))
    for c in lista:
        c["tem_acordo"] = c.name in com_acordo
        if c["tem_acordo"]:
            c["saldo"] = livro.saldo(c.name)
    return lista


def _pedidos(cliente):
    if not frappe.db.exists("DocType", "HD Ticket"):
        return []
    tempos = frappe.db.sql("""select bilhete, sum(-horas) as horas from `tabTempo Movimento`
        where cliente = %s and tipo = 'consumo' and ifnull(bilhete, '') != '' group by bilhete""", cliente, as_dict=True)
    por = {t.bilhete: t.horas for t in tempos}
    if not por:
        return []
    lista = frappe.get_all("HD Ticket", filters={"name": ["in", list(por)]},
                           fields=["name", "subject", "status", "opening_date"], order_by="opening_date desc")
    for b in lista:
        b["horas"] = round(por.get(str(b.name), 0), 2)
    return lista


@frappe.whitelist()
def ficha_cliente(cliente):
    exigir_acesso()
    c = frappe.get_doc("Customer", cliente)
    contactos = frappe.get_all("Dynamic Link", filters={"link_doctype": "Customer", "link_name": cliente,
                                                        "parenttype": "Contact"}, pluck="parent")
    lista_contactos = frappe.get_all("Contact", filters={"name": ["in", contactos or [""]]},
                                     fields=["name", "first_name", "last_name", "email_id", "phone", "user"])
    acordos = _acordos(cliente)
    for a in acordos:
        a["saldo"] = livro.saldo(cliente, a.name)
    projetos = frappe.get_all("Project", filters={"customer": cliente},
                              fields=["name", "project_name", "status", "percent_complete", "expected_end_date"],
                              order_by="modified desc")
    return {
        "cliente": {"name": c.name, "nome": c.customer_name, "nif": c.tax_id, "lingua": c.language,
                    "grupo": c.customer_group, "territorio": c.territory},
        "contactos": lista_contactos, "acordos": acordos, "projetos": projetos,
        "extratos": frappe.get_all("Tempo Extrato", filters={"cliente": cliente},
                                   fields=["name", "desde", "ate", "estado", "horas_consumidas", "valor", "fatura_numero"],
                                   order_by="ate desc"),
        "pedidos": _pedidos(cliente),
        "orcamentos": frappe.get_all("Quotation", filters={"party_name": cliente, "quotation_to": "Customer"},
                                     fields=["name", "transaction_date", "grand_total", "status", "docstatus"],
                                     order_by="transaction_date desc"),
    }


@frappe.whitelist(methods=["POST"])
def extrato_cliente(cliente, acordo=None, desde=None, ate=None):
    exigir_acesso()
    return {"saldo": livro.saldo(cliente, acordo), "movimentos": livro.movimentos(cliente, acordo, desde, ate)}


@frappe.whitelist(methods=["POST"])
def novo_cliente(dados):
    exigir_acesso(escrita=True)
    d = _json(dados) or {}
    nome = (d.get("nome") or "").strip()
    if len(nome) < 2:
        frappe.throw(_("Falta o nome do cliente."))
    c = frappe.get_doc({"doctype": "Customer", "customer_name": nome, "customer_type": d.get("tipo") or "Company",
                        "tax_id": d.get("nif") or None, "language": d.get("lingua") or None})
    c.insert()
    if d.get("email"):
        frappe.get_doc({"doctype": "Contact", "first_name": d.get("contacto") or nome,
                        "email_ids": [{"email_id": d["email"].strip().lower(), "is_primary": 1}],
                        "links": [{"link_doctype": "Customer", "link_name": c.name}]}).insert()
    return c.name


@frappe.whitelist(methods=["POST"])
def dar_acesso(contacto):
    exigir_acesso(escrita=True)
    return cliente_mod.dar_acesso(contacto)


# ── Acordos e packs ──────────────────────────────────────────────────────────

CAMPOS_ACORDO = ("titulo", "cliente", "tipo", "cor", "data_inicio", "data_fim", "notas", "arredondamento_modo",
                 "regra_excedente", "projeto")


@frappe.whitelist(methods=["POST"])
def guardar_acordo(dados):
    exigir_acesso(escrita=True)
    d = _json(dados) or {}
    doc = frappe.get_doc("Tempo Acordo", d["name"]) if d.get("name") else frappe.new_doc("Tempo Acordo")
    for c in CAMPOS_ACORDO:
        if c in d:
            doc.set(c, d[c] or None)
    for c in ("preco_hora", "horas_pack", "desconto_pack", "horas_mes", "valor_mensal"):
        if c in d:
            doc.set(c, flt(d[c]) if d[c] not in (None, "") else None)
    for c in ("arredondamento_bloco", "minimo_minutos"):
        if c in d:
            doc.set(c, str(cint(d[c])) if d[c] not in (None, "") else "")
    if "ativo" in d:
        doc.ativo = cint(d["ativo"])
    doc.save() if d.get("name") else doc.insert()
    return doc.name


@frappe.whitelist(methods=["POST"])
def creditar_pack(acordo):
    exigir_acesso(escrita=True)
    return livro.creditar_pack(acordo)


@frappe.whitelist()
def packs():
    exigir_acesso()
    return frappe.get_all("Tempo Pack", fields=["name", "titulo", "horas", "desconto", "validade_meses", "ativo",
                                                "preco_hora", "preco_total", "abaixo_minimo", "item"],
                          order_by="horas asc")


@frappe.whitelist(methods=["POST"])
def guardar_pack(dados):
    exigir_acesso(escrita=True)
    d = _json(dados) or {}
    doc = frappe.get_doc("Tempo Pack", d["name"]) if d.get("name") else frappe.new_doc("Tempo Pack")
    doc.titulo = d.get("titulo") or doc.titulo
    for c in ("horas", "desconto"):
        if c in d:
            doc.set(c, flt(d[c]))
    for c in ("validade_meses", "ativo"):
        if c in d:
            doc.set(c, cint(d[c]))
    doc.save() if d.get("name") else doc.insert()
    return doc.as_dict()


# ── Entrada de horas ─────────────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def registar_horas(dados):
    """O «Novo Registo» do portal. Consumo → Folha de horas; crédito/ajuste → direto no livro."""
    exigir_acesso(escrita=True)
    d = _json(dados) or {}
    tipo = d.get("tipo") or "consumo"
    try:
        horas = calculo.ler_horas(d.get("horas"))
    except ValueError:
        frappe.throw(_("Horas inválidas. Exemplos: 10.8 · 10,5 · 10H30m · 1H30M · 90m"))
    acordo = frappe.get_doc("Tempo Acordo", d.get("acordo"))
    if tipo == "consumo":
        inicio = None
        if d.get("data"):
            inicio = f"{d['data']} {d.get('hora') or '09:00'}:00"[:19]
        return entrada.registar(acordo.name, horas, inicio=inicio, descricao=d.get("descricao"),
                                bilhete=d.get("bilhete"), tarefa=d.get("tarefa"), faturavel=cint(d.get("faturavel", 1)))
    sinal = -1 if (tipo == "ajuste" and cint(d.get("negativo"))) else 1
    return {"movimento": livro.lancar_movimento(acordo.cliente, acordo.name, tipo, sinal * horas,
                                                d.get("descricao") or "", data=d.get("data") or today())}


@frappe.whitelist()
def registos(desde=None, ate=None, cliente=None):
    exigir_acesso()
    filtros = {"data": ["between", [getdate(desde or add_days(today(), -30)), getdate(ate or today())]]}
    if cliente:
        filtros["cliente"] = cliente
    lista = frappe.get_all("Tempo Movimento", filters=filtros,
                           fields=["name", "data", "hora", "tipo", "horas", "minutos_reais", "valor", "faturavel", "oferta",
                                   "descricao", "bilhete", "tarefa", "acordo", "cliente", "timesheet", "extrato", "utilizador"],
                           order_by="data desc, hora desc, creation desc", limit_page_length=1000)
    titulos = {a.name: (a.titulo, a.cliente_nome) for a in frappe.get_all("Tempo Acordo", fields=["name", "titulo", "cliente_nome"])}
    estados = {e.name: e.estado for e in frappe.get_all("Tempo Extrato", fields=["name", "estado"])}
    for l in lista:
        l["acordo_titulo"], l["cliente_nome"] = titulos.get(l.acordo, (l.acordo, l.cliente))
        l["trancado"] = bool(l.extrato) and estados.get(l.extrato) in livro.ESTADOS_TRANCADOS
    return lista


@frappe.whitelist(methods=["POST"])
def anular_registo(movimento):
    """Consumo: cancela a folha de horas. Crédito/ajuste: apaga o movimento. Nunca num extrato enviado."""
    exigir_acesso(escrita=True)
    m = frappe.get_doc("Tempo Movimento", movimento)
    if m.extrato and frappe.db.get_value("Tempo Extrato", m.extrato, "estado") in livro.ESTADOS_TRANCADOS:
        frappe.throw(_("Este registo já está num extrato enviado. Corrija com um ajuste."))
    if m.timesheet:
        ts = frappe.get_doc("Timesheet", m.timesheet)
        if ts.docstatus == 1:
            ts.cancel()
    else:
        m.delete(ignore_permissions=True)
    return True


@frappe.whitelist()
def bilhetes(q=None):
    exigir_acesso()
    if not frappe.db.exists("DocType", "HD Ticket"):
        return []
    filtros = {"status": ["not in", ["Closed"]]}
    if q:
        filtros["subject"] = ["like", f"%{q}%"]
    return frappe.get_all("HD Ticket", filters=filtros, fields=["name", "subject", "status", "customer"],
                          order_by="modified desc", limit_page_length=50)


@frappe.whitelist()
def tarefas(acordo=None, q=None):
    exigir_acesso()
    filtros = {"status": ["not in", ["Completed", "Cancelled"]]}
    if acordo:
        a = frappe.get_doc("Tempo Acordo", acordo)
        projetos = [a.projeto] if a.projeto else frappe.get_all("Project", filters={"customer": a.cliente}, pluck="name")
        filtros["project"] = ["in", projetos or [""]]
    if q:
        filtros["subject"] = ["like", f"%{q}%"]
    return frappe.get_all("Task", filters=filtros, fields=["name", "subject", "project", "status"],
                          order_by="modified desc", limit_page_length=50)


# ── Cronómetros ──────────────────────────────────────────────────────────────

@frappe.whitelist()
def cronometros():
    exigir_acesso()
    lista = frappe.get_all("Tempo Cronometro", filters={"utilizador": frappe.session.user},
                           fields=["name", "acordo", "inicio", "pausado_em", "segundos_pausa", "bilhete", "tarefa", "descricao"],
                           order_by="inicio asc")
    for c in lista:
        c["segundos"] = entrada.segundos(c)
    return lista


@frappe.whitelist(methods=["POST"])
def iniciar_cronometro(acordo, descricao=None, bilhete=None, tarefa=None):
    exigir_acesso(escrita=True)
    entrada.iniciar(acordo, descricao, bilhete, tarefa)
    return cronometros()


@frappe.whitelist(methods=["POST"])
def pausar_cronometro(nome):
    exigir_acesso(escrita=True)
    entrada.pausar(nome)
    return cronometros()


@frappe.whitelist(methods=["POST"])
def retomar_cronometro(nome):
    exigir_acesso(escrita=True)
    entrada.retomar(nome)
    return cronometros()


@frappe.whitelist(methods=["POST"])
def parar_cronometro(nome, descricao=None, faturavel=1):
    exigir_acesso(escrita=True)
    entrada.parar(nome, descricao, cint(faturavel))
    return cronometros()


@frappe.whitelist(methods=["POST"])
def descartar_cronometro(nome):
    exigir_acesso(escrita=True)
    entrada.descartar(nome)
    return cronometros()


# ── Extratos ─────────────────────────────────────────────────────────────────

@frappe.whitelist()
def lista_extratos(estado=None):
    exigir_acesso()
    filtros = {"estado": estado} if estado else {}
    return frappe.get_all("Tempo Extrato", filters=filtros,
                          fields=["name", "cliente", "acordo", "desde", "ate", "estado", "horas_consumidas", "horas_oferta",
                                  "valor", "enviado_em", "aprovado_em", "aprovacao_tacita", "fatura_numero"],
                          order_by="ate desc", limit_page_length=500)


@frappe.whitelist(methods=["POST"])
def fechar_extrato(cliente, mes=None, desde=None, ate=None, acordo=None):
    exigir_acesso(escrita=True)
    if mes:
        base = getdate(f"{mes}-01")
        desde, ate = get_first_day(base), get_last_day(base)
    return extratos.fechar(cliente, desde, ate, acordo or None)


@frappe.whitelist(methods=["POST"])
def enviar_extrato(nome):
    exigir_acesso(escrita=True)
    extratos.enviar(nome)
    return True


@frappe.whitelist(methods=["POST"])
def registar_fatura(nome, numero, pdf=None):
    exigir_acesso(escrita=True)
    extratos.registar_fatura(nome, numero, pdf)
    return True


# ── Estudo do preço/hora ─────────────────────────────────────────────────────

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
    exigir_acesso()
    dados = _json(dados) or {}
    ano = cint(dados.get("ano")) or getdate().year
    try:
        r = estudo_mod.calcular(dados, ano, dados.get("parametros_json"))
    except ValueError as e:
        return {"erro": str(e)}
    pk = _json(dados.get("packs")) or []
    if pk and r.get("preco_recomendado"):
        r["packs"] = preco.verificar_packs(r["preco_recomendado"], pk, r["preco_minimo"])
        r["desconto_maximo"] = preco.desconto_maximo(r["preco_recomendado"], r["preco_minimo"])
    return r


@frappe.whitelist(methods=["POST"])
def guardar_estudo(dados, usar=0):
    exigir_acesso(escrita=True)
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


# ── Definições ───────────────────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def guardar_definicoes(dados):
    exigir_acesso(escrita=True)
    dados = _json(dados) or {}
    d = frappe.get_doc("Tempo Definicoes")
    for c in ("nome_comercial", "cor", "moeda", "pais", "regime", "arredondamento_modo"):
        if c in dados:
            d.set(c, dados[c] or None)
    for c in ("arredondamento_bloco", "minimo_minutos", "dias_aprovacao_tacita", "aviso_validade_dias"):
        if c in dados:
            d.set(c, cint(dados[c]))
    for c in ("preco_hora", "alerta_saldo_horas"):
        if c in dados:
            d.set(c, flt(dados[c]))
    d.save()
    return arranque()["definicoes"]
