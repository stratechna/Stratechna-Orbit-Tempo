"""/cliente — o lado Cliente (os clientes do freelancer). Sem sessão, mostra a entrada."""
from orbit_tempo import paginas as pagina

no_cache = 1


def get_context(context):
    return pagina.contexto(context, "cliente")
