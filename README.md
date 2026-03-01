<div align="center">
  <h1>🐘 Speak With Zubi</h1>
  <p><b>Your child's magical, AI-powered 3D animated companion!</b></p>

  <p>
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite" />
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/Gemini_AI-8E75B2?style=for-the-badge&logo=googlebard&logoColor=white" alt="Gemini" />
    <img src="https://img.shields.io/badge/WebSockets-black?style=for-the-badge&logo=socketdotio&logoColor=white" alt="WebSockets" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  </p>
</div>

<br/>

## 🌟 Overview

**Speak With Zubi** is a next-generation interactive AI companion designed specifically for children. Built using cutting-edge real-time bidirectional WebSockets and Google's latest **Gemini 2.5 Flash Native Audio** API, Zubi is a 3D animated baby elephant that can hold fluid, natural, and cheerful conversations with kids!

Not only does Zubi listen and talk, but he also interacts visually! Through intelligent tool-calling, Zubi triggers rich 3D animations—like jumping when excited or dancing when happy. To keep playtime balanced, Zubi features an automatic built-in "Bedtime" system that seamlessly wraps up the 60-second play session and tucks Zubi in to sleep.

---

## ✨ Key Features

*   🗣️ **Ultra Low-Latency Voice AI:** Powered by Google's bidirectional Gemini Realtime APIs. Speak directly into your microphone, and Zubi instantly answers!
*   🐘 **Interactive 3D Animations:** Integrated with the Sketchfab Viewer API. Zubi performs dynamic actions like `Idle`, `Talk`, `Jump`, `Success`, and `Sleep` based on contextual AI responses.
*   ⏱️ **Screen Time Management:** Features a strict 60-second play loop. When time runs out, Zubi automatically announces bedtime and transitions into a beautiful sleeping animation without relying on spotty network AI for the most crucial shutdown task.
*   🧠 **Child-Safe Prompt Engineering:** Zubi is strictly conditioned to be purely educational, incredibly warm, fully obedient to commands (like "Jump!"), and 100% child-safe.
*   🎤 **Native Web Audio API:** Utilizes the browser's AudioContext to seamlessly stream incoming raw PCM16 buffers natively without choppy Text-To-Speech delays.

---

## 🏗️ System Architecture

*   **Frontend (`/client`):** React + Vite SPA. Manages microphone recording via the `MediaRecorder` API, queues raw PCM audio streams efficiently, interfaces with the Sketchfab 3D Iframe, and runs the countdown timer lock-out system.
*   **Backend (`/server`):** Node.js Express Server. Acts as a secure, fast WS proxy bridge transferring bidirectional audio binary data and Tool-Call JSON payloads between the React client and the Google Generative Language endpoint.

---

## ⚙️ Getting Started

### Prerequisites

*   **Node.js:** `v20.19.0` or `v22.12.0` and above.
*   **API Key:** An active Google Gemini API key.

### 1. Clone & Install

```bash
# Clone the repository
git clone https://github.com/your-username/Speak_With_Zubi.git
cd Speak_With_Zubi

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Environment Variables

Create `.env` files in both your `client` and `server` directories.

**`server/.env`**
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3001
```

**`client/.env`**
```env
VITE_BACKEND_URL=ws://localhost:3001
```

### 3. Run the Application

You'll need two terminal windows to run both the frontend and backend servers simultaneously.

**Terminal 1 (Backend Server):**
```bash
cd server
node server.js
```

**Terminal 2 (Frontend Client):**
```bash
cd client
npm run dev
```

Your browser should open automatically to `http://localhost:5173`. 

---

## 🎮 How to Play with Zubi

1. **Press and Hold** the central "Hold to Talk" button to wake Zubi up and begin the 60-second play session.
2. Speak clearly to Zubi! Say things like:
   * *"Hi Zubi! Can you jump for me?"*
   * *"Do a happy dance!"*
   * *"What is your favorite food?"*
3. **Watch and Listen!** Zubi will answer warmly and animate dynamically within the Sketchfab frame.
4. When the **55-second mark** is reached, your frontend gracefully intercepts the AI stream. Zubi will politely announce, *"Goodbye, it's my time to sleep!"* natively.
5. Zubi instantly falls asleep, freezing the UI to ensure playtime ends right on schedule. 💤

---

<div align="center">
  <sub>Made with ❤️ for kids and developers alike.</sub>
</div>