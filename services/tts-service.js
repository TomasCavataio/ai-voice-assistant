const ElevenLabs = require("elevenlabs-node");
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');

class TextToSpeechService extends EventEmitter {
  constructor() {
    super();
    this.tts = new ElevenLabs({
      apiKey: process.env.ELEVEN_LABS_KEY,
      voiceId: 'EXAVITQu4vr4xnSDxMaL',
      modelId: 'eleven_multilingual_v2'
    });
  }

  async generate(gptReply, interactionCount) {
    const { partialResponse } = gptReply;

    try {
      const cleanText = this.normalizeText(partialResponse);

      const audioBuffer = await this.tts.textToSpeech({
        fileName: `audio_${Date.now()}.mp3`, // Nombre único para cada archivo
        textInput: cleanText,
        voiceId: 'EXAVITQu4vr4xnSDxMaL',
        voiceSettings: { stability: 0.35, similarity_boost: 0.92 }
      });

      const base64String = Buffer.from(audioBuffer).toString('base64');
      this.emit('speech', null, base64String, cleanText, interactionCount);

    } catch (error) {
      console.error(`Error ElevenLabs: ${error.message}`.red);
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