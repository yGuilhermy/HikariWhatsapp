# Comandos da HikariZap

Use o prefixo configurado (o padrão é >) ou /. Em grupo, você também pode mencionar a Hikari, chamá-la pelo nome ou responder a uma mensagem dela.

Comece a pergunta com um ponto para receber a resposta em nota de voz.

## Conversa, voz e leitura

| Comando e aliases | O que faz |
| :--- | :--- |
| `>ia_chat <pergunta>` | Envia uma pergunta à Hikari por comando e recebe a resposta em texto. |
| `>audio <pergunta>` | Pede uma resposta em nota de voz. Também dá para começar a pergunta com um ponto. |
| `>falar <texto>` | Lê em voz alta o texto informado. |
| `>transcrever` | Anexe um áudio ou envie o comando em resposta direta à mensagem de áudio. Precisa de um provedor de transcrição configurado. Sem áudio, o pedido falha. |
| `>anime [link]`, `>anime_origem` | Identifica uma cena de anime por imagem anexada, citada ou por link direto da imagem. |
| `>pesquisa <assunto>`, `>pesquisar` | Busca na web e retorna resultados com links. |

## Figurinhas e geração de mídia

| Comando e aliases | O que faz |
| :--- | :--- |
| `>sticker [nome]`, `>figurinha` | Cria uma figurinha de 512 × 512 com foto, GIF ou vídeo de até 10 segundos. Preserva o quadro inteiro por padrão. |
| `>sticker_som [nome]` | Cria uma figurinha com o som dos primeiros 10 segundos do vídeo anexado ou citado. Usa projetohikari.com como nome padrão ou o nome informado, sempre com a tag Hikari Bot. Recurso experimental ativado com `WHATSAPP_SOUND_STICKERS=true`. |
| `>sticker_crop`, `>sticker_som_crop` | Corta a mídia pelo centro para preencher o quadrado. |
| `>sticker_fill`, `>sticker_som_fill` | Estica a mídia para preencher o quadrado. |
| Nome da figurinha | Até 128 caracteres após o comando. O padrão é `projetohikari.com` e o autor é sempre Hikari Bot. Os sufixos também funcionam com `>figurinha`. |
| `>sticker2image`, `>toimg` | Converte uma figurinha estática em PNG ou uma animada em GIF. |
| `>imagem <descrição>`, `>ia_imagem` | Gera uma imagem conforme a descrição. |
| `>musica <nome e artista>`, `>baixar_musica_deezer` | Busca uma faixa no Deezer e envia o áudio. Para extrair áudio de um link, use >baixar_audio. |
| `>baixar_audio <link>`, `>baixar_musica` | Extrai áudio de um link compatível e envia em MP3. |
| `>baixar_video <link>` | Baixa o vídeo de um link compatível e envia em MP4. |

## Jogos, Steam e câmbio

| Comando e aliases | O que faz |
| :--- | :--- |
| `>buscar_jogo <nome>`, `>jogo` | Busca nos catálogos locais e apresenta até cinco opções. |
| `>torrent <nome ou número>` | Com nome, busca jogos. Com número, envia o .torrent da lista citada ou da última busca válida, ou um .txt com o magnet quando necessário. Você também pode responder à lista apenas com o número. |
| `>steam <jogo>`, `>steam_jogo` | Consulta preço e detalhes de um jogo na Steam. |
| `>moeda <valor> <de> <para>`, `>converter_moeda` | Converte um valor entre moedas. Exemplo: >moeda 10 USD BRL. |

## Histórico, controle e diagnóstico

| Comando e aliases | O que faz |
| :--- | :--- |
| `>view [--dm]`, `>ver` | Reenvia texto ou mídia. Em grupos, use --dm para receber no privado. |
| `>cancelar`, `>parar` | Interrompe pedidos do chat. Quando usado pelo dono, cancela pedidos de todos os chats. |
| `>limpar`, `>hdel` | Apaga o contexto recente da conversa. Em grupo, só o dono do bot pode usar. |
| `>ajuda`, `>help` | Mostra o menu de ajuda. |
| `>telemetria`, `>diagnostico` | Mostra dados do usuário e do chat, tempo de resposta e estado do bot. |
| `>ping` | Mostra o tempo entre receber o pedido e preparar a resposta, sem contar a entrega pelo WhatsApp. |
| `>userinfo` | Mostra dados do usuário e da conversa, incluindo o tipo de identificador. |

## Comandos exclusivos do proprietário

Apenas o dono do bot pode usar estes comandos, conforme a configuração da instância.

| Comando e aliases | O que faz |
| :--- | :--- |
| `>pausar` | Pausa o atendimento e cancela a fila. |
| `>retomar` | Retoma o atendimento. |
| `>fila` | Mostra quantos pedidos estão ativos, quantos aguardam e se o atendimento está pausado. |

[Emojis e reações](https://projetohikari.com/docs/whatsapp/comandos/#emojis-e-reacoes) · [Voltar à documentação](./README.md)
