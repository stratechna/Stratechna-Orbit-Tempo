"""Gancho before_tests: o run-tests só corre o before_tests da app que se testa, e o Tempo precisa do
ERPNext preparado (empresa, grupos de clientes, listas de preços) — o mesmo que o ERPNext usa nos seus."""
import frappe


def antes_dos_testes():
    if not frappe.get_all("Company", limit=1):
        from erpnext.setup.utils import before_tests
        before_tests()
    from orbit_tempo import instalar
    instalar.garantir()
