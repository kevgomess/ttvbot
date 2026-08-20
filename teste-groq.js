// teste-groq.js
// Script simples pra testar SÓ a conexão com a API da Groq, sem o resto do bot.
// Rode com: node teste-groq.js

require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

console.log('Chave carregada?', process.env.GROQ_API_KEY ? 'Sim, começa com ' + process.env.GROQ_API_KEY.slice(0, 8) : 'NÃO — .env não tem GROQ_API_KEY');
console.log('Testando conexão com a Groq...');

const inicio = Date.now();

groq.chat.completions.create({
  model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
  max_tokens: 20,
  messages: [{ role: 'user', content: 'Diga só "funcionando" e mais nada.' }],
})
  .then((resposta) => {
    console.log(`Respondeu em ${Date.now() - inicio}ms`);
    console.log('Resposta:', resposta.choices[0].message.content);
  })
  .catch((err) => {
    console.log(`Deu erro depois de ${Date.now() - inicio}ms`);
    console.error('ERRO:', err.message);
    if (err.status) console.error('Status HTTP:', err.status);
  });

// Se depois de ~15s nada aparecer (nem resposta, nem erro), é bloqueio de rede/firewall.
setTimeout(() => {
  console.log('--- Se você está vendo isso e nada mais apareceu acima, a conexão está travada (rede/firewall). ---');
}, 15000);
