import frappe
from frappe.model.document import Document


class TempoDefinicoes(Document):
    def on_update(self):
        # o preço/hora por omissão é o da hora e dos packs nos orçamentos
        if self.has_value_changed("preco_hora"):
            from orbit_tempo import precos
            precos.sincronizar()
