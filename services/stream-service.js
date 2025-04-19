const EventEmitter = require('events');
const uuid = require('uuid');

class StreamService extends EventEmitter {
  constructor(websocket) {
    super();
    this.ws = websocket;
    this.expectedAudioIndex = 0;
    this.audioBuffer = new Map(); // Usar Map para mejor performance
    this.streamSid = '';
    this.isSending = false; // Control de flujo
    this.pendingQueue = []; // Cola de audio
  }

  setStreamSid(streamSid) {
    this.streamSid = streamSid;
  }

  buffer(index, audio) {
    if (index === null) {
      this.sendAudioWithBackpressure(audio);
    } else if (index === this.expectedAudioIndex) {
      this.processAudioChunk(audio);
    } else {
      this.audioBuffer.set(index, audio);
    }
  }

  async processAudioChunk(audio) {
    this.pendingQueue.push(audio);
    if (!this.isSending) {
      this.isSending = true;
      while (this.pendingQueue.length > 0) {
        const chunk = this.pendingQueue.shift();
        await this.sendAudioWithBackpressure(chunk);
        this.expectedAudioIndex++;
        this.checkBufferedChunks();
      }
      this.isSending = false;
    }
  }

  checkBufferedChunks() {
    while (this.audioBuffer.has(this.expectedAudioIndex)) {
      const bufferedAudio = this.audioBuffer.get(this.expectedAudioIndex);
      this.pendingQueue.push(bufferedAudio);
      this.audioBuffer.delete(this.expectedAudioIndex);
    }
  }

  async sendAudioWithBackpressure(audio) {
    return new Promise((resolve, reject) => {
      try {
        // Validación de entrada
        if (!audio || (!Buffer.isBuffer(audio) && typeof audio !== 'string')) {
          logger.error('Formato de audio inválido o vacío');
          return resolve(); // Continuar con el siguiente chunk
        }

        // Verificar estado de la conexión
        if (this.ws.readyState !== 1) {
          logger.error('WebSocket no está abierto, estado: ' + this.ws.readyState);
          return resolve();
        }

        let audioPayload = Buffer.isBuffer(audio) ? audio.toString('base64') : audio;

        this.ws.send(JSON.stringify({
          streamSid: this.streamSid,
          event: 'media',
          media: {
            payload: audioPayload,
            codec: 'audio/x-mulaw',
            sampleRate: 8000
          }
        }), (err) => {
          if (err) {
            logger.error(`Error al enviar audio: ${err.message}`);
            return resolve(); // Continuar a pesar del error
          }
          this.sendMark();
          resolve();
        });
      } catch (err) {
        logger.error(`Error crítico en sendAudioWithBackpressure: ${err.message}`);
        resolve(); // Resolver para no bloquear la cola
      }
    });
  }

  sendMark() {
    const markLabel = uuid.v4();
    setTimeout(() => { // Esperar 50ms para sincronización con Twilio
      this.ws.send(JSON.stringify({
        streamSid: this.streamSid,
        event: 'mark',
        mark: { name: markLabel }
      }), (err) => {
        if (err) console.error('Error enviando mark:', err);
      });
      this.emit('audiosent', markLabel);
    }, 50);
  }
}

module.exports = { StreamService };
