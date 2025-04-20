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
    this.isPaused = false; // <-- Nuevo: permite pausar el STT
    this.dgConnection = deepgram.listen.live({
      encoding: 'mulaw',
      sample_rate: 8000,
      model: 'nova-2',
      punctuate: true,
      interim_results: true,
      endpointing: 150,
      utterance_end_ms: 1000,
      language: 'es'
    });

    this.partialText = '';
    this.transcriptionTimeout = null;

    this.dgConnection.on(LiveTranscriptionEvents.Transcript, (event) => {
      try {
        if (this.isPaused) return; // <-- NUEVO: Ignora eventos si está pausado

        const text = event.channel?.alternatives?.[0]?.transcript?.trim() || '';
        const isFinal = event.is_final === true;
        const isSpeechFinal = event.speech_final === true;

        if (!text) return;

        logger.debug(`Evento recibido (${isFinal ? 'FINAL' : 'interino'}): ${text}`);

        if (this.transcriptionTimeout) clearTimeout(this.transcriptionTimeout);

        if (isFinal && isSpeechFinal) {
          logger.info('Transcripción final confirmada.');
          this.emit('transcription', text);
          this.partialText = '';
          return;
        }

        if (isFinal && !isSpeechFinal) {
          logger.debug('Texto parcial final confirmado, esperando más...');
          this.partialText += ' ' + text;
          this.resetTimeout();
          return;
        }

        if (!isFinal && pareceFraseCompleta(text)) {
          logger.info('Frase interina parece completa, se emite tempranamente.');
          this.emit('transcription', text);
          this.partialText = '';
          return;
        }

        if (!isFinal && !this.partialText) {
          logger.debug('Texto parcial nuevo, iniciando acumulación temprana.');
          this.partialText = text;
          this.resetTimeout(300);
        }

      } catch (err) {
        logger.error(`Error procesando transcripción: ${err.message}`);
      }
    });

    this.dgConnection.on('error', (err) => {
      logger.error(`Deepgram error: ${err.message}`);
    });
  }

  send(payload) {
    if (this.isPaused) return; // <-- NUEVO: No enviar audio si está pausado
    if (this.dgConnection.getReadyState() === 1) {
      this.dgConnection.send(Buffer.from(payload, 'base64'));
    }
  }

  pause() {
    logger.info('🛑 Pausando transcripción');
    this.isPaused = true;
  }

  resume() {
    logger.info('▶️ Reanudando transcripción');
    this.isPaused = false;
  }

  resetTimeout(ms = 500) {
    if (this.transcriptionTimeout) clearTimeout(this.transcriptionTimeout);

    this.transcriptionTimeout = setTimeout(() => {
      if (this.partialText?.trim()) {
        logger.warn(`Timeout (${ms}ms) activado, emitiendo acumulado: "${this.partialText.trim()}"`);
        this.emit('transcription', this.partialText.trim());
        this.partialText = '';
      }
    }, ms);
  }

  finish() {
    if (this.dgConnection) {
      this.dgConnection.finish();
    }
  }
}

// Heurística para detectar frases completas sin puntuación final explícita
function pareceFraseCompleta(text) {
  const trimmed = text.trim();
  return trimmed.length > 10 && (
    /[.?!,;:]$/.test(trimmed) ||
    (trimmed.split(' ').length >= 6 && /^[A-ZÁÉÍÓÚÜÑ]/.test(trimmed))
  );
}

module.exports = { TranscriptionService };
