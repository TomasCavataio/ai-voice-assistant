const { ElevenLabs } = require('elevenlabs-node');
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');

class TextToSpeechService extends EventEmitter {
  constructor() {
    super();
    this.eleven = new ElevenLabs({
      apiKey: process.env.ELEVEN_LABS_KEY,
      voiceId: 'MF3mGyEYCl7XYWbV9V6O', // Voz "Josh" - Español neutro mejorado
      modelId: 'eleven_multilingual_v2',
      latencyOptimization: 4 // Priorizar velocidad para respuestas en tiempo real
    });
  }

  async generate(gptReply, interactionCount) {
    const { partialResponse } = gptReply;

    try {
      // 1. Validar y normalizar texto
      const cleanText = this.normalizeText(partialResponse);

      // 2. Configuración avanzada para español
      const audioBuffer = await this.eleven.generate({
        text: cleanText,
        voiceSettings: {
          stability: 0.35, // Más variación emocional
          similarity_boost: 0.92, // Mayor claridad
          style: 0.15, // Entonación conversacional
          use_speaker_boost: true
        },
        model: {
          model_id: 'eleven_turbo_v2', // Modelo rápido para respuestas en tiempo real
          custom_pronunciations: {
            'Tomas': 'TO-mas', // Corrección de pronunciación
            'Regina': 're-HEE-na'
          }
        },
        audioConfig: {
          encoding: 'MULAW', // Formato requerido por Twilio
          sampleRate: 8000, // 8kHz para llamadas telefónicas
          speed: 0.95 // Velocidad ligeramente reducida
        }
      });

      // 3. Codificación compatible con WebSocket
      const base64String = Buffer.from(audioBuffer).toString('base64');

      this.emit('speech', null, base64String, cleanText, interactionCount);

    } catch (error) {
      console.error(`Error ElevenLabs: ${error.message}`.red);
    }
  }

  normalizeText(text) {
    // Convertir números y abreviaturas a palabras
    return text
      .replace(/(\d+)/g, match => new Intl.NumberFormat('es-ES').format(match))
      .replace(/•/g, ', ') // Reemplazar bullets por pausas
      .replace(/\.{2,}/g, ', '); // Elipsis a pausas normales
  }

}

module.exports = { TextToSpeechService };