# Stratechna Orbit — Tempo

App Frappe para freelancers: registo de tempo (cronómetro, manual, grelha semanal),
acordos com cada cliente (à hora, preço fixo; packs e avenças na F2) e **estudo do
preço/hora** a partir das despesas da estrutura, do rendimento desejado e do regime
fiscal (Portugal e Espanha).

Plano: `docs/PLANO-APP-TEMPO-FREELANCER.md` na área de trabalho da Stratechna.

## Como funciona

- **Funciona sozinha.** Só precisa do Frappe. Num tenant do Orbit com CRM, Desk ou
  ERP, liga-se a eles (F5); nada aqui os exige.
- **Sem domínio no código.** O mesmo site serve em `edna.stratechna.com` hoje e em
  `portal.<domínio do cliente>` amanhã (`dominio-tenant.sh` no Apps02).
- **Interface em `/tempo`.** Um só ficheiro JavaScript, sem compilação nem
  bibliotecas. As contas fazem-se sempre no servidor.
- **Livro de horas** (`Tempo Movimento`) com a mesma semântica do `entrada_tempo` do
  portal: `credito`, `consumo`, `expiracao`, `ajuste`; as ofertas não gastam saldo.
- **O preço do registo fica gravado**: mudar o preço do acordo não muda o trabalho já feito.
- **Parâmetros fiscais** numa tabela por regime e ano (`dados/parametros_fiscais.json`),
  todos «por validar» até a contabilidade/gestoria os confirmar. A instalação só cria
  os que faltam e nunca reescreve um valor existente.
- **Nunca emite documentos fiscais** nem recebe dinheiro dos clientes finais (D3, D4).

## Peças

| Ficheiro | O quê |
|---|---|
| `orbit_tempo/preco.py` | Motor do estudo do preço/hora (sem Frappe) |
| `orbit_tempo/calculo.py` | Arredondamento e valor (sem Frappe) |
| `orbit_tempo/livro.py` | Registo → movimento, resumo, saldo |
| `orbit_tempo/api.py` | API da interface |
| `orbit_tempo/www/tempo.*` + `public/js/tempo.js` | A interface |
| `orbit_tempo/translations/{es,en}.csv` | Traduções (fonte em português) |

## Testes

```bash
python3 -m unittest orbit_tempo.testes.test_motor orbit_tempo.testes.test_traducoes
```

Os de integração correm no GitHub (workflow «Testes do Tempo»): num site só com o Tempo
e num tenant leve com `orbit` + `orbit_tempo`.

Licença: AGPL-3.0, a mesma do Frappe.
