"""O que as duas páginas (/tempo e /cliente) entregam à interface: modo, língua, traduções, csrf."""
import json

import frappe
from frappe.translate import get_parent_language, get_translations_from_csv

from orbit_tempo import __version__


def traducoes(lang: str) -> dict:
    """Só as traduções desta app — a interface escreve-se em português e traduz-se pelo csv da
    própria app, sem passar pelas traduções globais do site (onde «Data» é «Dados» noutras apps)."""
    saida = {}
    pai = get_parent_language(lang) if lang else None
    for l in [x for x in (pai, lang) if x and x != "pt" and not x.startswith("pt-")]:
        try:
            saida.update(get_translations_from_csv(l, "orbit_tempo") or {})
        except Exception:
            pass
    return saida


def _marca():
    d = frappe.get_cached_doc("Tempo Definicoes")
    return {"nome": d.nome_comercial, "logotipo": d.logotipo, "cor": d.cor}


def contexto(context, modo: str):
    from orbit_tempo import api, cliente
    user = frappe.session.user
    if modo == "admin":
        if user == "Guest":
            frappe.local.flags.redirect_location = "/login?redirect-to=/tempo"
            r = frappe.Redirect()
            r.http_status_code = 302
            raise r
        if not api.tem_acesso():
            # um cliente que caia em /tempo vai para a sua área
            frappe.local.flags.redirect_location = "/cliente"
            r = frappe.Redirect()
            r.http_status_code = 302
            raise r
    elif user == "Guest" or not cliente.clientes_do_utilizador(user):
        modo = "entrar"
    lang = frappe.local.lang or "pt"
    boot = {"csrf_token": frappe.sessions.get_csrf_token() if user != "Guest" else "", "lang": lang, "modo": modo,
            "versao": __version__, "traducoes": traducoes(lang), "marca": _marca(),
            "expirada": bool(frappe.form_dict.get("expirada"))}
    context.no_cache = 1
    context.lang = lang
    context.versao = __version__
    context.boot = json.dumps(boot, ensure_ascii=False).replace("</", "<\\/")
    if user != "Guest":
        frappe.db.commit()  # o csrf_token novo grava-se na sessão
    return context
