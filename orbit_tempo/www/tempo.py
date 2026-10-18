"""A página /tempo: entrega o arranque e a língua; o resto é a interface (tempo.js)."""
import json

import frappe
from frappe.translate import get_parent_language, get_translations_from_csv

from orbit_tempo import __version__

no_cache = 1


def traducoes(lang: str) -> dict:
    """Só as traduções desta app — a interface é escrita em português e cada frase
    traduz-se pelo csv da própria app, sem passar pelas traduções globais do site
    (onde «Data», por exemplo, é «Dados» em inglês de outras apps)."""
    saida = {}
    pai = get_parent_language(lang) if lang else None
    for l in [x for x in (pai, lang) if x and x != "pt" and not x.startswith("pt-")]:
        try:
            saida.update(get_translations_from_csv(l, "orbit_tempo") or {})
        except Exception:
            pass
    return saida


def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login?redirect-to=/tempo"
        redirect = frappe.Redirect()
        redirect.http_status_code = 302
        raise redirect
    from orbit_tempo.api import tem_acesso
    if not tem_acesso():
        frappe.throw(frappe._("Sem acesso à app Tempo."), frappe.PermissionError)
    lang = frappe.local.lang or "pt"
    context.no_cache = 1
    context.lang = lang
    context.versao = __version__
    context.boot = json.dumps({
        "csrf_token": frappe.sessions.get_csrf_token(),
        "lang": lang,
        "versao": __version__,
        "traducoes": traducoes(lang),
    }, ensure_ascii=False)
    frappe.db.commit()  # o csrf_token novo grava-se na sessão
    return context
