<h1 align="center">🌌 Hikari (The Silver Glare - WhatsApp Edition) ✧</h1>

<p align="center"><a href="https://projetohikari.com/">Site do Projeto Hikari</a> · <a href="https://projetohikari.com/docs/whatsapp/">Documentação online</a> · <a href="https://discord.projetohikari.com/">Comunidade no Discord</a></p>

<div align="center">
  <picture>
    <source
      width="100%"
      srcset="https://i.imgur.com/9hOy6Nf.png"
      media="(prefers-color-scheme: dark)"
    />
    <source
      width="100%"
      srcset="https://i.imgur.com/9hOy6Nf.png"
      media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)"
    />
    <img width="250" src="https://i.imgur.com/9hOy6Nf.png" alt="Hikari Banner" />
  </picture>
  <p><i>"Prazer em te conhecer! Eu sou a Hikari, sua agente de IA pessoal pro WhatsApp... ✨"</i></p>

  <p align="center">
    <a href="docs/content_pt/README.md">
      <img src="https://img.shields.io/badge/Português-BR-blue?style=for-the-badge" alt="Português">
    </a>
    <a href="https://github.com/yGuilhermy/HikariDiscord">
      <img src="https://img.shields.io/badge/Fork%20de-Hikari%20(Discord)-7289da?style=for-the-badge&logo=discord&logoColor=white" alt="Original Discord">
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/License-AGPLv3-green?style=for-the-badge" alt="Licença AGPLv3">
    </a>
  </p>
</div>

---

### 🎀 O que eu faço? (Funcionalidades)

Eu não sou apenas um bot de chat comum! Eu sou uma **Agente Autônoma** capaz de interagir com o mundo real para te ajudar:

- **🧠 Cérebro Avançado**: Suporte a múltiplos modelos através de **Gemini** (com fallback sequencial 3.1 Flash-Lite, 3.5 Flash-Lite, 2.5 Flash-Lite e 2.5 Flash), **LM Studio (Local)**, **HuggingFace** e **Pollinations**. Minha personalidade é natural e adaptável!
- **🌍 Pesquisa Inteligente**: Se eu não souber algo, eu pesquiso na internet em tempo real, leio os sites e te trago um resumo mastigadinho (`>pesquisa`).
- **🖼️ Mestre das Figurinhas (Stickers)**: Crio figurinhas estáticas ou animadas a partir de imagens, GIFs ou vídeos de até 10 segundos em 512×512 sem distorção e com margens transparentes (`>sticker`), ou reverto figurinhas de volta para PNG ou GIF (`>toimg`).
- **🎵 DJ Particular & Downloads**: Baixe faixas em alta qualidade (Deezer) por nome/artista (`>musica`) e faça download de vídeos e áudios da web (`>baixar_video`, `>baixar_audio`).
- **🎮 Cantinho dos Games**: Procuro repacks e links magnet de jogos (Dodi/Fitgirl via bases locais) direto no chat (`>torrent`) e consulto nativamente a **Steam** para te dar preços e detalhes técnicos (`>steam`).
- **🎨 Ateliê de Arte**: Posso gerar imagens incríveis usando Pollinations ou Stability AI. Basta pedir! (`>imagem`).
- **💱 Mestre das Finanças**: Converto moedas e criptomoedas (BTC, USD, BRL) em tempo real com cotações oficiais e sem cache desatualizado (`>moeda`).
- **🎙️ Assistente de Voz & Respostas em Áudio**: Converse comigo no WhatsApp e receba respostas faladas em áudio natural (`>audio`), ou peça para eu ler qualquer texto em voz alta (`>falar`).
- **🎙️ Transcrição de Áudio no Chat**: Transcrevo áudios anexados ou citados quando há um provedor de transcrição configurado (`>transcrever`).
- **🔍 Visão & Identificação de Anime**: Reconheço cenas e animes a partir de imagens anexadas (`>anime`).
- **⚡ Agente Autônoma & Function Calling**: Você não precisa decorar comandos! Pode conversar comigo naturalmente pelo WhatsApp e eu decido e executo as ferramentas certas sozinha.

---

### 🚀 Como me acordar (Instalação)

#### ⚡ Método Rápido (Recomendado)

Para uma instalação automática de todas as dependências (Node.js, bibliotecas npm, yt-dlp e ffmpeg), use nossos scripts de setup:

- **Windows:** Clique duas vezes no arquivo `setup.bat` (ou execute `setup.ps1` no PowerShell).
- **Linux:** Execute `chmod +x setup.sh && ./setup.sh`.

---

#### 🛠️ Método Manual

Se você prefere fazer tudo na mão (Ubuntu/Linux recomendado):

1.  **Clone meu código**:

    ```bash
    git clone https://github.com/yGuilhermy/HikariWhatsapp.git
    cd HikariWhatsapp
    ```

2.  **Instale os módulos**:

    ```bash
    npm install
    ```

    _Obs: Você precisa do `yt-dlp` e `ffmpeg` instalados no sistema para as funções de mídia, figurinhas e música funcionarem direitinho!_

3.  **(Opcional) Ambiente Python para Deezer**:
    Se for utilizar o download de músicas em alta qualidade do Deezer:
    ```bash
    python -m venv .venv
    # Windows:
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
    # Linux:
    ./.venv/bin/pip install -r requirements.txt
    ```

4.  **Configure meus segredos**:
    - Renomeie o arquivo `.env_example` para `.env` e preencha as chaves.
    - Configure seu número de telefone com DDI e DDD em `WHATSAPP_OWNER_NUMBERS` (ex: `5511999999999`).
    - **Dica:** Você pode mudar meu nome no `.env` alterando `BOT_NAME`!

5.  **Dê o Start e Conecte seu WhatsApp**:
    ```bash
    node index.js
    ```
    - Na primeira inicialização, um **QR Code** será exibido no seu terminal.
    - No WhatsApp do celular, acesse **Aparelhos conectados > Conectar um aparelho** e escaneie o código.
    - Suas credenciais ficam salvas de forma segura na pasta `.whatsapp-auth/` para reconexão automática nas próximas vezes!

---

### 💬 Conversando com a Hikari (Comandos do WhatsApp)

- **No Privado:** Basta mandar uma mensagem diretamente para mim, sem prefixo!
- **Em Grupos:** Diga "Hikari", mencione minha conta, responda a uma mensagem minha ou utilize o prefixo `>` (ou `/`):

Veja todos os comandos, aliases e permissões na [referência de comandos](./docs/content_pt/COMMANDS.md).

| Comando e aliases | O que faz |
| :--- | :--- |
| `>audio <pergunta>` | Pede uma resposta em nota de voz. Também dá para começar a pergunta com um ponto. |
| `>falar <texto>` | Lê em voz alta o texto informado. |
| `>transcrever` | Anexe um áudio ou envie o comando em resposta direta à mensagem de áudio. Precisa de um provedor de transcrição configurado. Sem áudio, o pedido falha. |
| `>sticker [descrição]`, `>figurinha` | Cria uma figurinha de 512 × 512 sem cortar a imagem. Aceita imagens, GIFs ou vídeos de até 10 segundos e descrição opcional de até 128 caracteres. |
| `>sticker_som [nome]` | Cria uma figurinha com o som dos primeiros 10 segundos do vídeo anexado ou citado. Usa projetohikari.com como nome padrão ou o nome informado, sempre com a tag Hikari Bot. Recurso experimental ativado com `WHATSAPP_SOUND_STICKERS=true`. |
| `>sticker2image`, `>toimg` | Converte uma figurinha estática em PNG ou uma animada em GIF. |
| `>musica <nome e artista>`, `>baixar_musica_deezer` | Busca uma faixa no Deezer e envia o áudio. Para extrair áudio de um link, use >baixar_audio. |
| `>baixar_video <link>` | Baixa o vídeo de um link compatível e envia em MP4. |
| `>view [--dm]`, `>ver` | Reenvia texto ou mídia. Em grupos, use --dm para receber no privado. |
| `>cancelar`, `>parar` | Interrompe pedidos do chat. Quando usado pelo dono, cancela pedidos de todos os chats. |
| `>limpar`, `>hdel` | Apaga o contexto recente da conversa. Em grupo, só o dono do bot pode usar. |
| `>ajuda`, `>help` | Mostra o menu de ajuda. |

_Controle da fila: somente o dono pode usar >pausar, >retomar e >fila._

---

### 📚 Wiki & Documentação

Para guias detalhados, dicas de configuração e funcionamento técnico, consulte nossa documentação oficial:

- [🚀 **Guia de Instalação (Get Started)**](./docs/content_pt/GET_STARTED.md): Tudo para colocar a Hikari no ar, requisitos e pareamento.
- [⚙️ **Configuração & Governança**](./docs/content_pt/CONFIGURATION.md): Validação inicial, gerenciamento de donos, multi-token e cotações.
- [🔑 **Variáveis & APIs (.env)**](./docs/content_pt/ENVIRONMENT.md): O que é cada campo do .env, limites e onde pegar as keys.
- [✨ **Lista de Funcionalidades & IA**](./docs/content_pt/FEATURES.md): Ciclo de mensagens, function calling e capacidades do bot.
- [🎮 **Guia de Comandos**](./docs/content_pt/COMMANDS.md): Detalhes de todos os comandos de chat e administração.
- [🛠️ **Sistema de Tools & Arquitetura**](./docs/content_pt/ADVANCED.md): Documentação para desenvolvedores, Baileys e novas ferramentas.
- [🛡️ **Segurança & Moderação**](./docs/content_pt/MODERATION.md): Proteção de dados, sanitização de logs e controles de taxa.
- [🖼️ **Figurinhas & Mídia**](./docs/content_pt/MEDIA.md): Motor Sharp/FFmpeg de stickers 512×512 e músicas Deezer.
- [🎙️ **Sistema Vocal & Transcrição**](./docs/content_pt/VOICE.md): Transcrição Whisper, síntese neural TTS e tutoriais de deploy.
- [🌌 **Repositório Original (Discord)**](https://github.com/yGuilhermy/HikariDiscord): Repositório original de onde nasceu o projeto.

---

### ⚙️ Personalização Centralizada

Quer mudar minha alma? Tudo o que é importante está em `src/config/index.js` e no arquivo `.env`. Lá você pode ajustar:

- 👑 O número do meu mestre (`WHATSAPP_OWNER_NUMBERS`)
- 📝 Meu System Prompt (Minha personalidade básica)
- 🌐 URLs e Modelos de IA padrão
- 🤖 Meu nome de ativação no chat (`BOT_NAME`)

---

### 📝 Notas do dev

- A HikariZap é a versão para WhatsApp desenvolvida a partir da [Hikari original para Discord](https://github.com/yGuilhermy/HikariDiscord).
- A Hikari é uma IA que está em desenvolvimento, então ela pode não funcionar perfeitamente em todos os casos.
- O Baileys é utilizado como cliente de conexão ao protocolo do WhatsApp.
- Você pode mudar o nome da Hikari no `.env` alterando `BOT_NAME`!
- Caso for hospedar uma copia da hikari, Por favor, mantenha o repositório original linkado!
- Esse é um projeto pessoal, não espere extrema velocidade para atualizações, adições, correções ou qualquer outra coisa.
- Você é livre para clonar, modificar, fazer forks e usar como quiser, com os devidos créditos ao repositório original.
- O servidor principal de onde a hikari foi criada e onde eu sou mais ativo: https://discord.gg/NXwKvKNKCd
- O ID da Hikari original no Discord é: 1429544961734885406

---

### 📝 ToDo (Para mim mesmo)

- [ ] Modernizar e corrigir codigos (atualmente)
- [ ] Adicionar mais funcionalidades (MCPs)
- [ ] Suporte a pareamento por Pair Code (código de 8 dígitos) além de QR Code
- [ ] Suporte ao Ollama (é facil, mas preguiça)
- [ ] Adicionar mais modelos de IA (Fallbacks)
- [ ] Adicionar mais integrações (APIs)
- [ ] Adicionar mais comandos
- [ ] Otimizar o uso de Tokens
- [ ] Adicionar mais segurança

---

<div align="center">
  <p><i>"Não se esqueça de me dar um pouco de amor (e poder de processamento)!"</i></p>
  <p>Feito com 💜 e café por <b>yGuilhermy</b></p>
</div>


Modelos, pausas de disponibilidade e limites da fila: veja [docs/IA_E_FILA.md](docs/IA_E_FILA.md).
