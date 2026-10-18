"""Estudo do preço/hora — o motor, sem Frappe.

Vive à parte do resto por duas razões: testa-se sem bench (é a peça onde um erro
custa dinheiro ao freelancer), e é a mesma conta que a calculadora pública de
stratechna.com vai usar mais tarde (plano, D10).

A pergunta é sempre a mesma: **quanto tenho de faturar por ano para, depois das
despesas e dos impostos, ficar com o rendimento que quero?** A resposta resolve-se
em ordem à faturação F. Somar percentagens ao líquido dá um número errado, porque
os impostos incidem sobre F, não sobre o líquido.

Três resultados, sempre lado a lado:

* custo da estrutura/hora — despesas ÷ horas faturáveis;
* preço mínimo — F ÷ horas faturáveis (abaixo disto não se chega ao rendimento);
* preço recomendado — preço mínimo × (1 + margem).

Os parâmetros fiscais vêm de fora (tabela `Tempo Parametro Fiscal`, por país,
regime e ano) e chegam aqui num dicionário. Nenhum valor fiscal está escrito no
código: um valor errado corrige-se na tabela, não numa versão nova da app.
"""
from __future__ import annotations

import math

REGIMES = {
    "PT_IND": "Portugal — trabalhador independente (regime simplificado)",
    "PT_SOC": "Portugal — sociedade (unipessoal ou por quotas)",
    "ES_AUT": "Espanha — autónomo",
    "ES_SL": "Espanha — sociedad limitada",
    "OUTRO": "Outro país — taxa média",
}

# O que cada regime precisa da tabela. Serve para dizer ao utilizador o que falta,
# em vez de calcular com zeros sem avisar.
PARAMETROS_DO_REGIME = {
    "PT_IND": ("ss_taxa", "ss_base", "irs_coef", "irs_taxa_media"),
    "PT_SOC": ("tsu_entidade", "tsu_trabalhador", "irs_taxa_media", "irc_taxa"),
    "ES_AUT": ("cuota_mensal", "irpf_taxa_media"),
    "ES_SL": ("cuota_mensal", "irpf_taxa_media", "is_taxa"),
    "OUTRO": ("taxa_media",),
}

PERIODICIDADES = ("mensal", "anual", "amortizacao")


def _n(valor, omissao=0.0) -> float:
    try:
        return float(valor if valor not in (None, "") else omissao)
    except (TypeError, ValueError):
        return float(omissao)


def despesa_mensal(despesa: dict) -> float:
    """Uma linha de despesa em euros por mês.

    mensal → o valor; anual → ÷ 12; amortizacao → valor ÷ (anos × 12), para o
    portátil de 2.400 € que dura três anos pesar 66,67 € por mês e não 2.400 € no
    mês em que se compra.
    """
    valor = _n(despesa.get("valor"))
    periodicidade = despesa.get("periodicidade") or "mensal"
    if periodicidade == "anual":
        return valor / 12
    if periodicidade == "amortizacao":
        anos = _n(despesa.get("anos"), 1) or 1
        return valor / (anos * 12)
    return valor


def horas(dados: dict) -> dict:
    """Horas disponíveis e faturáveis num ano."""
    horas_semana = _n(dados.get("horas_semana"), 40)
    dias_semana = _n(dados.get("dias_semana"), 5) or 5
    horas_dia = horas_semana / dias_semana
    semanas = _n(dados.get("semanas_ano"), 52)
    dias_fora = sum(_n(dados.get(c)) for c in
                    ("dias_ferias", "dias_feriados", "dias_imprevistos", "dias_formacao"))
    disponiveis = max(semanas * horas_semana - dias_fora * horas_dia, 0.0)
    pct = min(max(_n(dados.get("pct_faturavel"), 60), 0.0), 100.0)
    return {
        "horas_dia": horas_dia,
        "horas_brutas": semanas * horas_semana,
        "horas_disponiveis": disponiveis,
        "horas_faturaveis": disponiveis * pct / 100,
    }


def _faturacao_minima(regime: str, liquido: float, despesas: float, p: dict) -> tuple[float, dict]:
    """F com lucro zero, e o que vai para onde. Devolve (F, encargos)."""
    if regime == "PT_IND":
        ss = 0.0 if _n(p.get("primeiro_ano")) else _n(p.get("ss_taxa")) * _n(p.get("ss_base"))
        irs = _n(p.get("irs_taxa_media")) * _n(p.get("irs_coef"))
        t = ss + irs
        if t >= 1:
            raise ValueError("os encargos somam 100 % ou mais da faturação")
        f = (liquido + despesas) / (1 - t)
        return f, {"seguranca_social": f * ss, "irs": f * irs}

    if regime == "PT_SOC":
        tsu_t = _n(p.get("tsu_trabalhador"))
        irs = _n(p.get("irs_taxa_media"))
        if tsu_t + irs >= 1:
            raise ValueError("os descontos do gerente somam 100 % ou mais")
        bruto = liquido / (1 - tsu_t - irs)
        tsu_e = bruto * _n(p.get("tsu_entidade"))
        f = despesas + bruto + tsu_e
        return f, {"tsu_entidade": tsu_e, "tsu_trabalhador": bruto * tsu_t, "irs": bruto * irs}

    if regime in ("ES_AUT", "ES_SL"):
        irpf = _n(p.get("irpf_taxa_media"))
        if irpf >= 1:
            raise ValueError("a taxa de IRPF é 100 % ou mais")
        cuota = _n(p.get("cuota_mensal")) * 12
        bruto = liquido / (1 - irpf)
        f = despesas + cuota + bruto
        return f, {"cuota_autonomos": cuota, "irpf": bruto - liquido}

    t = _n(p.get("taxa_media"))
    if t >= 1:
        raise ValueError("a taxa média é 100 % ou mais")
    f = (liquido + despesas) / (1 - t)
    return f, {"impostos": f * t}


def calcular(dados: dict, parametros: dict) -> dict:
    """O estudo inteiro. `dados` é o que o freelancer preenche; `parametros` vem da tabela."""
    regime = dados.get("regime") or "OUTRO"
    if regime not in REGIMES:
        raise ValueError(f"regime desconhecido: {regime}")

    avisos = []
    em_falta = [c for c in PARAMETROS_DO_REGIME[regime] if parametros.get(c) in (None, "")]
    if em_falta:
        avisos.append({"tipo": "parametros_em_falta", "campos": em_falta})

    linhas = dados.get("despesas") or []
    despesas_mes = sum(despesa_mensal(d) for d in linhas)
    despesas_ano = despesas_mes * 12
    meses = _n(dados.get("meses_rendimento"), 12) or 12
    liquido_ano = _n(dados.get("liquido_mensal")) * meses
    margem = max(_n(dados.get("margem"), 10), 0.0) / 100

    h = horas(dados)
    hf = h["horas_faturaveis"]

    f_min, encargos = _faturacao_minima(regime, liquido_ano, despesas_ano, parametros)
    f_rec = f_min * (1 + margem)
    lucro = f_rec - f_min
    resultado = {
        "regime": regime,
        "despesas_mensais": round(despesas_mes, 2),
        "despesas_anuais": round(despesas_ano, 2),
        "liquido_anual": round(liquido_ano, 2),
        **{k: round(v, 2) for k, v in h.items()},
        "encargos": {k: round(v, 2) for k, v in encargos.items()},
        "faturacao_minima": round(f_min, 2),
        "faturacao_recomendada": round(f_rec, 2),
        "lucro_antes_impostos": round(lucro, 2),
        "custo_estrutura_hora": None,
        "preco_minimo": None,
        "preco_recomendado": None,
        "avisos": avisos,
    }
    # Numa sociedade o lucro paga imposto sobre lucros. Mostra-se o que sobra,
    # para a margem não parecer maior do que é.
    if regime == "ES_SL":
        resultado["imposto_lucros"] = round(lucro * _n(parametros.get("is_taxa")), 2)
    elif regime == "PT_SOC":
        resultado["imposto_lucros"] = round(lucro * _n(parametros.get("irc_taxa")), 2)
    if "imposto_lucros" in resultado:
        resultado["lucro_depois_impostos"] = round(lucro - resultado["imposto_lucros"], 2)

    if hf <= 0:
        avisos.append({"tipo": "sem_horas_faturaveis"})
        return resultado
    resultado["custo_estrutura_hora"] = round(despesas_ano / hf, 2)
    resultado["preco_minimo"] = round(f_min / hf, 2)
    resultado["preco_recomendado"] = round(f_rec / hf, 2)
    iva = _n(parametros.get("iva_taxa"))
    if iva:
        resultado["iva_taxa"] = iva
        resultado["preco_recomendado_com_iva"] = round(f_rec / hf * (1 + iva), 2)
    if _n(dados.get("pct_faturavel"), 60) > 75:
        avisos.append({"tipo": "pct_faturavel_alta"})
    return resultado


def sensibilidade(dados: dict, parametros: dict,
                  percentagens=(40, 50, 60, 70, 80), horas_semana=(30, 35, 40, 45)) -> dict:
    """Preço recomendado em função da % faturável (linhas) e das horas por semana (colunas)."""
    linhas = []
    for pct in percentagens:
        linha = []
        for hs in horas_semana:
            r = calcular({**dados, "pct_faturavel": pct, "horas_semana": hs}, parametros)
            linha.append(r["preco_recomendado"])
        linhas.append({"pct_faturavel": pct, "precos": linha})
    return {"horas_semana": list(horas_semana), "linhas": linhas}


def verificar_packs(preco_hora: float, packs: list[dict], preco_minimo: float | None) -> list[dict]:
    """O preço/hora efetivo de cada pack e se fica abaixo do mínimo (a trava, D7 = avisar)."""
    saida = []
    for p in packs:
        h = _n(p.get("horas"))
        desconto = _n(p.get("desconto"))
        efetivo = preco_hora * (1 - desconto / 100)
        saida.append({
            **p,
            "preco_hora_efetivo": round(efetivo, 2),
            "total": round(efetivo * h, 2),
            "abaixo_minimo": bool(preco_minimo) and round(efetivo, 2) < round(preco_minimo, 2),
        })
    return saida


def desconto_maximo(preco_hora: float, preco_minimo: float) -> float:
    """O maior desconto (%) que ainda deixa o pack no preço mínimo ou acima."""
    if not preco_hora or not preco_minimo or preco_minimo >= preco_hora:
        return 0.0
    # para baixo, ao cêntimo de ponto: arredondar para cima deixava o pack abaixo do mínimo
    return math.floor((1 - preco_minimo / preco_hora) * 10000) / 100
