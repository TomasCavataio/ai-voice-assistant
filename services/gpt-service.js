require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');

const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()}: ${msg}`.blue),
  error: (msg) => console.log(`[ERROR] ${new Date().toISOString()}: ${msg}`.red),
  warn: (msg) => console.log(`[WARN] ${new Date().toISOString()}: ${msg}`.yellow),
  debug: (msg) => console.log(`[DEBUG] ${new Date().toISOString()}: ${msg}`.dim)
};

class GptService extends EventEmitter {
  constructor() {
    super();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: "https://api.perplexity.ai"
    });

    this.partialResponseIndex = 0;
    this.userContext = [
      {
        role: 'system',
        content: `Eres un asistente útil para el negocio de prueba de Tomas y Regina. Responde SIEMPRE en español, aunque el usuario escriba en otro idioma. • Mantén tus respuestas breves pero amigables. No hagas más de 1 pregunta a la vez. • Si te preguntan sobre servicios que no están listados abajo, explica amablemente que no ofrecemos ese servicio. Información clave: • Horario: lunes a viernes de 9 AM a 5 PM • Dirección: 123 Calle Argentina Griega, Madrid • Servicios: servicio de diseño web, asesoramiento web, creación y mantenimiento de software a medida, paginas web en general • callSid: PLACEHOLDER`
      }
    ];
  }

  setCallSid(callSid) {
    this.userContext[0].content = this.userContext[0].content.replace('PLACEHOLDER', callSid);
  }

  updateUserContext(text) {
    // Limitar a system + 3 últimos intercambios (máximo 5)
    if (this.userContext.length >= 5) {
      this.userContext.splice(1, 2);
    }

    const lastRole = this.userContext.slice(-1)[0]?.role;
    const newRole = lastRole === 'user' ? 'assistant' : 'user';
    this.userContext.push({ role: newRole, content: text });
  }

  async generateResponse(text, interactionCount, role = 'user') {
    if (!text || typeof text !== 'string') {
      logger.error('Texto inválido para GPT');
      return;
    }

    this.updateUserContext(text);

    try {
      const stream = await this.openai.chat.completions.create({
        model: 'sonar-pro',
        messages: this.userContext,
        stream: true,
        temperature: 0.7,
        max_tokens: 150
      });

      let completeResponse = '';
      let partialResponse = '';

      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content || '';
        const finishReason = chunk.choices?.[0]?.finish_reason;

        completeResponse += content;
        partialResponse += content;

        // Si termina la frase, lo emitimos
        if (/[•.,;!?]$/.test(content.trim()) || finishReason === 'stop') {
          const gptReply = {
            partialResponseIndex: this.partialResponseIndex,
            partialResponse: partialResponse.trim()
          };
          this.emit('gptreply', gptReply, interactionCount);
          this.partialResponseIndex++;
          partialResponse = '';
        }
      }

      this.updateUserContext(completeResponse);
      this.emit('endofreply', interactionCount); // Señal clara de fin

    } catch (error) {
      logger.error(`Error GPT: ${error.message}`);
      this.emit('gptreply', {
        partialResponse: "Disculpa, ¿podrías repetir?",
        partialResponseIndex: null
      }, interactionCount);
    }
  }
}

module.exports = { GptService };
