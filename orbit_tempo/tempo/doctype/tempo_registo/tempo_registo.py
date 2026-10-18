"""Um registo de tempo: cronómetro ou manual.

A duração real fica sempre guardada; os minutos a cobrar saem das regras do
acordo (arredondamento, mínimo) e o valor do preço/hora do acordo ou das
Definições. O preço fica gravado no registo: mudar o preço do acordo amanhã não
muda o valor do trabalho de ontem.
"""
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime, getdate, time_diff_in_seconds

from orbit_tempo import calculo, livro

# Campos que mudam o que se cobra: depois de o registo entrar num extrato, só por correcção.
CAMPOS_COBRANCA = ("acordo", "data", "duracao_minutos", "inicio", "fim", "faturavel", "oferta")


class TempoRegisto(Document):
    def validate(self):
        if not self.utilizador:
            self.utilizador = frappe.session.user
        self._verificar_bloqueio()
        self._verificar_cronometro()
        self._duracao()
        self._cobranca()

    def on_update(self):
        livro.sincronizar(self)

    def on_trash(self):
        livro.apagar_movimento(self)

    def _verificar_bloqueio(self):
        if self.is_new() or not livro.bloqueado(self):
            return
        antes = self.get_doc_before_save()
        if antes and any(str(antes.get(c) or "") != str(self.get(c) or "") for c in CAMPOS_COBRANCA):
            frappe.throw(_("Este registo já está num extrato. Corrija com um registo de ajuste."))

    def _verificar_cronometro(self):
        if not self.em_curso:
            return
        outro = frappe.db.get_value("Tempo Registo",
                                    {"em_curso": 1, "utilizador": self.utilizador, "name": ["!=", self.name or ""]})
        if outro:
            frappe.throw(_("Já há um cronómetro a correr ({0}). Pare-o primeiro.").format(outro))
        if not self.inicio:
            self.inicio = frappe.utils.now_datetime()
        self.fim = None

    def _duracao(self):
        if self.em_curso:
            self.duracao_minutos = 0
            return
        if self.inicio and self.fim:
            segundos = time_diff_in_seconds(get_datetime(self.fim), get_datetime(self.inicio))
            if segundos < 0:
                frappe.throw(_("O fim é anterior ao início."))
            self.duracao_minutos = round(segundos / 60, 2)
            if not self.data:
                self.data = getdate(self.inicio)
        if (self.duracao_minutos or 0) < 0:
            frappe.throw(_("A duração não pode ser negativa."))
        if (self.duracao_minutos or 0) > 24 * 60:
            frappe.throw(_("Um registo não pode passar de 24 horas."))

    def _cobranca(self):
        regras = livro.regras_do_acordo(self.acordo)
        if self.em_curso:
            self.minutos_faturados = 0
            self.valor = 0
            return
        self.minutos_faturados = calculo.minutos_faturados(
            self.duracao_minutos, regras["bloco"], regras["modo"], regras["minimo"])
        # O preço fica o que estava quando se registou; só se escolhe de novo se o acordo mudou.
        antes = None if self.is_new() else self.get_doc_before_save()
        if not self.preco_hora or (antes and antes.acordo != self.acordo):
            self.preco_hora = regras["preco_hora"]
        self.valor = calculo.valor(self.minutos_faturados, self.preco_hora) if livro.cobra_valor(self, regras) else 0
