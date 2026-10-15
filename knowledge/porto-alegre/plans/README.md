# Planos e iniciativas de Porto Alegre — o que o pré-portfólio cruza

Tudo nesta pasta é lido pelo cruzamento de planos (`server/services/planLinks.ts`):
cada pré-nota é comparada com estes documentos, e uma conexão só aparece no
pré-portfólio se vier com um trecho **literal** do documento. Arquivos novos
entram sozinhos na próxima leitura (a versão do conjunto muda e as conexões são
refeitas).

## Como adicionar

- **Um plano ou documento** (SMAMUS, Coalizão RS, Regenera RS, Governança,
  Inovação, Retomada RS…): um `.md` com o texto, e no topo:

  ```
  ---
  title: "Plano de Ação Climática de Porto Alegre"
  owner: "SMAMUS"
  kind: plano          # plano | projeto | iniciativa | empresa
  source: "https://… ou nome do PDF original"
  ---
  ```
  Um PDF vira `.md` com qualquer conversor; o que importa é o texto.

- **A planilha de iniciativas** (Vila Flores + Robson, inclusive empresas que
  já fazem SbN): é a planilha "Iniciativas SbN em POA" da pasta do Drive, e
  `npm run city:import` a grava aqui como `iniciativas.csv`, com as colunas
  `nome, quem executa, tipo, bairro, endereço ou coordenadas, risco, tipo de solução, estágio, link ou documento, contato, observação`.
  Cada linha vira um documento. A coluna `contato` nunca é enviada ao modelo.

A pasta `README.md` é ignorada.

Os documentos longos (PLAC, Plano Diretor, Regenera Dilúvio, Banco Mundial…)
não ficam aqui: vêm da pasta do Drive para `../city/` e são **buscados** pelo
cruzamento, não lidos inteiros. Ver `../city/README.md`.
