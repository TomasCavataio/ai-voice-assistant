const { ElevenLabsClient } = require('elevenlabs');
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');

// Añadir logger al inicio del archivo
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
    this.voiceId = 'EXAVITQu4vr4xnSDxMaL';
    this.currentGenerationId = null; // Token único por generación
  }

  async generate(gptReply, interactionCount) {
    try {
      if (!gptReply?.partialResponse) {
        throw new Error('Texto no recibido para TTS');
      }

      const cleanText = this.normalizeText(gptReply.partialResponse);
      if (!cleanText.trim()) {
        logger.warn('Texto vacío después de normalización, omitiendo TTS');
        return;
      }

      logger.info(`Generando audio para texto: ${cleanText.substring(0, 50)}...`);

      // Generar nuevo token de sesión
      const generationId = Date.now();
      this.currentGenerationId = generationId;

      const audioResult = await this.client.generate({
        voice: this.voiceId,
        text: cleanText,
        model_id: "eleven_multilingual_v2",
        output_format: 'ulaw_8000',
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.92
        }
      }, {
        headers: {
          'xi-api-key': process.env.ELEVEN_LABS_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/x-mulaw'
        },
        responseType: 'arraybuffer'
      });

      // Cancelado durante la espera de respuesta
      if (generationId !== this.currentGenerationId) {
        logger.warn('Generación de audio abortada por nueva petición');
        return;
      }

      const audioBuffer = await this.streamToBuffer(audioResult);

      if (!audioBuffer || audioBuffer.length < 100) {
        logger.warn(`Audio generado demasiado pequeño (${audioBuffer?.length || 0} bytes), posible error`);
        return;
      }

      const base64String = audioBuffer.toString('base64');
      logger.info(`Audio generado correctamente: ${audioBuffer.length} bytes`);

      if (generationId === this.currentGenerationId) {
        this.emit('speech', null, base64String, cleanText, interactionCount);
      } else {
        logger.warn('Se generó audio pero fue descartado por interrupción');
      }

    } catch (error) {
      logger.error(`Error ElevenLabs: ${error.message}`);
      logger.error(`Stack: ${error.stack}`);
    }
  }

  abortCurrent() {
    logger.info('Abortando generación de TTS actual');
    this.currentGenerationId = null;
  }

  normalizeText(text) {
    return text
      .replace(/(\d+)/g, match => new Intl.NumberFormat('es-ES').format(match))
      .replace(/•/g, ', ')
      .replace(/\.{2,}/g, ', ');
  }

  async streamToBuffer(stream) {
    try {
      logger.debug(`Tipo de respuesta de ElevenLabs: ${typeof stream}`);

      if (typeof stream.getReader === 'function') {
        const reader = stream.getReader();
        const chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        return Buffer.concat(chunks);
      } else if (stream.buffer || stream.data || stream.audio) {
        const data = stream.buffer || stream.data || stream.audio;
        return Buffer.from(data);
      } else if (typeof stream.arrayBuffer === 'function') {
        const arrayBuffer = await stream.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } else if (Buffer.isBuffer(stream)) {
        return stream;
      } else if (typeof stream === 'string') {
        return Buffer.from(stream);
      } else {
        logger.warn(`Tipo de respuesta desconocido de ElevenLabs: ${typeof stream}`);
        try {
          return Buffer.from(JSON.stringify(stream));
        } catch (e) {
          throw new Error(`No se pudo convertir la respuesta a buffer: ${e.message}`);
        }
      }
    } catch (error) {
      logger.error(`Error en streamToBuffer: ${error.message}`);
      throw error;
    }
  }
}

module.exports = { TextToSpeechService };