"""Gancho before_tests: o run-tests só corre o before_tests da app que se testa, e o Tempo precisa do
ERPNext preparado (empresa, grupos de clientes, listas de preços). No ERPNext v16 esses dados nascem
ao importar erpnext.tests.utils (BootStrapTestData) — o mesmo que os testes do próprio ERPNext usam."""
import frappe


def antes_dos_testes():
    if not frappe.get_all("Company", limit=1):
        import erpnext.tests.utils  # noqa: F401 — cria «_Test Company» e os dados mestres
        frappe.db.commit()
    from orbit_tempo import instalar
    instalar.garantir()
