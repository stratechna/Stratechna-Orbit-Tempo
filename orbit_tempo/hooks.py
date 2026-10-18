app_name = "orbit_tempo"
app_title = "Tempo"
app_publisher = "Stratechna"
app_description = "Registo de horas, packs e preço/hora para freelancers — Stratechna Orbit"
app_email = "it@stratechna.pt"
app_license = "agpl-3.0"

# Funciona sozinha: só precisa do Frappe. Com o CRM, o Desk ou o ERP no mesmo
# site, liga-se a eles (F5) — nunca o contrário, nada aqui os exige.
required_apps = ["frappe"]

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

# A interface vive em /tempo e trata das suas rotas por dentro (#/semana…).
# Sem nenhum nome de domínio no código: o mesmo site serve em
# edna.stratechna.com hoje e em portal.<domínio do cliente> amanhã
# (dominio-tenant.sh junta o domínio sem tocar na app).
website_route_rules = [{"from_route": "/tempo/<path:app_path>", "to_route": "tempo"}]

after_install = ["orbit_tempo.instalar.garantir"]
after_migrate = ["orbit_tempo.instalar.garantir"]
