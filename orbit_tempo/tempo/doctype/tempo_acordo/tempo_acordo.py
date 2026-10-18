import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class TempoAcordo(Document):
    def validate(self):
        if (self.preco_hora or 0) < 0:
            frappe.throw(_("O preço/hora não pode ser negativo."))
        if self.data_inicio and self.data_fim and getdate(self.data_fim) < getdate(self.data_inicio):
            frappe.throw(_("A data de fim é anterior à de início."))
