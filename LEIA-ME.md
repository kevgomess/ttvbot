# Bot de IA para chat da Twitch (suporta múltiplos bots)

Um ou mais bots com contas próprias da Twitch que entram no seu chat e puxam
conversa espontaneamente sobre o jogo, seu dia, etc., usando a API da Groq
(gratuita), cada um com sua própria personalidade — e opcionalmente "ouvindo"
o que você fala pelo microfone.

⚠️ A Groq tem um **limite diário gratuito** de requisições. Se ele acabar no
meio da live, o bot para de gerar mensagens até resetar (24h). Se isso for
um problema frequente pra você, me avise que eu te ajudo a trocar pra uma
versão que roda a IA localmente no seu PC (Ollama), sem limite nenhum.

## O que ele faz

- Você configura quantos bots quiser, cada um com conta e personalidade próprias
- Cada bot manda mensagens espontâneas no chat, em intervalos independentes
- Todos compartilham o contexto da live (o que foi dito no chat e na sua voz),
  então reagem de forma coerente entre si
- Reagem quando você (o streamer) fala algo no chat
- Opcionalmente, "ouvem" sua fala via microfone e comentam sobre isso

## Passo a passo para rodar

### 1. Criar as contas dos bots na Twitch
Crie uma conta nova pra cada bot que você quiser (ex: `Bot1_SeuNome`,
`Bot2_SeuNome`...) — nunca use sua conta principal de streamer.

### 2. Gerar o token de acesso de cada bot
Para CADA conta de bot:
1. Faça login com aquela conta em https://twitchtokengenerator.com
2. Escolha "Bot Chat Token" (ou "Custom Scope Token" com `chat:read` + `chat:edit`)
3. Copie o token gerado (algo como `oauth:abc123...`)

### 3. Pegar sua chave da API do Groq (gratuita, uma só, compartilhada por todos os bots)
1. Acesse https://console.groq.com e crie uma conta (dá pra usar Google/GitHub)
2. Vá em "API Keys" e clique em "Create API Key"
3. Copie a chave (começa com `gsk_...`) — ela só aparece uma vez

O modelo usado por padrão é o `openai/gpt-oss-20b`, recomendado atualmente
pela Groq (o antigo `llama-3.3-70b-versatile` foi descontinuado em junho de
2026). Se um dia esse modelo também parar de funcionar, confira o nome atual
em https://console.groq.com/docs/models e atualize a variável `GROQ_MODEL`
no seu `.env`.

Com vários bots rodando, você consome mais requisições por minuto — se
notar erros de limite excedido, aumente o intervalo entre mensagens de cada
bot no `config/bots.json`.

### 4. Instalar as dependências
```bash
npm install
```

### 5. Configurar as credenciais compartilhadas
1. Copie o arquivo `.env.example` para um novo arquivo chamado `.env`
2. Preencha `TWITCH_CHANNEL`, `GROQ_API_KEY`, `STREAMER_NOME`, `JOGO_ATUAL`
3. `GROQ_MODEL` já vem preenchido com o modelo recomendado atual — só troque
   se ele for descontinuado no futuro

### 6. Configurar os bots individualmente
1. Copie `config/bots.example.json` para `config/bots.json`
2. Edite a lista: um objeto por bot, com:
   - `username` — nome da conta Twitch daquele bot
   - `oauthToken` — token gerado no passo 2 (formato `oauth:xxxx`)
   - `personalidade` — instrução de como aquele bot deve se comportar
   - `intervaloMinutos` — de quanto em quanto tempo ele manda mensagem espontânea
3. Pode adicionar quantos bots quiser, é só ir copiando o bloco `{ ... }` e
   separando por vírgula dentro do array `[ ]`

**Nunca compartilhe os arquivos `.env` e `config/bots.json`** — eles têm
suas senhas/chaves reais.

### 7. Rodar os bots
```bash
npm start
```

Isso conecta todos os bots configurados de uma vez, cada um com sua conta,
no chat do seu canal.

## Personalizando o comportamento

A personalidade de cada bot fica no campo `personalidade` dentro do
`config/bots.json` — edite o texto livremente pra mudar o tom, o foco de
interesse, ou o estilo de fala de cada um.

Por padrão, os bots só reagem diretamente quando **você** (o streamer) fala
no chat, para não virar bagunça respondendo todo mundo. Se quiser que
reajam a qualquer espectador, edite o trecho
`if (tags.username?.toLowerCase() !== TWITCH_CHANNEL.toLowerCase()) return;`
no `bot.js`.

## Ativando a escuta do microfone (opcional)

O bot pode "ouvir" o que você fala, transcrever com IA (Whisper, via Groq —
também gratuito) e usar isso pra comentar ou puxar assunto no chat.

Isso usa o pacote **naudiodon**, que se conecta direto ao driver de áudio do
sistema. Diferente do ffmpeg, ele não precisa de um programa externo instalado
— mas precisa **compilar código nativo** durante o `npm install`, então:

### No Windows
1. Instale o **"Build Tools for Visual Studio"** (gratuito):
   https://visualstudio.microsoft.com/pt-br/visual-cpp-build-tools/
   - Na instalação, marque a opção **"Desenvolvimento para desktop com C++"**
   - Isso baixa uns 2-6 GB, pode demorar
2. Depois disso, rode `npm install` normalmente na pasta do bot

### No Mac
```bash
xcode-select --install
```

### No Linux
```bash
sudo apt install build-essential libasound2-dev
```

Se o `npm install` der erro de compilação mesmo depois disso, me avise que
eu monto a versão alternativa com ffmpeg (mais simples de instalar, mas é
um programa externo em vez de só npm).

### Descobrindo o microfone certo
Depois de instalar as dependências, rode:

```bash
npm run listar-microfones
```

Isso mostra uma lista de dispositivos de áudio com seus `id`s. Procure o
que corresponde ao seu microfone (geralmente tem "Microphone" ou o nome
da sua placa de som no nome) e coloque o número dele em `AUDIO_DEVICE_ID`
no `.env`. Se deixar `-1`, ele tenta usar o microfone padrão do Windows.

### Ativando
No `.env`, defina:
```
ESCUTA_ATIVA=true
```

Com isso ativo, o bot grava trechos de ~20 segundos do seu microfone em
loop contínuo, transcreve cada trecho e guarda no histórico de contexto.
Ele não comenta toda fala (só ~35% das vezes) pra não spammar o chat toda
hora que você abre a boca — pode ajustar isso no `bot.js`, na linha que
tem `Math.random() < 0.35`.

⚠️ **Privacidade:** com a escuta ativa, tudo que você fala perto do
microfone é enviado pra API da Groq pra ser transcrito. Não fale
informações sensíveis (senhas, dados pessoais de terceiros, etc.) enquanto
estiver com o bot ligado.

## Avisos importantes

- Use uma conta separada da Twitch para cada bot — nunca a sua principal.
- Um bot que interage abertamente como um "personagem" é diferente de
  serviços que simulam espectadores falsos para inflar audiência — isso
  último viola os Termos de Serviço da Twitch. Vários bots-personagem
  transparentes (como este projeto) é uma prática comum e aceitável, mas
  evite deixar dezenas rodando sem necessidade — além de custar mais
  requisições de API, pode disparar sistemas anti-spam da própria Twitch.
- Ajuste os intervalos de cada bot para não deixar o chat "spammado".
