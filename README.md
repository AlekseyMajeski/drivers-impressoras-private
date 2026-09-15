# Acervo de drivers de impressoras

Este repositório concentra a infraestrutura de preservação do projeto público `AlekseyMajeski/tutoriais`.

## Estrutura

- `scripts/sync-private-archive.mjs`: lê as páginas do site público, coleta os downloads diretos encontrados, calcula SHA-256, deduplica por conteúdo e envia versões novas ao Release `private-driver-archive`.
- `scripts/archive-official-drivers-private.mjs`: alternativa para gerar uma cópia local/NAS fora do GitHub.
- `scripts/audit-driver-preservation.mjs`: baixa os candidatos prioritários, calcula hashes e procura sinais de licença/EULA.
- `drivers/archive-manifest.json`: manifesto priorizado de drivers e metadados.
- `drivers/audit/latest.json` e `latest.md`: histórico da auditoria inicial.
- `catalog/latest.json` e `latest.md`: catálogo gerado pelas sincronizações completas.

## Fluxo público x preservação

O site público continua apontando diretamente para o fabricante sempre que existe uma URL estável. Este repositório é o cofre técnico para versões preservadas, hashes e histórico.

O workflow **Private driver archive** possui uma trava de segurança: ele só cria/mantém o Release de binários quando a visibilidade do repositório é `private`. Se o repositório estiver público, ele remove o Release de preservação e encerra sem publicar binários.

## Sincronização

Quando o repositório estiver privado, execute o workflow **Private driver archive** manualmente em Actions ou deixe a rotina agendada executar. O processo preserva versões novas sem substituir as anteriores.

Na última coleta completa foram encontradas 66 URLs diretas no site e 64 conseguiram ser baixadas; Waytec WP-50 e WP-100 ficaram pendentes por bloqueio/falha de rede no runner.

## Cópia local opcional

Com o repositório `tutoriais` clonado ao lado deste:

```bash
node scripts/archive-official-drivers-private.mjs ../tutoriais
```

Também é possível definir outra pasta privada:

```bash
DRIVER_ARCHIVE_DIR=/caminho/privado node scripts/archive-official-drivers-private.mjs ../tutoriais
```

## Observação de redistribuição

O acervo privado serve para preservação e continuidade interna. A publicação pública de um binário deve ser analisada separadamente conforme licença/permissão do respectivo pacote.
