import { useState, useRef, useCallback } from 'react';

export const useAudioRecorder = ({ onAudioData }) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorder = useRef(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Configure MediaRecorder for raw PCM data if possible, but browsers usually output webm/ogg.
      // Gemini Realtime API expects specific formats. RAW PCM 16-bit is often best but complex to get from browser.
      // However, the prompt says "capture microphone audio in chunks and send it over the WebSocket as base64".
      // It implies the server or Gemini will handle the format.
      // Let's use a standard implementation that sends Blobs/ArrayBuffers.
      
      // NOTE: Standard MediaRecorder produces webm/ogg. Gemini might need PCM. 
      // A common workaround is to use AudioContext + ScriptProcessor/AudioWorklet to get raw PCM.
      // But for simplicity and based on "capture microphone audio in chunks", let's try standard MediaRecorder 
      // and assume the backend knows how to handle it or we send raw PCM via AudioContext.
      
      // Let's use AudioContext for raw PCM as it's more reliable for ML APIs.
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 }); // Gemini prefers 16kHz
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      processor.onaudioprocess = (e) => {
        if (!isRecording) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert float32 to int16 PCM
        const pcmBuffer = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmBuffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to Buffer/Uint8Array to send
        const buffer = pcmBuffer.buffer;
        
        // Send to callback
        if (onAudioData) {
            onAudioData(buffer);
        }
      };

      mediaRecorder.current = {
        stop: () => {
          processor.disconnect();
          source.disconnect();
          stream.getTracks().forEach(track => track.stop());
          audioContext.close();
        }
      };

      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  }, [isRecording, onAudioData]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      mediaRecorder.current = null;
    }
    setIsRecording(false);
  }, []);

  return { isRecording, startRecording, stopRecording };
};
