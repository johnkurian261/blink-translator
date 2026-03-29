# 👁️ Blink Morse Translator

An advanced, hands-free web application that empowers users to communicate using only their facial movements. Built directly in the browser with no backend software required, this project leverages cutting-edge computer vision to translate eye blinks into Morse Code strings instantly.

---

## ✨ Features

1. **Intelligent Face Tracking:** Uses Google's `MediaPipe Face Mesh` directly via WebGL, tracking your exact eye aspect ratio at 30 frames per second without ever sending video data to external servers. Your camera stream is 100% private.
2. **Multi-Gestural Controls:**
   - **Wide Mouth Open:** Instantly deletes/clears text.
   - **Raised Eyebrows:** Inserts a space/paragraph and verbally speaks the completed sentence.
3. **Audio-Context Synthesizer:** Type entirely blind! The app outputs dynamic audio pings: a high-pitched beep for a Dot (`.`) and a lower ping for a Dash (`-`).
4. **Stephen Hawking TTS Engine:** Web SpeechSynthesis API is deeply integrated to loudly declare words and sentences once built.
5. **AI Word Prediction & Autocorrect:** A complete Levenshtein distance matrix automatically fixes minor spelling mistakes based on an internal contextual dictionary, while ghost-text predicts your sentences live on screen.
6. **Smart Personal Calibration:** Automatically samples 50 video frames to dial-in mathematical resting states for *your* specific eye shape, mouth rest, and eyebrow resting height, dynamically recalculating the required blink/gesture thresholds!
7. **History Exporting:** Maintain long conversations by natively saving history logs directly to your local hard drive as a `.txt` file.

---

## 🚀 How to Run

Because this is a **pure HTML/CSS/Vanilla JS** project:
1. Simply download this repository.
2. Open `index.html` in Chrome or Edge.
3. Allow camera permissions and start blinking!

- Short blink (< 0.4s) = **Dot**
- Long blink (> 0.4s) = **Dash**

No `npm`, `pip`, or python backend installations are needed!
