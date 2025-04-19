const { Buffer } = require('node:buffer');
const EventEmitter = require('events');
const gTTS = require('gtts');

class TextToSpeechService extends EventEmitter {
  constructor() {
    super();
    this.nextExpectedIndex = 0;
    this.speechBuffer = {};
  }

  async generate(gptReply, interactionCount) {
    const { partialResponseIndex, partialResponse } = gptReply;
    if (!partialResponse) return;

    try {
      // Crea el objeto gtts para español
      const gtts = new gTTS(partialResponse, 'es');
      // Genera el audio en un buffer
      gtts.stream().on('data', (chunk) => {
        // Puedes acumular los chunks si lo deseas
        if (!this.speechBuffer[partialResponseIndex]) this.speechBuffer[partialResponseIndex] = [];
        this.speechBuffer[partialResponseIndex].push(chunk);
      }).on('end', () => {
        const audioBuffer = Buffer.concat(this.speechBuffer[partialResponseIndex]);
        const base64String = audioBuffer.toString('base64');
        this.emit('speech', partialResponseIndex, base64String, partialResponse, interactionCount);
        delete this.speechBuffer[partialResponseIndex];
      }).on('error', (err) => {
        console.error('gTTS error:', err);
      });
    } catch (err) {
      console.error('Error occurred in TextToSpeech service', err);
    }
  }
}

module.exports = { TextToSpeechService };
