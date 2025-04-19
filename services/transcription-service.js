// Required libraries for colored logs, Deepgram SDK, and event handling
require('colors');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');

const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()}: ${msg}`.blue),
  error: (msg) => console.log(`[ERROR] ${new Date().toISOString()}: ${msg}`.red),
  warn: (msg) => console.log(`[WARN] ${new Date().toISOString()}: ${msg}`.yellow),
  debug: (msg) => console.log(`[DEBUG] ${new Date().toISOString()}: ${msg}`.dim)
};

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

    this.dgConnection = deepgram.listen.live({
      encoding: 'mulaw',
      sample_rate: '8000',
      model: 'nova-2',
      punctuate: true,
      interim_results: true,
      endpointing: 150,
      utterance_end_ms: 1000, // No podemos bajarlo más
      language: 'es'
    });

    this.finalResult = '';
    this.transcriptionTimeout = null;

    this.dgConnection.on(LiveTranscriptionEvents.Transcript, (event) => {
      try {
        const text = event.channel?.alternatives?.[0]?.transcript?.trim() || '';
        const isFinal = event.is_final === true;
        const isSpeechFinal = event.speech_final === true;

        if (this.transcriptionTimeout) clearTimeout(this.transcriptionTimeout);

        if (isFinal && text) {
          this.finalResult += ` ${text}`;

          if (isSpeechFinal) {
            this.emit('transcription', this.finalResult.trim());
            this.finalResult = '';
          } else {
            // Seguridad: no esperamos 3s, bajamos a 500ms
            this.transcriptionTimeout = setTimeout(() => {
              if (this.finalResult.trim()) {
                logger.warn('Timeout rápido activado, enviando transcripción acumulada.');
                this.emit('transcription', this.finalResult.trim());
                this.finalResult = '';
              }
            }, 500);
          }
        } else if (text && pareceFraseCompleta(text)) {
          logger.debug('Frase interina parece completa, se emite tempranamente.');
          this.emit('transcription', text);
        } else {
          // Emitir interino de forma más frecuente
          this.transcriptionTimeout = setTimeout(() => {
            if (this.finalResult.trim()) {
              logger.warn('Timeout rápido activado, enviando transcripción acumulada.');
              this.emit('transcription', this.finalResult.trim());
              this.finalResult = '';
            }
          }, 250);
        }
      } catch (err) {
        logger.error(`Error procesando transcripción: ${err.message}`);
      }
    });
  }

  send(payload) {
    if (this.dgConnection.getReadyState() === 1) {
      this.dgConnection.send(Buffer.from(payload, 'base64'));
    }
  }
}

// Heurística básica para detectar si una frase interina ya es válida
function pareceFraseCompleta(text) {
  return text.length > 20 && /[.?!]$/.test(text.trim());
}

module.exports = { TranscriptionService };
