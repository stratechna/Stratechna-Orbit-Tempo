import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from orbit_tempo import precos


class TempoPack(Document):
    def validate(self):
        if flt(self.horas) <= 0:
            frappe.throw(_("O pack tem de ter horas."))
        if not 0 <= flt(self.desconto) < 100:
            frappe.throw(_("O desconto vai de 0 a 99 %."))
        precos.calcular_pack(self)

    def after_insert(self):
        # o artigo do ERP leva o nome do pack, que só existe depois de inserir
        self.save(ignore_permissions=True)
