const express = require('express');
const WebSocket = require('ws');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = 3001;

// Ensure API key is present
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY is not set in .env file");
  // We don't exit here strictly so the server can start, but it won't work without the key.
}

const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

const server = app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (clientWs) => {
  console.log('Client connected to Node.js server');
  let geminiWs = null;

  try {
    geminiWs = new WebSocket(GEMINI_URL);
  } catch (err) {
    console.error("Failed to construct Gemini WebSocket:", err);
    clientWs.close();
    return;
  }

  geminiWs.on('open', () => {
    console.log('Connected to Gemini API');

    // Send initial setup payload
    const setupMessage = {
      setup: {
        // Using "models/gemini-2.0-flash-exp" as it is the standard model for the Multimodal Live API.
        model: "models/gemini-2.0-flash-exp", 
        
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }
          }
        },
        systemInstruction: {
          parts: [
            {
              text: "You are Zubi, a friendly cartoon elephant. A child is talking to you. Keep answers to 1 short sentence. You can perform actions like jumping, rolling, or sleeping. Say goodbye and end the chat after exactly 1 minute."
            }
          ]
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "trigger_jump",
                description: "Triggers the elephant to jump in excitement."
              },
              {
                name: "trigger_roll",
                description: "Triggers the elephant to roll on the ground."
              },
              {
                name: "trigger_sleep",
                description: "Triggers the elephant to fall asleep."
              },
              {
                name: "trigger_success",
                description: "Triggers a success animation like a dance."
              }
            ]
          }
        ]
      }
    };

    geminiWs.send(JSON.stringify(setupMessage));
  });

  geminiWs.on('message', (data) => {
    try {
      const strData = data.toString();
      const response = JSON.parse(strData);

      // 1. Relay Server Content (Audio) to Client
      if (response.serverContent) {
        // We forward the entire serverContent object so the client can extract audio
        clientWs.send(JSON.stringify({ type: 'serverContent', content: response.serverContent }));
      }

      // 2. Handle Tool Calls
      if (response.toolCall) {
        console.log('Tool call received:', response.toolCall);
        const functionCalls = response.toolCall.functionCalls;
        
        if (functionCalls && functionCalls.length > 0) {
          functionCalls.forEach(call => {
            // Forward the specific animation event to the client
            clientWs.send(JSON.stringify({
              type: 'animation',
              animation: call.name, // e.g., "trigger_jump"
              id: call.id
            }));
            
            // Send feedback to Gemini that the tool was executed
            const toolResponse = {
              toolResponse: {
                functionResponses: [
                  {
                    name: call.name,
                    id: call.id,
                    response: { result: "ok" } 
                  }
                ]
              }
            };
            geminiWs.send(JSON.stringify(toolResponse));
          });
        }
      }

    } catch (error) {
      console.error('Error parsing Gemini message:', error);
    }
  });

  geminiWs.on('close', () => {
    console.log('Gemini connection closed');
    clientWs.close();
  });

  geminiWs.on('error', (error) => {
    console.error('Gemini WebSocket error:', error);
    clientWs.close();
  });

  // Relay messages from Client -> Gemini
  clientWs.on('message', (message) => {
    // If the connection to Gemini isn't open, we can't send
    if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) return;

    // 1. Handle Binary Audio Data from Client
    // We assume the client sends raw PCM 16-bit, 24kHz or similar as binary buffer
    if (Buffer.isBuffer(message)) {
      const audioMessage = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: "audio/pcm",
              data: message.toString('base64')
            }
          ]
        }
      };
      geminiWs.send(JSON.stringify(audioMessage));
    } 
    // 2. Handle specific JSON events from client (if any)
    else {
      try {
        const parsed = JSON.parse(message);
        // Pass through valid JSON if needed, or handle custom types
      } catch (e) {
        // Ignore non-JSON text that isn't handled
      }
    }
  });

  clientWs.on('close', () => {
    console.log('Client disconnected');
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });
});
