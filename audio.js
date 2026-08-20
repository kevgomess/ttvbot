// audio.js
// Grava pequenos trechos do microfone usando naudiodon (binding nativo do
// PortAudio via npm, sem precisar instalar programa externo tipo ffmpeg)
// e transcreve usando o Whisper da Groq (gratuito dentro do limite diário).

const portAudio = require('naudiodon');
const wav = require('wav');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ID do dispositivo de entrada (microfone). -1 = dispositivo padrão do sistema.
// Se o padrão não funcionar, rode o comando abaixo pra listar os dispositivos
// disponíveis e escolher o ID certo:
//   node -e "console.log(require('naudiodon').getDevices())"
// Depois defina AUDIO_DEVICE_ID no .env com o número (id) do seu microfone.
const AUDIO_DEVICE_ID = process.env.AUDIO_DEVICE_ID
  ? Number(process.env.AUDIO_DEVICE_ID)
  : -1;

const SAMPLE_RATE = 16000; // formato que o Whisper prefere

/**
 * Grava um trecho de áudio do microfone por N segundos e salva num arquivo temporário WAV.
 * Retorna o caminho do arquivo gravado.
 */
function gravarTrecho(duracaoSegundos) {
  return new Promise((resolve, reject) => {
    const caminhoSaida = path.join(os.tmpdir(), `trecho-${Date.now()}.wav`);

    const fileWriter = new wav.FileWriter(caminhoSaida, {
      channels: 1,
      sampleRate: SAMPLE_RATE,
      bitDepth: 16,
    });

    let ai;
    try {
      ai = new portAudio.AudioIO({
        inOptions: {
          channelCount: 1,
          sampleFormat: portAudio.SampleFormat16Bit,
          sampleRate: SAMPLE_RATE,
          deviceId: AUDIO_DEVICE_ID,
          closeOnError: true,
        },
      });
    } catch (err) {
      reject(new Error(`Não foi possível abrir o microfone via naudiodon: ${err.message}`));
      return;
    }

    let finalizado = false;
    const finalizar = (erro) => {
      if (finalizado) return;
      finalizado = true;
      if (erro) reject(erro);
      else resolve(caminhoSaida);
    };

    ai.on('error', (err) => finalizar(new Error(`Erro no stream de áudio: ${err.message}`)));

    fileWriter.on('error', (err) => finalizar(new Error(`Erro ao gravar o arquivo WAV: ${err.message}`)));
    fileWriter.on('finish', () => finalizar(null));

    ai.pipe(fileWriter);
    ai.start();

    setTimeout(() => {
      ai.quit(); // para a captura; isso deve fechar o pipe e disparar 'finish' no fileWriter
    }, duracaoSegundos * 1000);
  });
}

/**
 * Envia o arquivo de áudio para o Whisper da Groq e retorna o texto transcrito.
 * Remove o arquivo temporário depois.
 */
async function transcrever(groqClient, caminhoAudio) {
  try {
    const resposta = await groqClient.audio.transcriptions.create({
      file: fs.createReadStream(caminhoAudio),
      model: 'whisper-large-v3-turbo',
      language: 'pt',
      response_format: 'text',
    });

    // a lib retorna string direto quando response_format é 'text'
    return typeof resposta === 'string' ? resposta : resposta.text;
  } finally {
    fs.unlink(caminhoAudio, () => {}); // limpeza, ignora erro se já não existir
  }
}

module.exports = { gravarTrecho, transcrever };
