"""Requisito de subscrição (decisão T3): o Tempo só trabalha com o Orbit completo ou com
CRM + Desk + Projects. Sem isso, o ecrã «não subscrito» (como as apps a cinzento do Orbit).

A fonte é a mesma do ecrã de apps do Orbit: `orbit_apps` no site_config, escrito pelo
aprovisionamento a partir das subscrições (ausente ou «completo» = tudo).
"""
from __future__ import annotations

import frappe

NECESSARIAS = ("crm", "desk", "projects")
NOMES = {"crm": "CRM", "desk": "Desk", "projects": "Projects"}
PORTAL = "https://portal.stratechna.com/orbit"


def activas() -> set[str] | None:
    """As apps subscritas, ou None para «todas» (Orbit completo ou site sem a informação)."""
    valor = frappe.conf.get("orbit_apps")
    if not valor or valor == "completo":
        return None
    if isinstance(valor, str):
        valor = [p.strip() for p in valor.split(",")]
    return set(valor)


def estado() -> dict:
    a = activas()
    faltam = [] if a is None else [x for x in NECESSARIAS if x not in a]
    return {"ok": not faltam, "faltam": [NOMES[x] for x in faltam], "portal": PORTAL,
            "so_leitura": bool(frappe.conf.get("orbit_suspenso"))}
