# 🔑 Guia de Variáveis de Ambiente (.env)

Este documento descreve todas as variáveis suportadas pelo arquivo `.env` da HikariZap, suas faixas de valores e os links diretos para obter as chaves de API necessárias.

---

## 📂 Sumário

1. [📱 1. Configurações de WhatsApp e Conta](#-1-configurações-de-whatsapp-e-conta)
2. [📑 2. Sistema de Logs e Auditoria](#-2-sistema-de-logs-e-auditoria)
3. [🧠 3. Personalidade e Instrução Mestre](#-3-personalidade-e-instrução-mestre)
4. [🤖 4. Modelos de IA e Provedores LLM](#-4-modelos-de-ia-e-provedores-llm)
5. [🔍 5. Pesquisa Web e Geração de Imagens](#-5-pesquisa-web-e-geração-de-imagens)
6. [💱 6. Câmbio e Moedas](#-6-câmbio-e-moedas)
7. [🎙️ 7. Transcrição de Áudio (STT)](#-7-transcrição-de-áudio-stt)
8. [🔊 8. Síntese Vocal (TTS)](#-8-síntese-vocal-tts)
9. [📥 9. Downloads de Mídia e Deezer](#-9-downloads-de-mídia-e-deezer)
10. [💡 Dicas de Especialista](#-dicas-de-especialista)

---

## 📱 1. Configurações de WhatsApp e Conta

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `BOT_NAME` | `Hikari` | Nome que o bot reconhece como o seu nas conversas e grupos. |
| `WHATSAPP_OWNER_NUMBERS` | `5500000000000` | Números de telefone com privilégios de proprietário (com DDI e DDD), separados por vírgula. |
| `WHATSAPP_NOTIFY_OWNER` | `false` | Se `true`, envia mensagem privada ao proprietário confirmando a inicialização. |
| `WHATSAPP_AUTH_DIR` | `.whatsapp-auth` | Diretório onde as credenciais de sessão do Baileys são gravadas. |
| `WHATSAPP_DATA_DIR` | `src/data/zap` | Diretório de persistência de contexto e cache técnico de identidades. |
| `WHATSAPP_VISION_ENABLED` | `true` | Controle da descrição de imagens e figurinhas e da leitura de texto visual. Com `false`, o Zap não envia essas imagens ao provedor de visão. Figurinhas, Trace.moe e geração de imagem continuam disponíveis. |
| `WHATSAPP_MAX_MEDIA_MB` | `16` | Limite máximo em MB para envio de mídias pelo bot (Permitido: 1 a 64). |
| `SAVE_HISTORY` | `true` | Grava até 15 entradas recentes por conversa em `state.json`. Desativar impede novas gravações de histórico e preserva os registros existentes. |

---

## 📑 2. Sistema de Logs e Auditoria

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `LOG_EFFORT` | `1` | `0` essencial, `1` operações sem dados da conversa, `2` diagnóstico detalhado. A aplicação escreve no terminal. |

---

## 🧠 3. Personalidade e Instrução Mestre

| Variável | Descrição |
| :--- | :--- |
| `SYSTEM_PROMPT` | Diretriz primária inserida em todas as chamadas de modelo. Define tom, identidade e restrições comportamentais no WhatsApp. |

---

## 🤖 4. Modelos de IA e Provedores LLM

| Variável | Padrão / Exemplo | Onde Obter / Descrição |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | *(Sua chave)* | [Google AI Studio](https://aistudio.google.com/app/apikey) (Aceita múltiplas chaves separadas por vírgula para rotação). |
| `GEMINI_URL` | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | Endpoint compatível com formato OpenAI. |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Modelo principal de alta velocidade e raciocínio. |
| `GEMINI_MODEL_FALLBACK` | `gemini-3.5-flash-lite` | Primeiro modelo de contingência caso o principal esgote a cota. |
| `GEMINI_MODEL_FALLBACK_2`| `gemini-3.8-flash` | Segundo modelo de contingência. |
| `GEMINI_MODEL_FALLBACK_3`| `gemini-3.7-flash` | Terceiro modelo de contingência com maior capacidade analítica. |
| `HF_TOKEN` | *(Seu token HF)* | [Hugging Face Settings](https://huggingface.co/settings/tokens). |
| `HF_MODEL` | `Qwen/Qwen2.5-72B-Instruct` | Modelo do Hugging Face executado como fallback se todos os Gemini falharem. |
| `HF_API_URL` | `https://router.huggingface.co/v1/chat/completions` | Roteador de inferência do Hugging Face. |
| `LOCAL_LLM_ENABLED` | `false` | Habilita um modelo local via endpoint compatível. O pool ainda prioriza Gemini. |
| `LOCAL_LLM_URL` | `http://localhost:1234/v1/chat/completions` | URL do servidor local de IA. |
| `LOCAL_LLM_MODEL` | `local-model` | Identificador do modelo carregado no seu servidor local. |
| `LMSTUDIO_API_KEY` | *(Opcional)* | Chave de autorização caso seu endpoint local exija autenticação Bearer. |
| `LLM_TIMEOUT_MS` | `30000` | Tempo limite em milissegundos antes de abortar a requisição à IA (5.000 a 120.000 ms). |
| `POLLINATIONS_API_KEY` | *(Opcional)* | Chave da plataforma Pollinations AI. |
| `POLLINATIONS_TEXT_URL` | `https://text.pollinations.ai/openai` | Endpoint alternativo de texto do Pollinations. |
| `POLLINATIONS_MODEL` | `openai` | Modelo de texto do Pollinations. |

---

## 🔍 5. Pesquisa Web e Geração de Imagens

| Variável | Descrição | Onde Obter |
| :--- | :--- | :--- |
| `BRAVE_API_KEY` | Chave para pesquisa web oficial da Brave. | [Brave Search API](https://api.search.brave.com/app/dashboard) |
| `HORDE_IMAGE_API_KEY` | Chave para geração de imagens na rede descentralizada AI Horde. | [AI Horde Register](https://aihorde.net/register) (Use `0000000000` para modo anônimo). |

---

## 💱 6. Câmbio e Moedas

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `CURRENCY_PROVIDER` | `awesomeapi` | Provedor de cotações em tempo real (`awesomeapi` ou `frankfurter`). |
| `AWESOMEAPI_KEY` | *(Opcional)* | Chave de API opcional para o plano profissional da AwesomeAPI. |

---

## 🎙️ 7. Transcrição de Áudio (STT)

| Variável | Descrição | Onde Obter |
| :--- | :--- | :--- |
| `GROQ_CHAT_ENABLED` | Defina `true` para permitir Groq na conversa. | Configuração opcional |
| `GROQ_CHAT_API_KEY` | Credencial dedicada para conversa com Groq. | Use uma cota separada da transcrição. |
| `GROQ_API_KEY` | Chave da Groq para transcrição ultrarrápida via Whisper Turbo. | [Groq Cloud Console](https://console.groq.com/) |
| `WITAI_TOKEN` | Token do aplicativo no Wit.ai para transcrição gratuita. | [Wit.ai Console](https://wit.ai/) |
| `OPENAI_STT_KEY` | Chave oficial da OpenAI para transcrição via Whisper. | [OpenAI API Keys](https://platform.openai.com/api-keys) |
| `OPENAI_STT_URL` | Endpoint da OpenAI para transcrição de áudio. | `https://api.openai.com/v1/audio/transcriptions` |
| `HF_STT_URL` | Endpoint de transcrição via Whisper no Hugging Face. | Padrão: `.../openai/whisper-large-v3-turbo` |
| `LOCAL_STT_URL` | Endpoint de servidor Whisper local próprio (se houver). | Ex: `http://localhost:8000/v1/audio/transcriptions` |

---

## 🔊 8. Síntese Vocal (TTS)

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `MODAL_TTS_ENDPOINT` | *(Vazio)* | Endpoint de síntese neural no Modal.com com GPU NVIDIA dedicada. |
| `HF_TTS_ENDPOINT` | *(Vazio)* | Endpoint do Hugging Face Spaces executando XTTS v2. |
| `VOICE_SPEED` | `1.15` | Velocidade da fala sintetizada (0.5 a 2.0). |
| `VOICE_TEMPERATURE` | `0.65` | Variabilidade e expressividade da voz (0.0 a 2.0). |
| `VOICE_MAX_CHARS` | `1000` | Limite máximo de caracteres por síntese vocal (1 a 5.000). |

---

## 📥 9. Downloads de Mídia e Deezer

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `FFMPEG_PATH` | `ffmpeg` | Caminho do executável do FFmpeg no sistema. |
| `YTDLP_PATH` | `yt-dlp` | Caminho do executável do yt-dlp no sistema. |
| `PYTHON_PATH` | *(Auto)* | Caminho do executável Python (se vazio, usa a `.venv` local). |
| `YTDLP_COOKIES_PATH`| *(Opcional)* | Caminho para um arquivo `cookies.txt` exportado para evitar restrições em downloads. |
| `DEEZER_ARL` | *(Vazio)* | Cookie `arl` extraído da sua conta Deezer para baixar faixas do catálogo. |

---

## 💡 Dicas de Especialista

Ao definir `GEMINI_API_KEY` com valores separados por vírgula, o pool alterna entre as credenciais disponíveis. `GEMINI_MODELS` define a ordem dos modelos quando for preenchida. A cota disponível depende do projeto associado à chave.
- 💡 **Local LLM Gratuito:** Ativar `LOCAL_LLM_ENABLED=true` com o LM Studio rodando em sua máquina permite conversar ilimitadamente com modelos open-source sem custos de API externa.
- 💡 **Preservação de Segredos:** O arquivo `.env` nunca deve ser compartilhado ou enviado ao repositório público do GitHub. Mantenha-o sempre isolado no seu ambiente local ou servidor VPS.

---

[🏠 Voltar ao Menu Principal](./README.md)


## Prazos e limites do agente

`LLM_ATTEMPT_TIMEOUT_MS` deve caber em `LLM_COMPLETION_BUDGET_MS`, que deve caber em `LLM_AGENT_BUDGET_MS`. O orçamento do agente deve caber em `QUEUE_TASK_TIMEOUT_MS`. Rode `npm run config:check` antes de iniciar e consulte a [referência de variáveis](https://projetohikari.com/docs/referencia/variaveis-ambiente/) para os valores padrão.

## Fila, recuperação e grupos movimentados

O Zap processa até dois pedidos de chats diferentes por padrão e mantém um pedido ativo por chat. Configure a capacidade com QUEUE_MAX_PENDING, QUEUE_MAX_PER_CHAT e QUEUE_WAIT_TIMEOUT_MS. A fila aguarda a janela de envio em vez de ignorar pedidos que encontram o limite local. Se a fila estiver cheia, a ampulheta indica que o pedido novo não entrou.

Pedidos aceitos são gravados temporariamente em pending-requests, dentro de WHATSAPP_DATA_DIR, com acesso restrito ao usuário do processo. Os registros guardam a mensagem necessária para retomar o pedido, inclusive referências a anexos, e são removidos ao concluir ou expirar. A recuperação tem uma janela de 15 minutos e depende de a mídia original ainda estar disponível. Se o processo cair após começar a transmitir uma resposta, o bot não repete o envio automaticamente, pois o WhatsApp pode já tê-lo entregue.

Em produção, rode o Zap sob um supervisor que reinicie em caso de falha. No servidor do projeto, use systemctl --user status hikari-zap e journalctl --user -u hikari-zap para acompanhar o serviço. O serviço e o tmux não devem rodar duas cópias com a mesma sessão.
