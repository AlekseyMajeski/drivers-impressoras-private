# Acervo privado de drivers de impressoras

Repositório **privado** usado como cofre de preservação do projeto público `AlekseyMajeski/tutoriais`.

## Estrutura

- Os binários ficam no Release privado `private-driver-archive`.
- O Git guarda apenas scripts e `catalog/latest.json`/`.md`.
- O site público continua apontando para a fonte oficial enquanto ela estiver disponível.
- O nome de cada asset inclui um trecho do SHA-256. Se o fabricante trocar o arquivo mantendo a mesma URL, a nova versão é adicionada sem apagar a anterior.
- URLs temporariamente inacessíveis ficam registradas no catálogo e são tentadas novamente nas próximas sincronizações.

## Sincronização

O workflow `Private driver archive` lê todas as páginas de modelos do repositório público, coleta links diretos de drivers/utilitários, baixa os arquivos, calcula SHA-256 e adiciona somente conteúdos ainda não preservados.

Ele roda automaticamente e também pode ser disparado manualmente em Actions.

> Este repositório deve permanecer privado. Não vincular seus Release assets diretamente ao site público sem uma decisão explícita de redistribuição.
