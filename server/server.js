const express = require('express');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const http = require('http');
const https = require('https');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// --- Render Keep-Alive Route ---
app.get('/keepalive', (req, res) => {
    res.status(200).send('Server is alive!');
});

// Self-ping every 14 minutes (840,000 milliseconds)
setInterval(() => {
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) return; 

    const url = `${backendUrl}/keepalive`;
    console.log(`Pinging self at ${url} to keep Render instance awake...`);

    const lib = url.startsWith('https') ? https : http;
    
    lib.get(url, (res) => {
        if (res.statusCode === 200) {
            console.log('Keep-alive ping successful.');
        } else {
            console.log(`Keep-alive ping failed with status: ${res.statusCode}`);
        }
    }).on('error', (err) => {
        console.error('Keep-alive ping error:', err.message);
    });
}, 840_000);
// -----------------------------

// Ensure API key is present
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("❌ Error: GEMINI_API_KEY is not set in .env file");
}

// Using the v1alpha endpoint (Required for Realtime Voice / BidiGenerateContent)
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

const server = app.listen(port, () => {
  console.log(`🚀 Server is running on ws://localhost:${port}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (clientWs) => {
  console.log('📱 Client connected to Node.js server');
  let geminiWs = null;

  try {
    geminiWs = new WebSocket(GEMINI_URL);
  } catch (err) {
    console.error("Failed to construct Gemini WebSocket:", err);
    clientWs.close();
    return;
  }

  geminiWs.on('open', () => {
    console.log('🔗 Connected to Gemini API. Sending setup...');

    const setupMessage = {
      setup: {
        // THE CORRECT NATIVE AUDIO MODEL!
        model: "models/gemini-2.5-flash-native-audio-latest", 
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }
          }
        },
        systemInstruction: {
          parts: [
            {
              text: "You are Zubi, an intelligent, helpful, and highly interactive baby elephant companion for children. Your personality is extremely happy, excited, and warm. Keep your answers short (1 to 2 sentences max) and child-friendly. Provide accurate, safe, and educational answers, and NEVER hallucinate facts or do unwanted things. If the user asks you to perform an action (like jumping, dancing, or sleeping), YOU MUST use your tools to do it while actively speaking to them. Always be kind, encouraging, and obedient to the user's commands."
            }
          ]
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "trigger_jump",
                description: "Triggers the elephant to jump in excitement.",
                parameters: { type: "OBJECT", properties: {} } 
              },
              {
                name: "trigger_sleep",
                description: "Triggers the elephant to fall asleep.",
                parameters: { type: "OBJECT", properties: {} } 
              },
              {
                name: "trigger_success",
                description: "Triggers a success animation like a dance.",
                parameters: { type: "OBJECT", properties: {} } 
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

      // 0. Setup confirmation
      if (response.setupComplete) {
        console.log("✅ Gemini Setup Complete! Ready for audio.");
        return;
      } 
      
      // Log errors or unexpected messages
      if (!response.serverContent && !response.setupComplete) {
        console.log("Raw Gemini Message:", strData);
      }

      // 1. Relay Audio Content to React Frontend
      if (response.serverContent) {
        clientWs.send(JSON.stringify({ type: 'serverContent', content: response.serverContent }));
      }

      // 2. Handle Tool Calls (Animations)
      if (response.toolCall) {
        console.log('✨ Tool call received from Gemini:', response.toolCall);
        const functionCalls = response.toolCall.functionCalls;
        
        if (functionCalls && functionCalls.length > 0) {
          functionCalls.forEach(call => {
            // Tell React to play the animation
            clientWs.send(JSON.stringify({
              type: 'animation',
              animation: call.name, 
              id: call.id
            }));
            
            // Confirm back to Gemini that the animation played
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

  geminiWs.on('close', (code, reason) => {
    console.log(`🔌 Gemini connection closed: code=${code}, reason=${reason}`);
    clientWs.close();
  });

  geminiWs.on('error', (error) => {
    console.error('Gemini WebSocket error:', error);
    clientWs.close();
  });

  clientWs.on('message', (message) => {
    if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) return;

    if (Buffer.isBuffer(message)) {
      const audioMessage = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: "audio/pcm;rate=16000",
              data: message.toString('base64')
            }
          ]
        }
      };
      geminiWs.send(JSON.stringify(audioMessage));
    } else {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'forceFarewell') {
          console.log("Sending farewell trigger to Gemini...");
          const textMessage = {
             clientContent: {
                 turns: [
                     {
                         role: "user",
                         parts: [
                             { text: "The play session is ending right now. Stop whatever you are doing or saying. You MUST say EXACTLY 'Goodbye, it's my time to sleep!' out loud right now. Do NOT use any tools for this, just speak!" }
                         ]
                     }
                 ],
                 turnComplete: true
             }
          };
          geminiWs.send(JSON.stringify(textMessage));
        }
      } catch (e) {
        // Ignored
      }
    }
  });

  clientWs.on('close', () => {
    console.log('📱 Client disconnected');
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });
});