"""Estudo do preço/hora. A conta é do `orbit_tempo.preco`; aqui só se junta o que
o freelancer preencheu aos parâmetros fiscais do ano e se guarda o resultado."""
import json

import frappe
from frappe import _
from frappe.model.document import Document

from orbit_tempo import fiscal, preco

CAMPOS = ("regime", "liquido_mensal", "meses_rendimento", "horas_semana", "dias_semana",
          "dias_ferias", "dias_feriados", "dias_imprevistos", "dias_formacao", "pct_faturavel", "margem")


def dados_do_estudo(doc) -> dict:
    d = {c: doc.get(c) for c in CAMPOS}
    d["despesas"] = [{"categoria": l.categoria, "descricao": l.descricao, "valor": l.valor,
                      "periodicidade": l.periodicidade, "anos": l.anos} for l in doc.get("despesas") or []]
    return d


def calcular(dados: dict, ano: int, parametros_proprios=None) -> dict:
    tabela = fiscal.parametros(dados.get("regime") or "OUTRO", ano)
    valores = {**tabela["valores"], **fiscal.proprios(parametros_proprios)}
    resultado = preco.calcular(dados, valores)
    resultado["sensibilidade"] = preco.sensibilidade(dados, valores)
    resultado["parametros"] = {
        "ano_pedido": ano,
        "ano_usado": tabela["ano_usado"],
        "validados": tabela["validados"],
        "linhas": tabela["linhas"],
        "proprios": fiscal.proprios(parametros_proprios),
    }
    return resultado


class TempoEstudoPreco(Document):
    def validate(self):
        if not self.ano:
            self.ano = frappe.utils.getdate().year
        try:
            r = calcular(dados_do_estudo(self), self.ano, self.parametros_json)
        except ValueError as e:
            frappe.throw(_("O estudo não fecha: {0}").format(str(e)))
        self.custo_estrutura_hora = r["custo_estrutura_hora"]
        self.preco_minimo = r["preco_minimo"]
        self.preco_recomendado = r["preco_recomendado"]
        self.resultado_json = json.dumps(r, ensure_ascii=False, default=str)

    def on_update(self):
        if self.ativo:
            usar(self)


def usar(doc) -> None:
    """Este estudo passa a dar o preço/hora por omissão (e os outros deixam de estar em uso)."""
    if not doc.preco_recomendado:
        frappe.throw(_("O estudo ainda não tem preço recomendado."))
    frappe.db.sql("update `tabTempo Estudo Preco` set ativo = 0 where name != %s", doc.name)
    if not doc.ativo:
        doc.db_set("ativo", 1, update_modified=False)
    d = frappe.get_doc("Tempo Definicoes")
    d.preco_hora = doc.preco_recomendado
    d.estudo_ativo = doc.name
    d.regime = doc.regime
    d.pais = doc.pais
    d.save(ignore_permissions=True)
    from orbit_tempo import precos
    precos.sincronizar()
