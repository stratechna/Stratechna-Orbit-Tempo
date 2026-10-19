"""Dados de demonstração do Stratechna Tempo no tenant VELA (vela.orbit.stratechna.com).

Fictícios, como o resto do VELA (vela_dados.py): para mostrar e experimentar o Tempo sem tocar em
clientes reais. Idempotente — só semeia as folhas de horas na primeira vez. Emails silenciados.

Uso (Apps02, dentro do contentor, a partir de sites/):
    ../env/bin/python /tmp/vela_tempo_dados.py
A palavra-passe do cliente de demonstração vai para stdout numa linha «SEGREDO:», que o guião de fora
grava em /opt/orbit/segredos/tempo-cliente-vela.txt (600) e não mostra.
"""
import random
import secrets

import frappe
from frappe.utils import add_days, add_months, add_to_date, get_first_day, get_last_day, getdate, now_datetime, nowdate

SITE = "vela.orbit.stratechna.com"
frappe.init(site=SITE)
frappe.connect()
frappe.flags.mute_emails = True
frappe.set_user("Administrator")
random.seed(19)

from orbit_tempo import api, cliente as cli, entrada, extratos, instalar, livro  # noqa: E402

HOJE = getdate(nowdate())
DONO = "demo-vela@stratechna.com"
EMAIL_CLIENTE = "marta.silva@hotelmarazul.example.com"
log = []

instalar.garantir()

# ── quem usa o Tempo ─────────────────────────────────────────────────────────
for u in (DONO, "it@stratechna.pt", "visitante@vela.stratechna.com"):
    if frappe.db.exists("User", u):
        doc = frappe.get_doc("User", u)
        if instalar.PAPEL not in [r.role for r in doc.roles]:
            doc.add_roles(instalar.PAPEL)
            log.append(f"papel Tempo Utilizador: {u}")

# ── definições e estudo do preço/hora (sociedade portuguesa) ────────────────
d = frappe.get_doc("Tempo Definicoes")
d.nome_comercial = d.nome_comercial or "VELA Atelier"
d.pais, d.regime = "PT", "PT_SOC"
d.arredondamento_bloco, d.arredondamento_modo = 15, "cima"
d.save(ignore_permissions=True)

if not frappe.db.exists("Tempo Estudo Preco", {"titulo": "Estudo VELA 2026"}):
    api.guardar_estudo({
        "titulo": "Estudo VELA 2026", "ano": 2026, "pais": "PT", "regime": "PT_SOC",
        "despesas": [
            {"categoria": "Contabilidade", "descricao": "Contabilista certificado", "valor": 150, "periodicidade": "mensal"},
            {"categoria": "Espaço", "descricao": "Atelier (renda)", "valor": 450, "periodicidade": "mensal"},
            {"categoria": "Software", "descricao": "Software e assinaturas", "valor": 120, "periodicidade": "mensal"},
            {"categoria": "Comunicações", "descricao": "Telemóveis e internet", "valor": 70, "periodicidade": "mensal"},
            {"categoria": "Seguros", "descricao": "Responsabilidade civil", "valor": 380, "periodicidade": "anual"},
            {"categoria": "Equipamento", "descricao": "Computadores e ecrãs", "valor": 4800, "periodicidade": "amortizacao", "anos": 4},
            {"categoria": "Deslocações", "descricao": "Deslocações a clientes", "valor": 160, "periodicidade": "mensal"},
            {"categoria": "Marketing", "descricao": "Site e redes", "valor": 90, "periodicidade": "mensal"},
        ],
        "liquido_mensal": 1600, "meses_rendimento": "14", "horas_semana": 40, "dias_semana": 5,
        "dias_ferias": 22, "dias_feriados": 13, "dias_imprevistos": 5, "dias_formacao": 5,
        "pct_faturavel": 62, "margem": 12,
    }, usar=1)
    log.append("estudo do preço/hora (em uso)")
preco = frappe.db.get_single_value("Tempo Definicoes", "preco_hora")

# ── packs à venda ────────────────────────────────────────────────────────────
for titulo, horas, desconto in (("Pack 10 horas", 10, 5), ("Pack 20 horas", 20, 8), ("Pack 40 horas", 40, 12)):
    if not frappe.db.exists("Tempo Pack", {"titulo": titulo}):
        frappe.get_doc({"doctype": "Tempo Pack", "titulo": titulo, "horas": horas, "desconto": desconto,
                        "validade_meses": 12}).insert(ignore_permissions=True)
        log.append(f"pack {titulo}")


# ── acordos ──────────────────────────────────────────────────────────────────
def acordo(cliente, titulo, **kw):
    if not frappe.db.exists("Customer", cliente):
        print("  sem cliente", cliente)
        return None
    nome = frappe.db.get_value("Tempo Acordo", {"cliente": cliente, "titulo": titulo})
    if nome:
        return nome
    a = frappe.get_doc({"doctype": "Tempo Acordo", "cliente": cliente, "titulo": titulo, "ativo": 1, **kw})
    a.insert(ignore_permissions=True)
    log.append(f"acordo {cliente} · {titulo}")
    return a.name


inicio_mes_passado = get_first_day(add_months(HOJE, -1))
A = {
    "hotel": acordo("Hotel Mar Azul", "Comunicação e reservas", tipo="Pack", horas_pack=20, desconto_pack=8,
                    data_inicio=inicio_mes_passado, data_fim=add_months(inicio_mes_passado, 12), cor="#1f6f8b"),
    "livraria": acordo("Livraria Sete Ventos", "Montras e eventos", tipo="Hora", cor="#8a5a2b"),
    "restaurante": acordo("Restaurante Ponte Velha", "Gestão das redes", tipo="Avença", horas_mes=8, valor_mensal=380,
                          data_inicio=inicio_mes_passado, cor="#6b8e23"),
    "surf": acordo("Escola de Surf Atlântica", "Site novo (preço fechado)", tipo="Preço fixo", cor="#5b5ea6"),
}
A = {k: v for k, v in A.items() if v}

if A.get("hotel") and not frappe.db.get_value("Tempo Acordo", A["hotel"], "credito_lancado"):
    livro.creditar_pack(A["hotel"])
    log.append("crédito do pack do Hotel Mar Azul")
if A.get("restaurante") and not frappe.db.exists("Tempo Movimento", {"acordo": A["restaurante"], "tipo": "credito"}):
    for mes in (inicio_mes_passado, get_first_day(HOJE)):
        livro.lancar_movimento("Restaurante Ponte Velha", A["restaurante"], "credito", 8,
                               f"Avença de {frappe.format(mes, {'fieldtype': 'Date'})[3:]}", data=mes)
    log.append("créditos da avença")

# ── folhas de horas das últimas semanas (só na primeira vez) ────────────────
TRABALHOS = {
    "hotel": ["Textos da página de reservas", "Fotografias dos quartos — seleção", "Campanha de inverno", "Resposta a pedidos de grupos",
              "Revisão da ficha no Google", "Newsletter de outubro"],
    "livraria": ["Montra de outono", "Apresentação do livro de Sofia Almeida", "Cartazes do clube de leitura", "Reunião com o editor"],
    "restaurante": ["Publicações da semana", "Fotografias do menu de outono", "Resposta a avaliações", "Plano do mês"],
    "surf": ["Estrutura do site", "Páginas de cursos", "Galeria e vídeos", "Formulário de marcação"],
}
bilhetes = frappe.get_all("HD Ticket", pluck="name", limit=3) if frappe.db.exists("DocType", "HD Ticket") else []
if not frappe.db.exists("Timesheet", {"tempo_acordo": ["in", list(A.values())]}):
    quem = DONO if frappe.db.exists("User", DONO) else "Administrator"
    dia = add_days(HOJE, -30)
    n = 0
    while dia <= HOJE:
        if dia.weekday() < 5:
            for chave in random.sample(list(A), k=random.choice([1, 2, 2, 3])):
                horas = random.choice([0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3])
                inicio = f"{dia} {random.choice(['09', '10', '11', '14', '15', '16'])}:{random.choice(['00', '15', '30'])}:00"
                try:
                    entrada.registar(A[chave], horas + random.choice([0, 0.05, 0.1]), inicio=inicio,
                                     descricao=random.choice(TRABALHOS[chave]),
                                     bilhete=bilhetes[0] if (chave == "hotel" and bilhetes and random.random() < 0.2) else None,
                                     faturavel=0 if random.random() < 0.08 else 1, utilizador=quem)
                    n += 1
                except Exception as e:  # noqa: BLE001
                    print("  folha falhou:", str(e)[:160])
        dia = add_days(dia, 1)
    log.append(f"{n} folhas de horas")

# ── extratos do mês passado ─────────────────────────────────────────────────
desde, ate = inicio_mes_passado, get_last_day(inicio_mes_passado)
for cliente, estado in (("Livraria Sete Ventos", "Faturado"), ("Hotel Mar Azul", "Enviado")):
    if frappe.db.exists("Tempo Extrato", {"cliente": cliente, "desde": desde, "ate": ate}):
        continue
    if not frappe.db.exists("Tempo Movimento", {"cliente": cliente, "data": ["between", [desde, ate]]}):
        continue
    nome = extratos.fechar(cliente, desde, ate)
    extratos.enviar(nome)
    if estado == "Faturado":
        extratos.aprovar(nome, "maria@livrariaseteventos.example.com")
        extratos.registar_fatura(nome, "FT VELA/2026/118")
    log.append(f"extrato {cliente}: {estado}")

# ── um cronómetro a correr ──────────────────────────────────────────────────
if A.get("hotel") and frappe.db.exists("User", DONO) and not frappe.db.exists("Tempo Cronometro", {"utilizador": DONO}):
    frappe.get_doc({"doctype": "Tempo Cronometro", "utilizador": DONO, "acordo": A["hotel"],
                    "inicio": add_to_date(now_datetime(), minutes=-25), "descricao": "Preparação da campanha de Natal"}
                   ).insert(ignore_permissions=True)
    log.append("cronómetro a correr")

# ── o cliente do Hotel Mar Azul com acesso ao portal do cliente ─────────────
segredo = None
contacto = frappe.db.get_value("Contact Email", {"email_id": EMAIL_CLIENTE}, "parent")
if not contacto and frappe.db.exists("Customer", "Hotel Mar Azul"):
    contacto = frappe.get_doc({"doctype": "Contact", "first_name": "Marta", "last_name": "Silva",
                               "email_ids": [{"email_id": EMAIL_CLIENTE, "is_primary": 1}],
                               "links": [{"link_doctype": "Customer", "link_name": "Hotel Mar Azul"}]}
                              ).insert(ignore_permissions=True).name
if contacto:
    email = cli.dar_acesso(contacto)
    if not frappe.db.get_value("User", email, "last_password_reset_date"):
        from frappe.utils.password import update_password
        segredo = secrets.token_urlsafe(12)
        update_password(email, segredo)
        frappe.db.set_value("User", email, "last_password_reset_date", HOJE)
        log.append(f"acesso ao portal do cliente: {email}")

frappe.db.commit()
print("feito:", "; ".join(log) or "nada de novo")
print("preço/hora em uso:", preco)
if segredo:
    print("SEGREDO:" + segredo)
frappe.destroy()
