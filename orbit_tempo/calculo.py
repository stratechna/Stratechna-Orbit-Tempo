"""Contas do registo de tempo, sem Frappe: arredondamento e valor.

O freelancer mede o tempo real (cronómetro ou manual) e o acordo diz como esse
tempo se cobra: ao minuto, em blocos de 6, 15 ou 30 minutos, para cima ou ao mais
próximo, com um mínimo por intervenção. A duração real fica sempre guardada ao
lado da faturada — o cliente final pode ver as duas.
"""
from __future__ import annotations

import math

MODOS = ("cima", "proximo")


def minutos_faturados(duracao: float, bloco: int = 15, modo: str = "cima", minimo: int = 0) -> int:
    """Minutos a cobrar a partir dos minutos reais.

    `bloco` 0 ou 1 = ao minuto (arredonda o segundo para cima). Uma duração zero
    fica zero, mesmo com mínimo: um registo vazio não é uma intervenção.
    """
    duracao = max(float(duracao or 0), 0.0)
    if duracao == 0:
        return 0
    bloco = int(bloco or 0)
    if bloco <= 1:
        resultado = math.ceil(duracao - 1e-9)
    elif modo == "proximo":
        # meio bloco arredonda para cima, como na escola
        resultado = int(math.floor(duracao / bloco + 0.5)) * bloco
        resultado = max(resultado, bloco)  # 3 minutos ao mais próximo de 15 não pode dar zero
    else:
        resultado = math.ceil(duracao / bloco - 1e-9) * bloco
    return max(resultado, int(minimo or 0))


def valor(minutos: float, preco_hora: float) -> float:
    return round((minutos or 0) / 60 * (preco_hora or 0), 2)


def horas(minutos: float) -> float:
    return round((minutos or 0) / 60, 4)


def ler_horas(texto) -> float:
    """Horas escritas como no portal: «10.8», «10,5», «10H30m», «1H30M», «90m», «1:30».

    Um número simples é em horas (como no «Novo Registo» do portal). Devolve horas
    decimais; ValueError se não se perceber.
    """
    import re
    t = str(texto or "").strip().lower().replace(" ", "").replace(",", ".")
    if not t:
        raise ValueError("vazio")
    m = re.fullmatch(r"(\d+(?:\.\d+)?)", t)
    if m:
        return float(m.group(1))
    m = re.fullmatch(r"(\d+):(\d{1,2})", t)
    if m:
        return int(m.group(1)) + int(m.group(2)) / 60
    m = re.fullmatch(r"(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?:in)?)?", t)
    if m and (m.group(1) or m.group(2)):
        return float(m.group(1) or 0) + float(m.group(2) or 0) / 60
    raise ValueError(f"não percebo «{texto}»")
