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
    return new Promise((resolve) => {
      // Validar tipo de audio y convertirlo a Base64
      let audioPayload;
      if (audio instanceof Buffer) {
        audioPayload = audio.toString('base64');
      } else if (typeof audio === 'string') {
        audioPayload = audio;
      } else {
        console.error('Formato de audio inválido:', typeof audio);
        return resolve();
      }

      this.ws.send(JSON.stringify({
        streamSid: this.streamSid,
        event: 'media',
        media: {
          payload: audioPayload,
          // Añadir especificaciones de formato para Twilio
          codec: 'audio/x-mulaw',
          sampleRate: 8000
        }
      }), (err) => {
        if (err) {
          console.error('Error enviando audio:'.red, err.message);
          this.pendingQueue = []; // Limpiar cola ante errores
        }
        this.sendMark();
        resolve();
      });
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
