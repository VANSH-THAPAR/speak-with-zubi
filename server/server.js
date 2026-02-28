const express = require('express');
const WebSocket = require('ws');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3001;

// Ensure API key is present
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("❌ Error: GEMINI_API_KEY is not set in .env file");
}

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

    // Send initial setup payload with strictly formatted tool parameters
    const setupMessage = {
      setup: {
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
                description: "Triggers the elephant to jump in excitement.",
                parameters: { type: "OBJECT", properties: {} } 
              },
              {
                name: "trigger_roll",
                description: "Triggers the elephant to roll on the ground.",
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

      // 0. Catch the Success Signal or Setup Errors
      if (response.setupComplete) {
        console.log("✅ Gemini Setup Complete! Ready for audio.");
        return;
      } 
      
      // Log raw messages that aren't just normal audio packets to help debug
      if (!response.serverContent && !response.setupComplete) {
        console.log("Raw Gemini Message:", strData);
      }

      // 1. Relay Server Content (Audio) to Client
      if (response.serverContent) {
        clientWs.send(JSON.stringify({ type: 'serverContent', content: response.serverContent }));
      }

      // 2. Handle Tool Calls (Animations)
      if (response.toolCall) {
        console.log('✨ Tool call received from Gemini:', response.toolCall);
        const functionCalls = response.toolCall.functionCalls;
        
        if (functionCalls && functionCalls.length > 0) {
          functionCalls.forEach(call => {
            // Forward the specific animation event to the React frontend
            clientWs.send(JSON.stringify({
              type: 'animation',
              animation: call.name, 
              id: call.id
            }));
            
            // Send feedback back to Gemini that the tool was "executed"
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
    console.log('🔌 Gemini connection closed');
    clientWs.close();
  });

  geminiWs.on('error', (error) => {
    console.error('Gemini WebSocket error:', error);
    clientWs.close();
  });

  // Relay messages from React Client -> Gemini
  clientWs.on('message', (message) => {
    if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) return;

    // Handle Binary Audio Data from Client
    if (Buffer.isBuffer(message)) {
      const audioMessage = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: "audio/pcm;rate=16000", // Standard rate for Web Audio capture
              data: message.toString('base64')
            }
          ]
        }
      };
      geminiWs.send(JSON.stringify(audioMessage));
    } 
    else {
      // Handle any text/JSON control messages from the client if needed later
      try {
        const parsed = JSON.parse(message);
        // We can add logic here later if the client needs to send text messages
      } catch (e) {
        // Ignore non-JSON text
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