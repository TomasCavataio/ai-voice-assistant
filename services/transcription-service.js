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
    // Set up connection to Deepgram with API key
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

    // Configure live transcription settings
    this.dgConnection = deepgram.listen.live({
      encoding: 'mulaw',             // Audio encoding type
      sample_rate: '8000',           // Phone call quality
      model: 'nova-2',               // Deepgram model to use
      punctuate: true,               // Add punctuation
      interim_results: true,         // Get partial results
      endpointing: 200,              // Detect speech endings
      utterance_end_ms: 1000,         // Wait time for utterance end
      language: 'es'            // Language for transcription
    });

    this.finalResult = '';           // Store complete transcription
    this.speechFinal = false;        // Track if speaker has finished naturally

    // When connection opens, set up all event handlers
    this.dgConnection.on(LiveTranscriptionEvents.Transcript, (transcriptionEvent) => {
      try {
        // Limpiar cualquier timeout pendiente
        if (this.transcriptionTimeout) {
          clearTimeout(this.transcriptionTimeout);
        }

        const alternatives = transcriptionEvent.channel?.alternatives;
        let text = alternatives?.[0]?.transcript || '';

        // Si es una transcripción final y hay texto
        if (transcriptionEvent.is_final === true && text.trim().length > 0) {
          this.finalResult += ` ${text}`;

          // Si el hablante hizo una pausa natural
          if (transcriptionEvent.speech_final === true) {
            this.speechFinal = true;
            this.emit('transcription', this.finalResult.trim());
            this.finalResult = '';
          } else {
            this.speechFinal = false;

            // Configurar un timeout de seguridad (3 segundos)
            this.transcriptionTimeout = setTimeout(() => {
              if (this.finalResult.trim().length > 0) {
                logger.warn('Timeout de transcripción activado, enviando resultado parcial');
                this.emit('transcription', this.finalResult.trim());
                this.finalResult = '';
              }
            }, 3000);
          }
        } else if (text.trim().length > 0) {
          // Emitir resultados interinos para retroalimentación en tiempo real
          this.emit('utterance', text);
        }
      } catch (err) {
        logger.error(`Error procesando transcripción: ${err.message}`);
      }
    });
  }

  // Send audio data to Deepgram for transcription
  send(payload) {
    if (this.dgConnection.getReadyState() === 1) {  // Check if connection is open
      this.dgConnection.send(Buffer.from(payload, 'base64'));
    }
  }
}

module.exports = { TranscriptionService };