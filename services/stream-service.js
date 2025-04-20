const EventEmitter = require('events');
const uuid = require('uuid');

const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()}: ${msg}`.blue),
  error: (msg) => console.log(`[ERROR] ${new Date().toISOString()}: ${msg}`.red),
  warn: (msg) => console.log(`[WARN] ${new Date().toISOString()}: ${msg}`.yellow),
  debug: (msg) => console.log(`[DEBUG] ${new Date().toISOString()}: ${msg}`.dim)
};

class StreamService extends EventEmitter {
  constructor(websocket) {
    super();
    this.ws = websocket;
    this.streamSid = '';
    this.expectedAudioIndex = 0;
    this.audioBuffer = new Map();
    this.pendingQueue = [];
    this.isSending = false;
    this.aborted = false;
  }

  setStreamSid(streamSid) {
    this.streamSid = streamSid;
  }

  buffer(index, audio) {
    if (this.aborted) {
      logger.warn('StreamService está en modo abortado, ignorando chunk.');
      return;
    }

    if (index === null || index === this.expectedAudioIndex) {
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

        if (this.aborted) {
          logger.warn('Abort detectado durante envío. Se detiene procesamiento.');
          break;
        }

        await this.sendAudioWithBackpressure(chunk);
        this.expectedAudioIndex++;
        this.checkBufferedChunks();
      }

      this.isSending = false;
    }
  }

  checkBufferedChunks() {
    while (this.audioBuffer.has(this.expectedAudioIndex)) {
      const nextChunk = this.audioBuffer.get(this.expectedAudioIndex);
      this.audioBuffer.delete(this.expectedAudioIndex);
      this.pendingQueue.push(nextChunk);
    }
  }

  async sendAudioWithBackpressure(audio) {
    return new Promise((resolve) => {
      if (!audio || (!Buffer.isBuffer(audio) && typeof audio !== 'string')) {
        logger.error('Formato de audio inválido o vacío');
        return resolve();
      }

      if (this.ws.readyState !== 1) {
        logger.error('WebSocket no está abierto. Estado: ' + this.ws.readyState);
        return resolve();
      }

      const payload = Buffer.isBuffer(audio) ? audio.toString('base64') : audio;

      this.ws.send(JSON.stringify({
        event: 'media',
        streamSid: this.streamSid,
        media: { payload }
      }), (err) => {
        if (err) {
          logger.error(`Error enviando audio: ${err.message}`);
        } else {
          this.sendMark();
        }
        resolve(); // continuar pase lo que pase
      });
    });
  }

  sendMark() {
    const markLabel = uuid.v4();
    setTimeout(() => {
      this.ws.send(JSON.stringify({
        streamSid: this.streamSid,
        event: 'mark',
        mark: { name: markLabel }
      }), (err) => {
        if (err) logger.error(`Error enviando mark: ${err.message}`);
      });
      this.emit('audiosent', markLabel);
    }, 50); // Pequeño delay para sincronía Twilio
  }

  abort() {
    logger.warn('StreamService: Aborto solicitado, deteniendo envíos.');
    this.aborted = true;
    this.pendingQueue = [];
    this.audioBuffer.clear();
  }

  resume() {
    logger.info('StreamService: Reanudando envíos de audio.');
    this.aborted = false;
  }
}

module.exports = { StreamService };
