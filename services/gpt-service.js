// For colored console logs and event handling
require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');

class GptService extends EventEmitter {
  // Set up the AI assistant with its initial personality and knowledge
  constructor() {
    super();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY, // Tu API key de Perplexity (pplx-...)
      baseURL: "https://api.perplexity.ai" // <-- ¡URL de Perplexity!
    });
    this.userContext = [
      {
        'role': 'system',
        'content': `Eres un asistente útil para el negocio de prueba de Tomas y Regina. Responde SIEMPRE en español, aunque el usuario escriba en otro idioma. • Mantén tus respuestas breves pero amigables. No hagas más de 1 pregunta a la vez. • Si te preguntan sobre servicios que no están listados abajo, explica amablemente que no ofrecemos ese servicio. Información clave: • Horario: lunes a viernes de 9 AM a 5 PM • Dirección: 123 Calle Argentina Griega, Madrid • Servicios: servicio de diseño web, asesoramiento web, creación y mantenimiento de software a medida, paginas web en general`
      },
      { 'role': 'assistant', 'content': 'Bienvenido al negocio de prueba de Tomas y Regina • ¿Cómo te puedo ayudar?' },
    ],
      this.partialResponseIndex = 0;    // Tracks pieces of response for order
  }

  // Store the call's unique ID
  setCallSid(callSid) {
    this.userContext.push({ 'role': 'system', 'content': `callSid: ${callSid}` });
  }

  // Add new messages to conversation history
  updateUserContext(name, role, text) {
    if (name !== 'user') {
      this.userContext.push({ 'role': role, 'name': name, 'content': text });
    } else {
      this.userContext.push({ 'role': role, 'content': text });
    }
  }

  // Main function that handles getting responses from GPT
  async completion(text, interactionCount, role = 'user', name = 'user') {
    // Add user's message to conversation history
    this.updateUserContext(name, role, text);

    // Get streaming response from GPT
    const stream = await this.openai.chat.completions.create({
      model: 'sonar-pro', // Modelo de Perplexity
      messages: this.userContext,
      stream: true,
    });


    // Track both complete response and chunks for speaking
    let completeResponse = '';
    let partialResponse = '';

    // Process each piece of GPT's response as it comes
    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      let finishReason = chunk.choices[0].finish_reason;

      completeResponse += content;
      partialResponse += content;

      // When we hit a pause marker (•) or the end, send that chunk for speech
      if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
        const gptReply = {
          partialResponseIndex: this.partialResponseIndex,
          partialResponse
        };
        this.emit('gptreply', gptReply, interactionCount);
        this.partialResponseIndex++;
        partialResponse = '';
      }
    }

    // Add GPT's complete response to conversation history
    this.userContext.push({ 'role': 'assistant', 'content': completeResponse });
    console.log(`GPT -> user context length: ${this.userContext.length}`.green);
  }
}

module.exports = { GptService };