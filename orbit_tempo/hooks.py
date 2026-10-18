app_name = "orbit_tempo"
app_title = "Stratechna Tempo"
app_publisher = "Stratechna"
app_description = "Stratechna Tempo — registo de horas, packs e preço/hora (no Stratechna Orbit)"
app_email = "it@stratechna.pt"
app_license = "agpl-3.0"

# Versão 2 (18-10-2026, decisão T3): só com o Orbit — o ERPNext dá clientes, folhas de
# horas, projetos e orçamentos. O Desk (Helpdesk) e o CRM ligam-se quando existem.
required_apps = ["frappe", "erpnext"]

# Entrada no ecrã de apps do Orbit (e no comutador do Frappe).
add_to_apps_screen = [
    {
        "name": "orbit_tempo",
        "logo": "/assets/orbit_tempo/icons/tempo.svg",
        "title": "Tempo",
        "route": "/tempo",
        "has_permission": "orbit_tempo.api.tem_acesso",
    }
]

# Admin em /tempo, Cliente em /cliente; as rotas por dentro são da interface.
# Nenhum domínio no código: o mesmo site serve em fortavia.orbit.stratechna.com e,
# depois de renomeado, em orbit.fortavia.es.
website_route_rules = [
    {"from_route": "/tempo/<path:app_path>", "to_route": "tempo"},
    {"from_route": "/cliente/<path:app_path>", "to_route": "cliente"},
]

# Os clientes do freelancer (Website User com o papel Customer) vão para a área deles.
role_home_page = {"Customer": "cliente"}

doc_events = {
    # A Folha de horas é a fonte do trabalho (T2): o acordo dá arredondamento e preço; o
    # livro do cliente nasce ao submeter e sai ao cancelar.
    "Timesheet": {
        "before_validate": "orbit_tempo.livro.antes_de_validar",
        "on_submit": "orbit_tempo.livro.ao_submeter",
        "on_cancel": "orbit_tempo.livro.ao_cancelar",
    },
    # Orçamento aceite (encomenda feita a partir dele) → acordos + projeto.
    "Sales Order": {"on_submit": "orbit_tempo.precos.encomenda_submetida"},
}

scheduler_events = {
    "daily": ["orbit_tempo.livro.expirar_packs", "orbit_tempo.extratos.aprovar_tacitos"],
}

# Testes (só no GitHub): prepara o ERPNext antes de correr.
before_tests = "orbit_tempo.testes.preparar.antes_dos_testes"

after_install = ["orbit_tempo.instalar.garantir"]
after_migrate = ["orbit_tempo.instalar.garantir"]
