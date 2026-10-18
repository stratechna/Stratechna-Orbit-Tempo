"""Verificação da página /tempo no GitHub: bench --site X execute orbit_tempo.testes.verificar_pagina.correr"""
import frappe


def correr():
    frappe.set_user("Administrator")
    from frappe.website.serve import get_response
    r = get_response("tempo")
    html = r.get_data(as_text=True)
    assert r.status_code == 200, (r.status_code, html[:400])
    assert "TEMPO_BOOT" in html and "tempo.js" in html, html[:400]
    # as rotas por dentro também caem na mesma página
    r = get_response("tempo/semana")
    assert r.status_code == 200, r.status_code
    print("página /tempo: ok")
