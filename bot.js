// bot.js
// Suporta múltiplos bots de IA, cada um com sua própria conta da Twitch
// e personalidade, todos interagindo no mesmo chat da live.
// Geração de texto via API da Groq (gratuita, com limite diário).

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const tmi = require('tmi.js');
const Groq = require('groq-sdk');
const { gravarTrecho, transcrever } = require('./audio');

// ---------- Configuração compartilhada ----------
const {
  TWITCH_CHANNEL,
  GROQ_API_KEY,
  STREAMER_NOME,
  JOGO_ATUAL,
  ESCUTA_ATIVA,
  DURACAO_GRAVACAO_SEGUNDOS,
  GROQ_MODEL,
} = process.env;

const groq = new Groq({ apiKey: GROQ_API_KEY });
const escutaAtiva = ESCUTA_ATIVA === 'true';
const duracaoGravacao = Number(DURACAO_GRAVACAO_SEGUNDOS || 20);
// Modelo atual recomendado pela Groq (o llama-3.3-70b-versatile antigo foi descontinuado)
const modeloTexto = GROQ_MODEL || 'openai/gpt-oss-20b';

// ---------- Carrega a lista de bots ----------
const caminhoConfig = path.join(__dirname, 'config', 'bots.json');
if (!fs.existsSync(caminhoConfig)) {
  console.error('Arquivo config/bots.json não encontrado. Copie config/bots.example.json para config/bots.json e preencha com suas contas.');
  process.exit(1);
}
const configBots = JSON.parse(fs.readFileSync(caminhoConfig, 'utf-8'));

// ---------- Contexto compartilhado da live ----------
const MAX_HISTORICO = 20;
const historicoCompartilhado = [];

function adicionarAoHistorico(role, texto) {
  historicoCompartilhado.push({ role, content: texto });
  if (historicoCompartilhado.length > MAX_HISTORICO) historicoCompartilhado.shift();
}

// ---------- Gera mensagem pra um bot específico, usando a personalidade dele ----------
async function gerarMensagemIA(bot, gatilho, faladoRecentemente) {
  const systemPrompt = `Você é um espectador na live de ${STREAMER_NOME} na Twitch, assistindo ele(a) jogar ${JOGO_ATUAL}.
${bot.personalidade}
Fale como um espectador real no chat: mensagens curtas (menos de 5 palavras) casuais, sem formalidade, (sem acentuação e pontuação).
Você pode reagir a mensagens apenas dos que estão conversando no chat (inclusive outros bots) que aparecem no histórico, mas mantenha sua própria personalidade (sem mencionar ninguem no chat).
${faladoRecentemente ? `\nO streamer acabou de falar isso em voz alta: "${faladoRecentemente}"\nSe fizer sentido, comente ou pergunte algo relacionado a isso.` : ''}
Nunca se apresente como IA. Nunca use markdown. Responda só com a mensagem, nada mais. (sem mencionar a palavra streamer)`;


  const mensagens = [
    { role: 'system', content: systemPrompt },
    ...historicoCompartilhado,
    { role: 'user', content: gatilho },
  ];

  const resposta = await groq.chat.completions.create({
    model: modeloTexto,
    max_tokens: 200, // margem maior, pois modelos de raciocínio (gpt-oss) gastam tokens "pensando" antes de responder
    reasoning_effort: 'low', // reduz o raciocínio interno, deixando mais espaço pra resposta final
    messages: mensagens,
  });

  const texto = resposta.choices[0].message.content?.trim();
  if (!texto) {
    throw new Error('Resposta veio vazia do modelo (provavelmente gastou os tokens raciocinando). Tente aumentar max_tokens no bot.js.');
  }
  return texto;
}

// ---------- Cria e inicia um cliente Twitch por bot ----------
function iniciarBot(bot) {
  const client = new tmi.Client({
    options: { debug: false },
    identity: {
      username: bot.username,
      password: bot.oauthToken,
    },
    channels: [TWITCH_CHANNEL],
  });

  client.connect().catch((err) => console.error(`[${bot.username}] erro ao conectar:`, err.message));

  // A Twitch pode rejeitar mensagens silenciosamente (ex: chat em modo
  // "somente seguidores", conta do bot muito nova, ou filtro de spam).
  // Esse listener mostra o motivo real quando isso acontece.
  client.on('notice', (channel, msgid, message) => {
    console.warn(`[${bot.username}] aviso da Twitch (${msgid}):`, message);
  });

  async function enviarMensagemEspontanea(faladoRecentemente) {
    try {
      const gatilho = faladoRecentemente
        ? 'Reaja ao que o streamer acabou de falar em voz alta, ou puxe um assunto relacionado.'
        : 'Puxe um assunto novo e espontâneo agora, sobre o jogo ou sobre o dia do streamer.';
      const mensagem = await gerarMensagemIA(bot, gatilho, faladoRecentemente);
      if (mensagem) {
        console.log(`[${bot.username}] enviando: "${mensagem}"`);
        client.say(TWITCH_CHANNEL, mensagem);
        adicionarAoHistorico('assistant', `${bot.username}: ${mensagem}`);
      }
    } catch (err) {
      console.error(`[${bot.username}] erro ao gerar mensagem:`, err.message);
    }
  }

  const intervaloMs = Number(bot.intervaloMinutos || 4) * 60 * 1000;
  const atrasoInicial = 10000 + Math.random() * 20000;

  client.on('connected', () => {
    console.log(`[${bot.username}] conectado ao canal ${TWITCH_CHANNEL}`);
    setTimeout(() => enviarMensagemEspontanea(null), atrasoInicial);
    setInterval(() => enviarMensagemEspontanea(null), intervaloMs);
  });

  client.on('message', async (channel, tags, message, self) => {
    if (self) return;
    if (tags.username?.toLowerCase() !== TWITCH_CHANNEL.toLowerCase()) return;

    adicionarAoHistorico('user', `${STREAMER_NOME} disse: "${message}"`);

    try {
      const resposta = await gerarMensagemIA(
        bot,
        'O streamer acabou de responder algo no chat. Reaja de forma natural, do jeito da sua personalidade.'
      );
      if (resposta) {
        setTimeout(() => {
          client.say(channel, resposta);
          adicionarAoHistorico('assistant', `${bot.username}: ${resposta}`);
        }, 1500 + Math.random() * 4000);
      }
    } catch (err) {
      console.error(`[${bot.username}] erro ao reagir:`, err.message);
    }
  });

  return { bot, client, enviarMensagemEspontanea };
}

// ---------- Inicia todos os bots configurados ----------
const botsAtivos = configBots.map(iniciarBot);
console.log(`Iniciando ${botsAtivos.length} bot(s) no canal ${TWITCH_CHANNEL}, usando o modelo ${modeloTexto}...`);

// ---------- Loop de escuta de voz (compartilhado entre todos os bots) ----------
async function escutarContinuamente() {
  while (true) {
    try {
      const caminhoAudio = await gravarTrecho(duracaoGravacao);
      const texto = await transcrever(groq, caminhoAudio);

      if (texto && texto.trim().length > 8) {
        console.log('Ouvido:', texto);
        adicionarAoHistorico('user', `${STREAMER_NOME} disse em voz alta: "${texto}"`);

        if (Math.random() < 0.4 && botsAtivos.length > 0) {
          const escolhido = botsAtivos[Math.floor(Math.random() * botsAtivos.length)];
          await escolhido.enviarMensagemEspontanea(texto);
        }
      }
    } catch (err) {
      console.error('Erro no ciclo de escuta:', err.message);
    }
  }
}

if (escutaAtiva) {
  console.log(`Escuta de voz ativada. Gravando trechos de ${duracaoGravacao}s.`);
  escutarContinuamente();
}