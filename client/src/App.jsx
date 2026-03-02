import { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';
import { useAudioRecorder } from './useAudioRecorder';
import goodbyeBase64 from './assets/goodbye.txt?raw';

// Animation UIDs
const ANIMATIONS = {
  STATIC_POSE: '-1',
  IDLE: '91a0b6d7d39e446e935ed3139ea0134d',
  IDLE_2: '90d5fbae51784239a966c3b0e89a96d1',
  TALK: 'a10b0855f5834b2d9bac33ba2dd35948',
  WALK: '7ae8e0f43a904d6c85cac6a36f708338',
  RUN: '9dd80f3ab1ba4596820fa83970e7b507',
  JUMP_UP: '5c1dac80c2ca478f8afd9a04a80ca7bb',
  FALL: '7814ef0da1c94210aab4c2cd6f5e0004',
  LAND: 'c184dda2155544a9bec2bece95f0aeec',
  FAILURE: 'd12051c5731b403cb13051aea5ca101a',
  SUCCESS: 'c83f524e33674b6a8263034580affa26',
  SLEEP: 'c78cb50616cd4d1e83fa0590e5306eef'
};

// Model ID
const MODEL_UID = '52401c7067f54ff3813da84df073b5f6';

function App() {
  const iframeRef = useRef(null);
  const apiRef = useRef(null);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const sequenceQueueRef = useRef([]);
  const currentAnimationRef = useRef(null);

  const [status, setStatus] = useState('Disconnected');
  const [isAsleep, setIsAsleep] = useState(false);
  const isAsleepRef = useRef(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const sessionStartedRef = useRef(false);

  // --- Animation Helpers ---

  // Basic play function
  const playAnimation = useCallback((uid, loop = true) => {
      if (!apiRef.current) return;
      if (currentAnimationRef.current === uid) return; // Prevent restarting same animation
      
      currentAnimationRef.current = uid;

      apiRef.current.setCurrentAnimationByUID(uid, (err) => {
          if (err) {
              console.error("Set animation error", err);
              return;
          }
          // Set to loop if requested, otherwise play once
          apiRef.current.setCycleMode(loop ? 'loop' : 'one'); 
          
          if (uid === ANIMATIONS.IDLE) {
              apiRef.current.pause(); // Freeze exactly on the idle frame 
          } else {
              apiRef.current.play();
          }
      });
  }, []);

  // Play a sequence of animations (e.g., Jump -> Fall -> Land -> Idle)
  const playSequence = useCallback((uids) => {
      if (!uids || uids.length === 0) return;
      
      // The sequence is the provided list + IDLE at the end to reset and freeze
      // We take the first one to play now, and push the REST + IDLE to the queue.
      const [first, ...rest] = uids;
      sequenceQueueRef.current = [...rest, ANIMATIONS.IDLE];
      
      console.log("Starting sequence:", uids, "Queue:", sequenceQueueRef.current);
      playAnimation(first, false); 
  }, [playAnimation]);

  // Play a single animation once, then go back to frozen Idle
  const playOneShot = useCallback((uid) => {
      // Just a sequence of [UID, IDLE] - Playing UID once, then reverting to Idle Freeze
      sequenceQueueRef.current = [ANIMATIONS.IDLE];
      playAnimation(uid, false);
  }, [playAnimation]);


  // --- Session Timer Logic ---
  useEffect(() => {
    let timer;
    if (isSessionActive && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isSessionActive) {
      // Emergency fallback if for some reason it hits 0 without farewell catching it
      setIsSessionActive(false);
      setIsAsleep(true);
      isAsleepRef.current = true;
      playAnimation(ANIMATIONS.SLEEP, true);
      sequenceQueueRef.current = [];
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    }
    return () => clearInterval(timer);
  }, [isSessionActive, timeLeft, playAnimation]);

  // Guaranteed farewell at 55 seconds (when 5 seconds are left)
  useEffect(() => {
    if (isSessionActive && timeLeft === 5) {
      console.log("55 seconds elapsed, executing force farewell locally.");
      
      // Stop the timer from ticking further normally here
      setIsSessionActive(false); 
      
      // 1. Cut off current Gemini connection so he stops whatever he's saying
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      
      // 2. Clear any pending Gemini audio chunks and silence active audio
      audioQueueRef.current = [];
      if (audioContextRef.current && audioContextRef.current.state === 'running') {
          audioContextRef.current.suspend();
      }
      
      // 3. Make him "talk"
      sequenceQueueRef.current = [];
      isAsleepRef.current = false;
      setIsAsleep(false);
      playAnimation(ANIMATIONS.TALK, true);

      // 4. Decode the offline AI voice goodbye 
      const playGoodbye = async () => {
         if (!audioContextRef.current) return;
         if (audioContextRef.current.state === 'suspended') {
             await audioContextRef.current.resume();
         }
         
         const binaryString = window.atob(goodbyeBase64);
         const len = binaryString.length;
         const bytes = new Uint8Array(len);
         for (let i = 0; i < len; i++) {
             bytes[i] = binaryString.charCodeAt(i);
         }
         
         const int16Data = new Int16Array(bytes.buffer);
         const float32Data = new Float32Array(int16Data.length);
         for (let i = 0; i < int16Data.length; i++) {
             float32Data[i] = int16Data[i] / 32768.0;
         }

         const audioBuffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000);
         audioBuffer.getChannelData(0).set(float32Data);
         
         const source = audioContextRef.current.createBufferSource();
         source.buffer = audioBuffer;
         source.connect(audioContextRef.current.destination);
         
         source.onended = () => {
             playAnimation(ANIMATIONS.SLEEP, true);
             setIsAsleep(true);
             isAsleepRef.current = true;
             setTimeLeft(0); 
         };
         
         source.start();
      };
      
      playGoodbye();

      // In case audio playback fails, force sleep after 3 seconds fallback
      setTimeout(() => {
         if (!isAsleepRef.current) {
             playAnimation(ANIMATIONS.SLEEP, true);
             setIsAsleep(true);
             isAsleepRef.current = true;
             setTimeLeft(0);
         }
      }, 3500);
    }
  }, [timeLeft, isSessionActive, playAnimation]);

  // --- Audio Logic ---
  const playNextChunk = () => {
      if (audioQueueRef.current.length === 0) {
          isPlayingRef.current = false;
          // If we finished talking and NOT in a sequence, go to idle pause
          // Make sure we aren't asleep
          if (sequenceQueueRef.current.length === 0 && !isAsleepRef.current) {
              playAnimation(ANIMATIONS.IDLE, false);
              if (apiRef.current) apiRef.current.pause();
          }
          return;
      }

      isPlayingRef.current = true;
      const buffer = audioQueueRef.current.shift();
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);

      // Only switch to TALK if we are not busy with a sequence (like jumping) and not sleeping
      if (sequenceQueueRef.current.length === 0 && !isAsleepRef.current) {
          playAnimation(ANIMATIONS.TALK, true);
      }

      source.onended = () => {
          playNextChunk();
      };
      
      source.start();
  };

  const queueAudioChunk = async (base64Data) => {
    try {
        if (!audioContextRef.current) return;
        
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Convert to 16-bit PCM (Little Endian)
        const int16Data = new Int16Array(bytes.buffer);
        const float32Data = new Float32Array(int16Data.length);
        
        // Convert int16 to float32 (-1.0 to 1.0)
        for (let i = 0; i < int16Data.length; i++) {
            float32Data[i] = int16Data[i] / 32768.0;
        }

        // Create AudioBuffer (rate must match server config, usually 24000)
        const audioBuffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000);
        audioBuffer.getChannelData(0).set(float32Data);
        
        audioQueueRef.current.push(audioBuffer);
        
        if (!isPlayingRef.current) {
            playNextChunk();
        }
    } catch (e) {
        console.error("Error processing audio chunk:", e);
    }
  };


  // --- WebSocket Setup ---
  // Handle WebSocket triggers
  const triggerAnimation = useCallback((toolName) => {
      if (toolName === 'trigger_jump') {
          playSequence([ANIMATIONS.JUMP_UP, ANIMATIONS.FALL, ANIMATIONS.LAND]);
      } else if (toolName === 'trigger_sleep') {
          playAnimation(ANIMATIONS.SLEEP, true);
          sequenceQueueRef.current = []; // Ensure we don't go back to IDLE
          setIsAsleep(true);
          isAsleepRef.current = true;
      } else if (toolName === 'trigger_success') {
          playOneShot(ANIMATIONS.SUCCESS);
      }
  }, [playSequence, playOneShot, playAnimation]);

  useEffect(() => {
    // Read backend URL from environment variables, fallback if not set
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'ws://localhost:3001';
    const ws = new WebSocket(backendUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('Connected');
      setStatus('Connected');
    };

    ws.onmessage = (event) => {
        const data = event.data;
        if (typeof data === 'string') {
            try {
                const message = JSON.parse(data);
                if (message.type === 'animation') {
                    triggerAnimation(message.animation);
                }
                else if (message.type === 'serverContent') {
                    const contentValues = message.content;
                    if (contentValues?.modelTurn?.parts) {
                        for (const part of contentValues.modelTurn.parts) {
                            if (part.inlineData && part.inlineData.mimeType.startsWith('audio')) {
                                queueAudioChunk(part.inlineData.data);
                            }
                        }
                    } 
                }
            } catch (e) {
                console.error("Error parsing WS message", e);
            }
        }
    };

    ws.onclose = () => setStatus('Disconnected');
    wsRef.current = ws;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContextRef.current = new AudioContext({ sampleRate: 24000 });

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [triggerAnimation]);


  // --- Sketchfab Init ---
  const initSketchfab = useCallback(() => {
     if (!window.Sketchfab) return;

     const client = new window.Sketchfab(iframeRef.current);
     client.init(MODEL_UID, {
         success: (api) => {
             apiRef.current = api;
             api.start();
             api.addEventListener('viewerready', () => {
                 console.log('Sketchfab Viewer Ready');

                 // Zoom out slightly AND rotate to face front
                 api.getCameraLookAt((err, camera) => {
                    if (!err) {
                        const eye = camera.position;
                        const target = camera.target;
                        
                        // Vector from target to eye
                        let dx = eye[0] - target[0];
                        let dy = eye[1] - target[1];
                        let dz = eye[2] - target[2];
                        
                        // 1. Rotate 90 degrees around Z axis (assuming Z is up) to face front
                        // If model faces Left (-X), camera is likely at -Y looking +Y, or +Y looking -Y.
                        // We want camera at -X to look at face.
                        // Let's just rotate the vector (dx, dy) by -90 degrees.
                        // x' = y, y' = -x (for -90 deg rotation)
                        // or x' = -y, y' = x (for +90 deg rotation)
                        
                        // Try rotating -90 degrees (clockwise from top)
                        const scaling = 0.3; // Zoom out factor (1.5x distance)
                        
                        // Previous attempt rotated 90 deg and showed back.
                        // We need to rotate 180 degrees from the previous position (which was back) to see front.
                        // Or just rotate -90 deg from original if +90 was back.
                        // Let's try the opposite rotation of the last change.
                        
                        // Original was (dx, dy).
                        // Last time we used (-dy, dx) and got back view.
                        // To get front view (opposite of back), we want (dy, -dx).
                        
                        // const scaling = 1.6; // Slightly more zoom out
                        
                        // Rotate 180 from back (which is -90 from original, say) -> +90 from original
                        const rotatedDx = dy; 
                        const rotatedDy = -dx;  
                        
                        const newEye = [
                            target[0] + rotatedDx * scaling,
                            target[1] + rotatedDy * scaling,
                            target[2] + dz * scaling 
                        ];
                        
                        api.setCameraLookAt(newEye, target, 2); 
                    }
                 });
                 
                 // LISTENER: When one animation finishes, look at queue
                 api.addEventListener('animationEnded', () => {
                     // Check if there is something in queue
                     if (sequenceQueueRef.current.length > 0) {
                         const nextUid = sequenceQueueRef.current.shift();
                         console.log("Animation ended, playing next:", nextUid);
                         
                         // Cycle mode "one" is fine as playAnimation sets it.
                         playAnimation(nextUid, true);
                     } else if (!isAsleepRef.current && !isPlayingRef.current) {
                         // Always go back to sleeping if asleep, 
                         // but if awake and no audio is playing, fall back to default IDLE pose and pause him
                         playAnimation(ANIMATIONS.IDLE, false);
                         api.pause(); // Freeze exactly on the idle frame
                     }
                 });

                 // Initial State
                 api.setCycleMode('one'); 
                 playAnimation(ANIMATIONS.IDLE, false);
                 api.pause();
             });
         },
         ui_controls: 0,
         ui_infos: 0,
         ui_inspector: 0,
         ui_stop: 0,
         ui_watermark: 0,
         transparent: 1
     });
  }, [playAnimation]);

  useEffect(() => {
      const interval = setInterval(() => {
          if (window.Sketchfab) {
              clearInterval(interval);
              initSketchfab();
          }
      }, 500);
      return () => clearInterval(interval);
  }, [initSketchfab]);

  // --- UI ---
  const { isRecording, startRecording, stopRecording } = useAudioRecorder({
      onAudioData: (buffer) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(buffer);
          }
      }
  });

  const handleStartRecording = async () => {
      // Do nothing if already asleep or session is fully over
      if (isAsleep || timeLeft <= 0) return;

      if (audioContextRef.current?.state === 'suspended') {
          await audioContextRef.current.resume();
      }
      startRecording();

      // Start the 60 second session logic on the very first hold
      if (!sessionStartedRef.current) {
          sessionStartedRef.current = true;
          setIsSessionActive(true);
          console.log("60-second play session started!");
      }
  };

  return (
    <div className="app-container">
      {/* Navbar Overlay */}
      <div className="overlay-navbar">
        <div className="brand">
          <h1>Speak With Zubi</h1>
        </div>
        
        <div className="status-badge">
          <div className={`status-dot ${status === 'connected' ? 'connected' : ''}`} />
          <span className="status-text">{status}</span>
        </div>
      </div>

      {/* 3D Model */}
      <iframe
        ref={iframeRef}
        id="api-frame"
        className={`sketchfab-frame ${isAsleep ? 'sleep-mode' : ''}`}
        allow="autoplay; fullscreen; vr"
        allowFullScreen
        mozallowfullscreen="true"
        webkitallowfullscreen="true"
        title="Zubi"
      />

      {/* Floating Suggestions / Bubbles */}
      <div className="floating-suggestions">
        <div className="suggestion-bubble bubble-1">🎵 Ask Zubi to dance!</div>
        <div className="suggestion-bubble bubble-3">🚶 Tell Zubi to walk!</div>
        <div className="suggestion-bubble bubble-4">💤 Tell Zubi to jump!</div>
        <div className="suggestion-bubble bubble-5">🏃 Ask Zubi to run!</div>
        
        <div className="instruction-toast">
          ⭐ Remember: Hold the mic while talking. Please wait for Zubi's reply before speaking again!
        </div>
        
        {/* Sub-instruction for 3D interaction */}
        <div className="interact-hint-box">
          <span className="interact-icon">👆</span> You can click & drag to spin Zubi around!
        </div>
      </div>

      {/* Footer Overlay */}
      <div className="overlay-footer">
        
        {/* Primary Interaction: Talk */}
        <div className="controls-container">
            <button 
              className={`record-button ${isRecording ? 'recording' : ''}`}
              onMouseDown={handleStartRecording} 
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={(e) => { e.preventDefault(); handleStartRecording(); }}
              onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
              onTouchCancel={(e) => { e.preventDefault(); stopRecording(); }}
              onContextMenu={(e) => { e.preventDefault(); }}
              aria-label={isRecording ? "Stop Recording" : "Start Recording"}
              disabled={timeLeft <= 0 || isAsleep}
            >
              {/* Show countdown timer once session starts, else show mic icon */}
              {isSessionActive ? (
                 <span style={{ fontSize: '28px', fontWeight: 'bold' }}>{timeLeft}</span>
              ) : isRecording ? (
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: '32px', height: '32px'}}>
                    <rect x="9" y="9" width="6" height="6" />
                 </svg>
              ) : (
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: '32px', height: '32px'}}>
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                 </svg>
              )}
            </button>
            <div className="record-hint">
                {timeLeft <= 0 || isAsleep ? "Playtime over! Zubi is sleeping." : isRecording ? "Listening..." : "Hold to Talk"}
            </div>
        </div>

        {/* Secondary Actions: Animations */}
        <div className="footer-buttons">
            <button className="anim-btn" onClick={() => playAnimation(ANIMATIONS.IDLE)}>Idle</button>
            <button className="anim-btn" onClick={() => playAnimation(ANIMATIONS.TALK)}>Talk</button>
            <button className="anim-btn" onClick={() => playSequence([ANIMATIONS.JUMP_UP, ANIMATIONS.FALL, ANIMATIONS.LAND])}>Jump</button>
            <button className="anim-btn" onClick={() => playOneShot(ANIMATIONS.SUCCESS)}>Success</button>
            <button className="anim-btn" onClick={() => playOneShot(ANIMATIONS.SLEEP)}>Sleep</button>
            <button className="anim-btn" onClick={() => playOneShot(ANIMATIONS.WALK)}>Walk</button>
            <button className="anim-btn" onClick={() => playOneShot(ANIMATIONS.RUN)}>Run</button>
        </div>
      </div>
    </div>
  );
}

export default App;
