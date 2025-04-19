// Import required packages and services
require('dotenv').config();
require('colors');
const express = require('express');
const ExpressWs = require('express-ws');
const { GptService } = require('./services/gpt-service');
const { StreamService } = require('./services/stream-service');
const { TranscriptionService } = require('./services/transcription-service');
const { TextToSpeechService } = require('./services/tts-service');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

// Set up Express with WebSocket support
const app = express();
ExpressWs(app);
const PORT = process.env.PORT || 3000;


const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()}: ${msg}`.blue),
  error: (msg) => console.log(`[ERROR] ${new Date().toISOString()}: ${msg}`.red),
  warn: (msg) => console.log(`[WARN] ${new Date().toISOString()}: ${msg}`.yellow),
  debug: (msg) => console.log(`[DEBUG] ${new Date().toISOString()}: ${msg}`.dim)
};

// Handle incoming calls from Twilio
app.post('/incoming', (req, res) => {
  try {
    const response = new VoiceResponse();
    const connect = response.connect();
    // Tell Twilio where to connect the call's media stream
    connect.stream({ url: `wss://${process.env.SERVER}/connection` });
    res.type('text/xml');
    res.end(response.toString());
  } catch (err) {
    console.log(err);
  }
});

// Handle WebSocket connection for the call's audio
app.ws('/connection', (ws) => {
  try {
    let streamSid;
    let callSid;
    const gptService = new GptService();
    const streamService = new StreamService(ws, {
      maxBufferSize: 5,       // ← Nuevo parámetro
      highWaterMark: 3        // ← Control de backpressure
    });
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService();
    let marks = [];
    let interactionCount = 0;

    let heartbeatInterval;

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
      logger.debug('Heartbeat recibido del cliente');
    });

    heartbeatInterval = setInterval(() => {
      if (ws.isAlive === false) {
        logger.warn('Cliente inactivo, cerrando conexión');
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    }, 30000);

    ws.on('close', () => {
      clearInterval(heartbeatInterval);
      logger.info(`Conexión cerrada para ${streamSid}`);
      if (transcriptionService.dgConnection) {
        transcriptionService.dgConnection.finish();
      }
      streamService.pendingQueue = [];
    });

    // En el evento 'start'
    ws.on('message', function message(data) {
      const msg = JSON.parse(data);

      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        streamService.setStreamSid(streamSid);
        gptService.setCallSid(callSid);

        // Retrasar mensaje inicial para estabilidad
        setTimeout(() => {
          ttsService.generate({
            partialResponseIndex: null,
            partialResponse: 'Bienvenido al negocio de prueba de Tomás y Regina. ¿Cómo le puedo ayudar?'
          }, 0);
        }, 200); // ← 200ms para estabilizar conexión
      }
      else if (msg.event === 'media') {
        // Received audio from caller - send to transcription
        transcriptionService.send(msg.media.payload);
      }
      else if (msg.event === 'mark') {
        // Audio piece finished playing
        const label = msg.mark.name;
        console.log(`Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red);
        marks = marks.filter(m => m !== msg.mark.name);
      }
      else if (msg.event === 'stop') {
        marks = []; // ← Limpiar marcas al finalizar
        console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
      }
    });

    // Handle interruptions (caller speaking while assistant is)
    transcriptionService.on('utterance', async (text) => {
      if (marks.length > 0 && text?.length > 5) {
        console.log('Twilio -> Interruption, Clearing stream'.red);
        ws.send(
          JSON.stringify({
            streamSid,
            event: 'clear',
          })
        );
      }
    });

    // Process transcribed text through GPT
    transcriptionService.on('transcription', async (text) => {
      console.log(`Interaction ${interactionCount} – STT -> GPT: ${text}`.yellow);
      gptService.completion(text, interactionCount); // Sin pasar 'user' o 'name'
      interactionCount += 1;
    });

    // Send GPT's response to text-to-speech
    gptService.on('gptreply', async (gptReply, icount) => {
      console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green);
      ttsService.generate(gptReply, icount);
    });

    // Send converted speech to caller
    ttsService.on('speech', (responseIndex, audio, label, icount) => {
      console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);
      streamService.buffer(responseIndex, audio);
    });

    // Track when audio pieces are sent
    streamService.on('audiosent', (markLabel) => {
      console.log(`Audio enviado: ${markLabel.slice(0, 8)}...`.dim);
      marks.push(markLabel);
    });

  } catch (err) {
    console.error('Error crítico en WebSocket:', err);
    ws.close(); // ← Cierre forzoso ante errores graves
  }
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});