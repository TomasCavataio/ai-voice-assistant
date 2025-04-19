const { ElevenLabsClient } = require('elevenlabs');
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');


const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()}: ${msg}`.blue),
  error: (msg) => console.log(`[ERROR] ${new Date().toISOString()}: ${msg}`.red),
  warn: (msg) => console.log(`[WARN] ${new Date().toISOString()}: ${msg}`.yellow),
  debug: (msg) => console.log(`[DEBUG] ${new Date().toISOString()}: ${msg}`.dim)
};


class TextToSpeechService extends EventEmitter {
  constructor() {
    super();
    this.client = new ElevenLabsClient({
      apiKey: process.env.ELEVEN_LABS_KEY
    });
    this.voiceId = 'EXAVITQu4vr4xnSDxMaL'; // Voz "Bella"
  }

  async generate(gptReply, interactionCount) {
    try {
      if (!gptReply?.partialResponse) {
        throw new Error('Texto no recibido para TTS');
      }

      // Verificar texto vacío
      const cleanText = this.normalizeText(gptReply.partialResponse);
      if (!cleanText.trim()) {
        logger.warn('Texto vacío después de normalización, omitiendo TTS');
        return;
      }

      logger.info(`Generando audio para texto: ${cleanText.substring(0, 50)}...`);

      const audioStream = await this.client.generate({
        voice: this.voiceId,
        text: cleanText,
        model_id: "eleven_multilingual_v2",
        output_format: 'ulaw_8000',
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.92
        }
      });

      const audioBuffer = await this.streamToBuffer(audioStream);

      // Verificar tamaño del buffer para asegurar contenido
      if (!audioBuffer || audioBuffer.length < 100) {
        logger.warn(`Audio generado demasiado pequeño (${audioBuffer?.length || 0} bytes), posible error`);
        return;
      }

      const base64String = audioBuffer.toString('base64');
      this.emit('speech', null, base64String, cleanText, interactionCount);

    } catch (error) {
      logger.error(`Error ElevenLabs: ${error.message}`);
      // No emitir nada para evitar enviar audio inválido
    }
  }

  normalizeText(text) {
    return text
      .replace(/(\d+)/g, match => new Intl.NumberFormat('es-ES').format(match))
      .replace(/•/g, ', ')
      .replace(/\.{2,}/g, ', ');
  }
}

module.exports = { TextToSpeechService };
