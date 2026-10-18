"""O lado Cliente: os clientes do freelancer, no portal do cliente do tenant (decisão T4).

Entram como utilizadores do site (Website User, papel «Customer» do ERPNext), ligados ao
cliente pelo Contacto — o mesmo mecanismo do portal do ERPNext. Não contam como
utilizadores do Orbit. Entram por ligação no email (válida 30 min, uma só vez) ou com
palavra-passe própria. Nunca com uma conta Stratechna.
"""
from __future__ import annotations

import secrets

import frappe
from frappe import _
from frappe.utils import cint, get_url, getdate, today, validate_email_address

from orbit_tempo import avisos, extratos, livro

PAPEL_CLIENTE = "Customer"
VALIDADE_LIGACAO = 30 * 60


# ── Quem é o cliente desta sessão ────────────────────────────────────────────

def clientes_do_utilizador(user: str | None = None) -> list[str]:
    user = user or frappe.session.user
    if user in ("Guest", None):
        return []
    contactos = frappe.get_all("Contact", filters={"user": user}, pluck="name")
    if not contactos:
        return []
    return list(dict.fromkeys(frappe.get_all(
        "Dynamic Link", filters={"parenttype": "Contact", "parent": ["in", contactos], "link_doctype": "Customer"},
        pluck="link_name")))


def cliente_atual(cliente: str | None = None) -> str:
    meus = clientes_do_utilizador()
    if not meus:
        raise frappe.PermissionError(_("Esta conta não está ligada a nenhum cliente."))
    if cliente:
        if cliente not in meus:
            raise frappe.PermissionError
        return cliente
    return meus[0]


# ── Acesso: o Admin dá, o cliente entra ──────────────────────────────────────

def dar_acesso(contacto: str) -> str:
    """Cria (ou reativa) o utilizador do site para um contacto do cliente. Devolve o email."""
    c = frappe.get_doc("Contact", contacto)
    email = (c.email_id or "").strip().lower()
    if not email or not validate_email_address(email):
        frappe.throw(_("O contacto não tem um email válido."))
    if not any(l.link_doctype == "Customer" for l in c.links):
        frappe.throw(_("O contacto não está ligado a um cliente."))
    if frappe.db.exists("User", email):
        u = frappe.get_doc("User", email)
        if u.user_type == "System User":
            frappe.throw(_("{0} já é utilizador do Orbit: não pode ser também cliente.").format(email))
        u.enabled = 1
    else:
        u = frappe.get_doc({"doctype": "User", "email": email, "first_name": c.first_name or email.split("@")[0],
                            "last_name": c.last_name, "user_type": "Website User", "send_welcome_email": 0})
    lang = None
    for l in c.links:
        if l.link_doctype == "Customer":
            lang = frappe.db.get_value("Customer", l.link_name, "language")
    if lang:
        u.language = lang
    u.flags.ignore_permissions = True
    u.save() if not u.is_new() else u.insert()
    if PAPEL_CLIENTE not in [r.role for r in u.roles]:
        u.add_roles(PAPEL_CLIENTE)
    # gravar o campo e não o documento: criar o utilizador já mexeu no contacto (TimestampMismatch)
    if frappe.db.get_value("Contact", contacto, "user") != email:
        frappe.db.set_value("Contact", contacto, "user", email)
    return email


@frappe.whitelist(allow_guest=True, methods=["POST"])
def pedir_ligacao(email):
    """Envia a ligação de entrada. Responde sempre o mesmo, exista ou não a conta (não se revela quem é cliente)."""
    email = (email or "").strip().lower()
    chave_limite = f"tempo:ligacao:{email}"
    if frappe.cache.get_value(chave_limite):
        return {"ok": True}
    frappe.cache.set_value(chave_limite, 1, expires_in_sec=60)
    if email and frappe.db.exists("User", {"name": email, "enabled": 1, "user_type": "Website User"}) \
            and clientes_do_utilizador(email):
        chave = secrets.token_urlsafe(32)
        frappe.cache.set_value(f"tempo:entrada:{chave}", email, expires_in_sec=VALIDADE_LIGACAO)
        avisos.ligacao_de_entrada(email, get_url(f"/api/method/orbit_tempo.cliente.entrar?chave={chave}"))
    return {"ok": True}


@frappe.whitelist(allow_guest=True, methods=["GET"])
def entrar(chave):
    email = frappe.cache.get_value(f"tempo:entrada:{chave}") if chave else None
    frappe.cache.delete_value(f"tempo:entrada:{chave}")
    destino = "/cliente"
    if not email or not frappe.db.get_value("User", email, "enabled"):
        destino = "/cliente/entrar?expirada=1"
    else:
        frappe.local.login_manager.login_as(email)
    frappe.local.response["type"] = "redirect"
    frappe.local.response["location"] = destino


# ── O que o cliente vê ───────────────────────────────────────────────────────

def _acordos(cliente):
    return frappe.get_all("Tempo Acordo", filters={"cliente": cliente},
                          fields=["name", "titulo", "tipo", "ativo", "horas_pack", "data_inicio", "data_fim", "cor"],
                          order_by="ativo desc, titulo asc")


@frappe.whitelist()
def arranque():
    cliente = cliente_atual()
    d = livro.definicoes()
    return {
        "modo": "cliente", "utilizador": frappe.session.user, "nome": frappe.utils.get_fullname(frappe.session.user),
        "clientes": [{"name": c, "nome": frappe.db.get_value("Customer", c, "customer_name")} for c in clientes_do_utilizador()],
        "cliente": cliente, "marca": {"nome": d.nome_comercial, "logotipo": d.logotipo, "cor": d.cor},
        "moeda": d.moeda or "EUR", "alerta_saldo_horas": d.alerta_saldo_horas or 2,
    }


@frappe.whitelist()
def extrato(cliente=None, acordo=None, desde=None, ate=None):
    """Igual ao «Extrato de Horas» do portal: separadores por acordo, saldos e movimentos."""
    cliente = cliente_atual(cliente)
    acordos = [a for a in _acordos(cliente) if a.tipo != "Preço fixo"]
    if not acordo and acordos:
        acordo = acordos[0].name
    if acordo and acordo not in [a.name for a in acordos]:
        raise frappe.PermissionError
    linhas = livro.movimentos(cliente, acordo, desde, ate) if acordo else []
    # o cliente não precisa de saber quem da equipa registou, nem a folha interna
    for l in linhas:
        l.pop("utilizador", None)
        l.pop("timesheet", None)
    return {"acordos": acordos, "acordo": acordo, "saldo": livro.saldo(cliente, acordo) if acordo else None,
            "movimentos": linhas}


@frappe.whitelist()
def packs(cliente=None):
    cliente = cliente_atual(cliente)
    ativos = []
    for a in _acordos(cliente):
        if a.tipo == "Pack":
            a["saldo"] = livro.saldo(cliente, a.name)
            ativos.append(a)
    catalogo = frappe.get_all("Tempo Pack", filters={"ativo": 1},
                              fields=["name", "titulo", "horas", "desconto", "validade_meses", "preco_total", "preco_hora"],
                              order_by="horas asc")
    return {"packs": ativos, "catalogo": catalogo}


@frappe.whitelist()
def aprovacoes(cliente=None):
    cliente = cliente_atual(cliente)
    lista = frappe.get_all("Tempo Extrato", filters={"cliente": cliente, "estado": ["!=", "Rascunho"]},
                           fields=["name", "desde", "ate", "estado", "horas_consumidas", "horas_oferta", "valor",
                                   "enviado_em", "aprovado_em", "aprovacao_tacita", "fatura_numero", "fatura_pdf"],
                           order_by="ate desc")
    for e in lista:
        e["linhas"] = frappe.get_all("Tempo Movimento", filters={"extrato": e.name},
                                     fields=["name", "data", "tipo", "horas", "oferta", "descricao", "bilhete"],
                                     order_by="data asc, hora asc")
        e["contestacoes"] = frappe.get_all("Tempo Extrato Contestacao", filters={"parent": e.name},
                                           fields=["movimento", "motivo", "resposta"])
    return lista


@frappe.whitelist(methods=["POST"])
def aprovar(extrato):
    _do_meu_cliente(extrato)
    extratos.aprovar(extrato, frappe.session.user)
    return True


@frappe.whitelist(methods=["POST"])
def contestar(extrato, movimento, motivo):
    _do_meu_cliente(extrato)
    extratos.contestar(extrato, movimento, motivo)
    return True


def _do_meu_cliente(extrato):
    if frappe.db.get_value("Tempo Extrato", extrato, "cliente") not in clientes_do_utilizador():
        raise frappe.PermissionError


@frappe.whitelist()
def pedidos(cliente=None):
    """Os bilhetes do Desk em que se registou tempo para este cliente, com o tempo de cada um."""
    cliente = cliente_atual(cliente)
    if not frappe.db.exists("DocType", "HD Ticket"):
        return []
    tempos = frappe.db.sql("""select bilhete, sum(-horas) as horas from `tabTempo Movimento`
        where cliente = %s and tipo = 'consumo' and ifnull(bilhete, '') != '' group by bilhete""", cliente, as_dict=True)
    if not tempos:
        return []
    por = {t.bilhete: t.horas for t in tempos}
    bilhetes = frappe.get_all("HD Ticket", filters={"name": ["in", list(por)]},
                              fields=["name", "subject", "status", "opening_date", "resolution_date"],
                              order_by="opening_date desc", ignore_permissions=True)
    for b in bilhetes:
        b["horas"] = round(por.get(str(b.name), 0), 2)
    return bilhetes


@frappe.whitelist(methods=["POST"])
def aceitar_orcamento(orcamento):
    from orbit_tempo import precos
    q = frappe.db.get_value("Quotation", orcamento, ["party_name", "quotation_to"], as_dict=True)
    if not q or q.quotation_to != "Customer" or q.party_name not in clientes_do_utilizador():
        raise frappe.PermissionError
    return precos.aceitar_orcamento(orcamento, frappe.session.user)


@frappe.whitelist()
def documentos(cliente=None):
    cliente = cliente_atual(cliente)
    orcamentos = frappe.get_all("Quotation", filters={"party_name": cliente, "quotation_to": "Customer", "docstatus": 1},
                                fields=["name", "transaction_date", "valid_till", "grand_total", "currency", "status"],
                                order_by="transaction_date desc", ignore_permissions=True)
    faturas = frappe.get_all("Tempo Extrato", filters={"cliente": cliente, "estado": "Faturado"},
                             fields=["name", "ate", "fatura_numero", "fatura_pdf", "valor"], order_by="ate desc")
    return {"orcamentos": orcamentos, "faturas": faturas}
