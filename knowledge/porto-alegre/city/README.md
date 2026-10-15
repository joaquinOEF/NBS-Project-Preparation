# A base de contexto da cidade

Gerada por `npm run city:import` a partir da pasta do Drive da coordenação
**COUGAR – planos e iniciativas POA**. Não editar à mão: quem quiser
acrescentar algo coloca o arquivo na pasta (em "3 · Recebidos") e a importação
roda de novo. O PR mostra o que mudou.

| Arquivo | O que é | Quem lê |
|---|---|---|
| `docs/*.json.gz` | O texto de cada PDF em trechos com página, cada um com uma linha de contexto (documento, ação, lugar) escrita na importação | `server/services/cityDocs.ts`: o cruzamento com planos (busca) e o `search_knowledge` do agente |
| `layers/*.geojson.gz` | As camadas do servidor SIG da SMAMUS que respondem a uma pergunta sobre um lugar (pôlder, APP, REURB, corredor, cotas de inundação, obras por perto), simplificadas | `server/services/siteContext.ts`: as linhas "O lugar nos mapas da cidade" da pré-nota, da nota conceitual, do conselheiro, do ranking, das perguntas e do relatório de sinergias |
| `plac-acoes.json` | As 30 ações do PLAC e as iniciativas que a Prefeitura acompanha (etapa, contrato, datas) | o corpus do cruzamento com planos, inteiro |
| `manifest.json` | Cada arquivo da pasta: o que virou, ou por que não foi lido | os testes (`e2e/city-context.spec.ts`) e quem revisa |

A planilha "Iniciativas SbN em POA" vira `../plans/iniciativas.csv`.

- **Que camadas entram:** o registro em `shared/city-layers.ts`. Uma camada fora dele continua no Drive; só não é lida por lugar.
- **Linhas de contexto:** escritas por um modelo pequeno (`CITY_CONTEXT_MODEL`, padrão `claude-haiku-5-5`) e guardadas em cache em `.cache/`. Uma nova importação só paga pelas páginas novas. `--no-context` pula essa etapa.
- **Nada é lido do Drive em produção.** O servidor só lê estes arquivos.
