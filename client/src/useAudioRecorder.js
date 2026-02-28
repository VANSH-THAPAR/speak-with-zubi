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
      
      // 1. Create AudioContext
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      const source = audioContext.createMediaStreamSource(stream);
      // 2. Create Processor (deprecated but works broadly)
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      processor.onaudioprocess = (e) => {
        // Only process if we are actively recording. 
        // We use a ref mechanism here implicitly because standard state inside this closure might be stale.
        // Actually, since we stop via mediaRecorder.current.stop(), we can just process always while running.
        
        const inputData = e.inputBuffer.getChannelData(0);
        // Resample/Convert if needed. Here we assume 16kHz context.
        // Convert float32 to int16 PCM
        const pcmBuffer = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmBuffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Callback with the raw buffer
        if (onAudioData) {
            onAudioData(pcmBuffer.buffer);
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
