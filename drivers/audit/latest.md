# Auditoria de preservação de drivers

Gerada em: 2026-09-15T17:46:32.648Z

> A auditoria baixa o arquivo diretamente da fonte oficial, calcula SHA-256 e procura sinais de licença/EULA. **Ausência de proibição não significa permissão de redistribuição.**

| Prioridade | Modelo | Download oficial | Tamanho | SHA-256 | Redistribuição |
|---:|---|---|---:|---|---|
| 1 | Elgin i9 | OK | 1.552.568 | `51452b170fbcf7f6b5a9f214a3a5d81e550b4954d0ca25a4bbc54be3c620597e` | não esclarecida |
| 2 | Elgin i8 | OK | 3.264.923 | `111af2eabee31332ce42c1278bbc99588be8bbffdecad3a92d14449d35821264` | não esclarecida |
| 3 | Elgin i7 Plus | OK | 3.239.551 | `738ba3b647775b1d8a2dcaac29455358ec015fa62a69ef19168403bfb58a5621` | não esclarecida |
| 4 | Bematech MP-4200 TH | OK | 26.048.705 | `688895d39b952763b4d41311b52316e3afa9b2cd6ecfef375327bde8a436e1f0` | não esclarecida |
| 5 | Tanca TP-550 | OK | 14.388.168 | `aa4c1667c763bed6b424583931a513980795d09ecb08106909aeeb995053136b` | não esclarecida |
| 6 | Tanca TP-620 Plus | OK | 4.664.748 | `4ec943efa80bb5b30b06cfcc94c1d131fdf1044f0760ce042dea141926bc9b69` | não esclarecida |
| 7 | Tanca TP-650 | OK | 16.684.031 | `e85cdb0e834ff9715c511810bc0fe37189308d211df322c987ef14455f3c9b81` | não esclarecida |
| 8 | Sweda SI-150 / SI-250 | OK | 7.064.558 | `fc3d90a515382c8c11568cadf4cda18973fab623a74dcdaab5e360317f413c6c` | não esclarecida |
| 9 | Sweda SI-600 | OK | 12.611.535 | `b47338c60f6fd4689ca70cabe14f35172ac711761b6a3134b09c2724ad51b3a2` | não esclarecida |
| 10 | Waytec WP-50 | falhou no runner | — | — | pendente |
| 11 | Waytec WP-100 | falhou no runner | — | — | pendente |
| 12 | DIMEP D-Print Dual | OK | 54.104.970 | `5ffb759bb9d400e8bd593520194d6de4ea2b9f8ed3a125dc9dad8358727aefff` | não esclarecida |

## Resultado desta rodada

- 10 de 12 pacotes prioritários foram baixados diretamente das fontes oficiais e tiveram SHA-256 registrado.
- Waytec WP-50 e WP-100 continuam com URLs oficiais válidas/indexadas, mas o runner não conseguiu baixar os arquivos nesta execução.
- Nenhum dos pacotes inspecionados trouxe permissão explícita de redistribuição detectável. Portanto, nenhum binário foi republicado em GitHub Releases nesta rodada.
- Epson está fora do espelhamento: os termos atuais da Epson proíbem redistribuição do software proprietário. O site continuará apontando para a fonte Epson.

## Regra para GitHub Releases

Um driver só entra no acervo próprio quando `redistribution.status` em `drivers/archive-manifest.json` for `allowed` e houver evidência explícita, como licença do pacote ou autorização escrita do fabricante. Até lá, preservamos origem, versão, tamanho e hash sem republicar o binário.
