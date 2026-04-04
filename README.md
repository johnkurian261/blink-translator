# 👁️ Blink Morse Translator

An advanced, hands-free application that empowers users to communicate using only their facial movements. This project leverages cutting-edge computer vision to translate eye blinks into Morse Code strings instantly.

We provide two versions of this application:
1. **Web Version**: A pure HTML/CSS/JS application that runs entirely in your browser.
2. **Advanced Desktop Version**: A Python-based desktop application with enhanced features, native OS integration, and a dedicated UI.

---

## ✨ Features

1. **Intelligent Face Tracking:** Uses `MediaPipe Face Mesh` to track your exact eye aspect ratio (EAR) at high frame rates, with all processing done locally. Your camera stream is 100% private.
2. **Multi-Gestural Controls:**
   - **Wide Mouth Open:** Instantly deletes/clears text.
   - **Raised Eyebrows:** Inserts a space/paragraph and verbally speaks the completed sentence.
3. **Audio-Context Synthesizer:** Type entirely blind! The app outputs dynamic audio pings: a high-pitched beep for a Dot (`.`) and a lower ping for a Dash (`-`).
4. **Text-To-Speech Engine:** Deeply integrated to loudly declare words and sentences once built (via Web Speech API in the browser or `pyttsx3` in Python).
5. **AI Word Prediction & Autocorrect:** A Levenshtein distance matrix automatically fixes minor spelling mistakes based on an internal contextual dictionary, while ghost-text predicts your sentences live on screen.
6. **Smart Personal Calibration:** Automatically samples video frames to dial-in mathematical resting states for *your* specific eye shape, mouth rest, and eyebrow resting height, dynamically recalculating the required blink/gesture thresholds!
7. **History Exporting:** Maintain long conversations by natively saving history logs directly to your local hard drive as a `.txt` file.

---

## 🚀 How to Run

### Option A: Web Version (Zero Setup)
Because the web version is a **pure HTML/CSS/Vanilla JS** project:
1. Simply download this repository.
2. Open `index.html` in a modern browser (Chrome, Edge, etc.).
3. Allow camera permissions and start blinking!

No `npm`, `pip`, or python backend installations are needed!

### Option B: Advanced Desktop Version (Python)
To run the enhanced native desktop application (`advanced_app.py`), you will need Python installed on your system.
1. Install the required dependencies using `pip`:
   ```bash
   pip install opencv-python mediapipe numpy Pillow pyttsx3
   ```
2. Run the Python application:
   ```bash
   python advanced_app.py
   ```
   *(Note: The advanced desktop app currently utilizes `winsound` for audio cues and is optimized for Windows, though adapting it to macOS/Linux is straightforward).*

---

## 📖 Morse Code Guide

- Short blink (< 0.4s) = **Dot** (`.`)
- Long blink (> 0.4s) = **Dash** (`-`)

Start blinking intuitively and watch your facial gestures translate to speech!
