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
    this.voiceId = 'EXAVITQu4vr4xnSDxMaL'; // Voz "Bella"
  }

  async generate(gptReply, interactionCount) {
    try {
      if (!gptReply?.partialResponse) {
        throw new Error('Texto no recibido para TTS');
      }

      // Normalizar texto
      const cleanText = this.normalizeText(gptReply.partialResponse);
      if (!cleanText.trim()) {
        logger.warn('Texto vacío después de normalización, omitiendo TTS');
        return;
      }

      logger.info(`Generando audio para texto: ${cleanText.substring(0, 50)}...`);

      // Inspeccionar estructura de cliente
      logger.debug(`Tipo de cliente ElevenLabs: ${typeof this.client.generate}`);

      // Generar audio en formato compatible con Twilio
      const audioResult = await this.client.generate({
        voice: this.voiceId,
        text: cleanText,
        model_id: "eleven_multilingual_v2",
        output_format: 'ulaw_8000', // Codec específico para Twilio
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.92
        }
      }, {
        // Parámetros adicionales en el headers
        headers: {
          'xi-api-key': process.env.ELEVEN_LABS_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/x-mulaw' // Forzar codec correcto
        },
        responseType: 'arraybuffer' // Recibir datos binarios directamente
      });

      // Registrar información sobre la respuesta
      logger.debug(`Tipo de respuesta de ElevenLabs: ${typeof audioResult}`);
      if (typeof audioResult === 'object') {
        logger.debug(`Propiedades disponibles: ${Object.keys(audioResult).join(', ')}`);
      }

      // Convertir a Buffer
      const audioBuffer = await this.streamToBuffer(audioResult);

      // Verificar tamaño del buffer para asegurar contenido
      if (!audioBuffer || audioBuffer.length < 100) {
        logger.warn(`Audio generado demasiado pequeño (${audioBuffer?.length || 0} bytes), posible error`);
        return;
      }

      logger.info(`Audio generado correctamente: ${audioBuffer.length} bytes`);

      // Codificar en base64
      const base64String = audioBuffer.toString('base64');

      logger.debug(`Audio codificado en base64 (primeros 50 caracteres): ${base64String.substring(0, 50)}...`);

      this.emit('speech', null, base64String, cleanText, interactionCount);

    } catch (error) {
      logger.error(`Error ElevenLabs: ${error.message}`);
      logger.error(`Stack: ${error.stack}`);
      // No emitir nada para evitar enviar audio inválido
    }
  }

  // Función para convertir stream a Buffer - versión actualizada
  async streamToBuffer(stream) {
    try {
      // Verificar qué tipo de objeto es stream
      logger.debug(`Tipo de respuesta de ElevenLabs: ${typeof stream}`);

      // Si es un ReadableStream de fetch API (uso moderno)
      if (typeof stream.getReader === 'function') {
        const reader = stream.getReader();
        const chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        return Buffer.concat(chunks);
      }
      // Si es un objeto con array/buffer directamente
      else if (stream.buffer || stream.data || stream.audio) {
        const data = stream.buffer || stream.data || stream.audio;
        return Buffer.from(data);
      }
      // Si es una respuesta con arrayBuffer() (Fetch API)
      else if (typeof stream.arrayBuffer === 'function') {
        const arrayBuffer = await stream.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
      // Si es un buffer directamente
      else if (Buffer.isBuffer(stream)) {
        return stream;
      }
      // Si es un string (ya codificado en base64 u otro formato)
      else if (typeof stream === 'string') {
        return Buffer.from(stream);
      }
      // Último recurso - intentar convertir objeto a string JSON y luego a buffer
      else {
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
  normalizeText(text) {
    return text
      .replace(/(\d+)/g, match => new Intl.NumberFormat('es-ES').format(match))
      .replace(/•/g, ', ')
      .replace(/\.{2,}/g, ', ');
  }
}

module.exports = { TextToSpeechService };