const { ElevenLabsClient } = require('elevenlabs');
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');

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

      // Generar audio en formato correcto para Twilio
      const audio = await this.client.generate({
        voice: this.voiceId,
        text: cleanText,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.92
        }
      });

      // Convertir a formato compatible con Twilio (MULAW 8kHz)
      const base64String = Buffer.from(audio).toString('base64');

      this.emit('speech', null, base64String, cleanText, interactionCount);

    } catch (error) {
      console.error(`Error ElevenLabs: ${error.message}`.red);
      this.emit('speech', null, '', 'Error de audio', interactionCount);
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
