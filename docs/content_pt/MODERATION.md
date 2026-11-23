# 🛡️ Sistema de Segurança, Moderação e Privacidade

A HikariZap adota uma arquitetura orientada à privacidade, com isolamento de credenciais locais, sanitização ativa de dados confidenciais e controle administrativo rigoroso no WhatsApp.

---

## 📂 Sumário

1. [🔒 1. Privacidade e Isolamento de Dados](#-1-privacidade-e-isolamento-de-dados)
2. [🧹 2. Sanitização Ativa de Logs](#-2-sanitização-ativa-de-logs)
3. [👑 3. Comandos Administrativos do Proprietário](#-3-comandos-administrativos-do-proprietário)
4. [🚦 4. Proteção de Taxa e Prevenção de Bloqueios](#-4-proteção-de-taxa-e-prevenção-de-bloqueios)
5. [💡 Dicas de Moderação e Segurança](#-dicas-de-moderação-e-segurança)

---

## 🔒 1. Privacidade e Isolamento de Dados

A segurança da instância começa pelo não armazenamento de informações pessoais desnecessárias:

- **Dados nos logs.** Os registros podem incluir nome, identificador da conversa e argumentos de comandos. Restrinja o acesso aos arquivos de diagnóstico.
- Com `SAVE_HISTORY=true`, o bot grava até 15 entradas recentes por conversa em `state.json` no diretório `WHATSAPP_DATA_DIR`. As entradas incluem mensagens e respostas usadas como contexto. `SAVE_HISTORY=false` impede novas gravações de histórico, mas os registros já salvos podem continuar disponíveis. Use `>limpar` para apagar o contexto da conversa. Em grupos, esse comando é restrito ao proprietário.
- **Isolamento de Caches:** Arquivos temporários de mídia, stickers e downloads residem na pasta local configurada e são purgados automaticamente logo após a entrega ao WhatsApp.

---

## 🧹 2. Sanitização Ativa de Logs

A HikariZap escreve os logs no terminal. Configure `LOG_EFFORT=0` para eventos essenciais, `1` para operações sem dados das conversas, ou `2` durante um diagnóstico. O nível 2 pode exibir mensagens, identificadores e argumentos. Chaves conhecidas são mascaradas. O QR de pareamento continua disponível no terminal em todos os níveis e deve ficar privado.

Um supervisor pode conservar a saída do processo conforme sua própria configuração. O histórico funcional em `state.json` continua controlado por `SAVE_HISTORY`.

---

## 👑 3. Comandos Administrativos do Proprietário

Os comandos abaixo são restritos aos telefones autorizados no arquivo `.env` (`WHATSAPP_OWNER_NUMBERS`):

### `>pausar`
Cancela a fila principal e reage com ⏸️. Enquanto o atendimento está pausado, usuários comuns recebem um aviso de manutenção e o proprietário pode testar pela fila dedicada.

### `>retomar`
Restaura a operação normal após uma pausa administrativa.

### `>fila`
Mostra a quantidade de tarefas ativas e pendentes na fila principal e se ela está pausada.

---

## 🚦 4. Proteção de Taxa e Prevenção de Bloqueios

O Baileys é um cliente não oficial de conexão ao protocolo do WhatsApp. Para proteger o chip e a conta contra restrições ou bloqueios:

- **Serialização Obrigatória:** A Hikari nunca dispara mensagens simultâneas em massa no mesmo segundo. O despachador mantém uma pausa técnica mínima entre mensagens.
- **Limitação por Conversa:** Cada chat individual tem uma cota máxima de 6 envios por minuto.
- **Desconexão Controlada:** Caso o WhatsApp reporte desconexão por logout no celular ou conflito de dispositivo, a Hikari interrompe a sessão de forma segura sem tentar novo pareamento em loop infinito.

---

## 💡 Dicas de Moderação e Segurança

- **Limites locais.** Respeitar a cadência de envio reduz disparos consecutivos. Restrições da plataforma continuam sendo decididas pelo WhatsApp.
- 💡 **Gestão de Grupos Grandes:** Em grupos com centenas de membros, oriente os participantes a mencionarem a Hikari apenas quando desejarem sua ajuda direta, mantendo o ambiente limpo e sem poluição.
- 💡 **Backup Seguro:** Mantenha um backup seguro da pasta `.whatsapp-auth` em local protegido caso precise migrar de servidor.

---

[🏠 Voltar ao Menu Principal](./README.md)
