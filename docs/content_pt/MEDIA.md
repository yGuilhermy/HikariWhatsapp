# 🖼️ Processamento de Mídia, Figurinhas e Música

A HikariZap conta com um subsistema de manipulação multimídia projetado para produzir figurinhas de alta qualidade, extrair áudios da internet e realizar downloads musicais em qualidade de estúdio.

---

## 📂 Sumário

1. [🎨 1. Arquitetura de Figurinhas (Sharp + FFmpeg)](#-1-arquitetura-de-figurinhas-sharp--ffmpeg)
2. [🔄 2. Reversão de Figurinhas para Imagem e GIF (>toimg)](#-2-reversão-de-figurinhas-para-imagem-e-gif-toimg)
3. [🎵 3. Downloads do Deezer](#-3-downloads-do-deezer)
4. [🎬 4. Downloader de Vídeos e Áudios Web (yt-dlp)](#-4-downloader-de-vídeos-e-áudios-web-yt-dlp)
5. [🎮 5. Extração e Validação de Torrents de Jogos](#-5-extração-e-validação-de-torrents-de-jogos)
6. [💡 Dicas de Especialista](#-dicas-de-especialista)

---

## 🎨 1. Arquitetura de Figurinhas (Sharp + FFmpeg)

O módulo `src/services/stickerService.js` resolve o problema comum de figurinhas esticadas ou cortadas que ocorrem em bots legados:

### Tratamento de Imagens Estáticas:
1. **Inspeção de Dimensões:** A biblioteca **Sharp** inspeciona a largura e altura do arquivo original.
2. **Cálculo de Proporção:** Calcula o fator de escala mantendo a proporção exata da imagem.
3. **Canvas 512×512 com Margens Transparentes:** A imagem é centralizada sobre um canvas transparente quadrado de 512×512 pixels.
4. **Codificação WebP:** O arquivo é exportado em formato WebP otimizado com compressão sem perda visível.
5. **Injeção de Metadados EXIF:** Os blocos de metadados do WhatsApp são anexados ao WebP, identificando o pacote e a autoria.

### Tratamento de Figurinhas Animadas (Vídeos e GIFs):
1. **Duração.** O bot processa até os primeiros 10 segundos do vídeo ou GIF.
2. **Processamento:** o Zap reaproveita WebP compatível e usa Sharp para GIFs dentro do orçamento de memória. O FFmpeg converte vídeos e GIFs maiores:
   - Redimensionamento proporcional para caber dentro da caixa delimitadora de 512×512 pixels.
   - Aplicação de preenchimento (`pad=512:512:(512-iw)/2:(512-ih)/2:color=black@0.0`) com transparência total.
   - O FFmpeg ajusta a taxa de quadros e a qualidade ao limite e grava o WebP em loop.
3. **Tamanho de saída.** O limite é 500 KiB para figurinhas animadas e 100 KiB para estáticas. Se a compressão não atingir o limite, o comando falha.

---

## 🔄 2. Reversão de Figurinhas para Imagem e GIF (`>toimg`)

Ao responder a uma figurinha no chat com o comando `>toimg` (ou `>sticker2image`):

- **Estática.** O Sharp exporta um PNG com fundo branco nas áreas transparentes.
- **Animada.** O Sharp exporta os quadros como GIF em loop, também com fundo branco.

---

## 🎵 3. Downloads do Deezer

Peça a música pelo nome e pelo artista com `>musica`. Se a busca devolver opções, use `>musica #2` para selecionar a segunda. O MP3 chega em áudio e o FLAC como documento. A faixa disponível determina a qualidade e os metadados.

---

## 🎬 4. Downloader de Vídeos e Áudios Web (yt-dlp)

Os comandos `>baixar_video` e `>baixar_audio` integram o poder do `yt-dlp`:

- **Extração Apenas de Áudio:** Ao usar `>baixar_audio`, apenas a trilha sonora original (`bestaudio`) é baixada, sendo convertida dinamicamente pelo FFmpeg para MP3 quando a plataforma disponibiliza a trilha separada.
- **Respeito aos Limites do WhatsApp:** Se o arquivo final ultrapassar a variável `WHATSAPP_MAX_MEDIA_MB` (padrão 16 MB), o download é interrompido com uma orientação para enviar uma mídia menor.
- **Suporte a Cookies:** Para plataformas com restrições de login, você pode configurar o caminho de um arquivo de cookies em `YTDLP_COOKIES_PATH` no seu `.env`.

---

Os links do Instagram são enviados ao provedor sem os parâmetros que vêm depois de `?`.

## 🎮 5. Extração e Validação de Torrents de Jogos

Ao utilizar o comando `>torrent nome`:

1. **Varredura Local:** O serviço consulta os catálogos locais `src/data/fitgirl.json` e `src/data/dodi.json` (fornecidos pelo usuário, não inclusos no repositório).
2. **Seleção de Repacks:** Até 5 itens mais relevantes são selecionados com título, tamanho descompactado e data do release.
3. **Validação Criptográfica de Infohash:** A Hikari confere o hash do magnet link (BTIH). Se o serviço de cache estiver indisponível, o magnet link completo original é preservado com integridade.
4. **Entrega em Documento:** O magnet é entregue em um pequeno arquivo `.txt` formatado, facilitando a cópia ou importação direta no seu cliente torrent preferido (como qBittorrent).

---

## 💡 Dicas de Especialista

- 💡 **Vídeos sem Corte:** Ao mandar um vídeo na vertical para virar figurinha com `>sticker`, a Hikari não corta o topo nem a base do vídeo; ela coloca margens laterais invisíveis para manter 100% da sua filmagem.
- 💡 **Uso de Memória em VPS:** A fila processa um pedido por conversa e respeita o limite global de concorrência da instância.

---

[🏠 Voltar ao Menu Principal](./README.md)

## Downloads do Instagram

Reels e publicações com vídeo podem ser colados com os parâmetros de compartilhamento. O bot limpa a URL antes de executar o yt-dlp. Se o Instagram limitar o acesso anônimo, a instância aguarda antes de tentar de novo. O mantenedor pode configurar um arquivo local de cookies autorizado em YTDLP_COOKIES_PATH.
