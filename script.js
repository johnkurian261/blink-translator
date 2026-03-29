// --- CONFIGURATION ---
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
const MOUTH_TOP = 13;
const MOUTH_BOTTOM = 14;
const MOUTH_LEFT = 78;
const MOUTH_RIGHT = 308;
const EYEBROW_LEFT = 105;
const EYEBROW_RIGHT = 334;
const NOSE_TIP = 1;

let DYNAMIC_EAR_THRESHOLD = 0.20; 
let DYNAMIC_MAR_THRESHOLD = 0.40;
let DYNAMIC_EYEBROW_THRESHOLD = 50.0; // This will calibrate distance

const DOT_TIME = 0.4;
const MIN_BLINK_TIME = 0.1;
const LETTER_PAUSE = 1.3;
const WORD_PAUSE = 3.0;

let EAR_BUFFER = [];
const BUFFER_SIZE = 5;

// Accuracy tracking
let total_blinks = 0;
let valid_blinks = 0;

const MORSE_DICT = {
    ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E",
    "..-.": "F", "--.": "G", "....": "H", "..": "I", ".---": "J",
    "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O",
    ".--.": "P", "--.-": "Q", ".-.": "R", "...": "S", "-": "T",
    "..-": "U", "...-": "V", ".--": "W", "-..-": "X", "-.--": "Y",
    "--..": "Z"
};

const WORD_LIST = [
    "HELLO","HI","YES","NO","THANK","YOU","HELP","I","AM","GOOD","BAD",
    "PLEASE","WATER","FOOD","PAIN","MORE","LESS","OKAY","STOP","GO","HAPPY",
    "SAD","TIRED","COLD","HOT", "GREAT", "WHAT"
];

// App State
let isCameraRunning = false;
let isCalibrating = false;
let calibrationBuffer = [];
const CALIBRATION_FRAMES = 50; // Roughly 2-3 seconds at ~20fps

let eyeClosed = false;
let blinkStart = null;
let lastBlink = Date.now() / 1000;
let gestureCooldown = 0;

let currentMorse = "";
let finalText = "";
let predictedWord = "";

// Audio & Speech Context
let audioCtx = null;
function initAudio() {
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
}
function playBeep(duration, freq, type) {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}
// Specific Audio Feedback Profiles
function beepDot() { playBeep(0.15, 800, 'sine'); } // High ping
function beepDash() { playBeep(0.3, 400, 'square'); } // Deep hold
function beepAction() { playBeep(0.2, 600, 'triangle'); } // Gesture success
function beepError() { playBeep(0.4, 200, 'sawtooth'); } // Delete text

// Voice Synthesizer
function speakText(text) {
    if(!window.speechSynthesis || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
}

// DOM Elements
const videoEl = document.getElementById('webcam');
const canvasEl = document.getElementById('output_canvas');
const canvasCtx = canvasEl.getContext('2d');
const loadingOverlay = document.getElementById('loading-overlay');
const startOverlay = document.getElementById('start-overlay');
const cameraBtn = document.getElementById('camera-btn');
const calibrateBtn = document.getElementById('calibrate-btn');
const clearBtn = document.getElementById('clear-btn');
const morseDisplay = document.getElementById('morse-display');
const textDisplay = document.getElementById('text-display');
const blinksVal = document.getElementById('blinks-val');
const validVal = document.getElementById('valid-val');
const accuracyVal = document.getElementById('accuracy-val');
const morseGrid = document.getElementById('morse-grid');
const actionLog = document.getElementById('action-log');

// Log Notifications
function showLog(msg, beepType) {
    actionLog.innerText = msg;
    actionLog.classList.add('show');
    if (beepType === 'action') beepAction();
    if (beepType === 'error') beepError();
    setTimeout(() => actionLog.classList.remove('show'), 2000);
}

// Math Helpers
function getDistance(p1, p2) { return Math.hypot(p1.x - p2.x, p1.y - p2.y); }
function computeAspectRatio(landmarks, indices) {
    const A = getDistance(landmarks[indices[1]], landmarks[indices[5]]);
    const B = getDistance(landmarks[indices[2]], landmarks[indices[4]]);
    const C = getDistance(landmarks[indices[0]], landmarks[indices[3]]);
    return (A + B) / (2.0 * C);
}
function computeMAR(landmarks) {
    const H = getDistance(landmarks[MOUTH_TOP], landmarks[MOUTH_BOTTOM]);
    const W = getDistance(landmarks[MOUTH_LEFT], landmarks[MOUTH_RIGHT]);
    return W === 0 ? 0 : H / W;
}
function computeEyebrow(landmarks) {
    const L = getDistance(landmarks[EYEBROW_LEFT], landmarks[NOSE_TIP]);
    const R = getDistance(landmarks[EYEBROW_RIGHT], landmarks[NOSE_TIP]);
    return (L + R) / 2;
}

// Autocorrect (Levenshtein)
function levenshteinDistance(a, b) {
    const matrix = Array(b.length + 1).fill().map(() => Array(a.length + 1).fill(0));
    for (let i = 0; i <= b.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
    }
    return matrix[b.length][a.length];
}
function autocorrect(word) {
    if (!word) return word;
    let bestMatch = word;
    let highestScore = 0;
    for (const w of WORD_LIST) {
        if(w === word) return word;
        const dist = levenshteinDistance(word, w);
        const maxLen = Math.max(word.length, w.length);
        const score = 1 - (dist / maxLen);
        if (score > highestScore && score >= 0.55) {
            highestScore = score;
            bestMatch = w;
        }
    }
    return bestMatch;
}

// Smart AI Prediction
function updatePrediction() {
    if (!finalText && !currentMorse) {
        predictedWord = "";
        return;
    }
    const words = finalText.trim().split(" ");
    const currentWord = words[words.length - 1] || "";
    
    // Suggest word completion for partially spelled words
    if (currentWord.length > 0 && !finalText.endsWith(" ")) {
        const match = WORD_LIST.find(w => w.startsWith(currentWord) && w !== currentWord);
        predictedWord = match ? match.substring(currentWord.length) : "";
    } else {
        predictedWord = "";
    }
}

// UI Rendering
function updateUI() {
    if (isCalibrating) return; // Freeze UI processing while calibrating
    
    // Morse Sequence Rendering
    if (currentMorse) {
        morseDisplay.innerText = currentMorse;
    } else {
        morseDisplay.innerHTML = '<span class="placeholder">Awaiting blink...</span>';
    }
    
    // Smart Text Prediction Rendering
    updatePrediction();
    if (predictedWord) {
        textDisplay.innerHTML = finalText + `<span class="prediction">${predictedWord}</span>`;
    } else {
        textDisplay.innerText = finalText;
    }
    
    // Metrics updates
    blinksVal.innerText = total_blinks;
    validVal.innerText = valid_blinks;
    const accuracy = total_blinks ? ((valid_blinks / total_blinks) * 100).toFixed(2) : 100;
    accuracyVal.innerText = `${accuracy}%`;
    accuracyVal.style.color = accuracy < 50 ? 'var(--danger)' : 'var(--accent)';
}
function clearState() {
    currentMorse = "";
    finalText = "";
    predictedWord = "";
    total_blinks = 0;
    valid_blinks = 0;
    EAR_BUFFER = [];
    eyeClosed = false;
    blinkStart = null;
    lastBlink = Date.now() / 1000;
    updateUI();
}

// --- FaceMesh Process ---
if (!window.FaceMesh) console.warn("FaceMesh not imported.");
else {
    window.faceMesh = new FaceMesh({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
    faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    faceMesh.onResults(onResults);
}

function triggerMorseAnimation() {
    morseDisplay.classList.remove('morse-added');
    void morseDisplay.offsetWidth;
    morseDisplay.classList.add('morse-added');
}

function onResults(results) {
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        const currentTime = Date.now() / 1000;
        const width = canvasEl.width;
        const height = canvasEl.height;
        
        const scaledLandmarks = landmarks.map(lm => ({ x: lm.x * width, y: lm.y * height }));
        
        const leftEAR = computeAspectRatio(scaledLandmarks, LEFT_EYE);
        const rightEAR = computeAspectRatio(scaledLandmarks, RIGHT_EYE);
        const rawEAR = (leftEAR + rightEAR) / 2;
        
        const mar = computeMAR(scaledLandmarks);
        const eyebrow = computeEyebrow(scaledLandmarks);
        
        // --- 1. Personal Auto-Calibration Core Logic ---
        if (isCalibrating) {
            calibrationBuffer.push({ear: rawEAR, mar: mar, eyebrow: eyebrow});
            canvasCtx.fillStyle = "rgba(16, 185, 129, 0.4)";
            canvasCtx.fillRect(0,0,width,height);
            
            if (calibrationBuffer.length >= CALIBRATION_FRAMES) {
                const restingEAR = calibrationBuffer.reduce((a,b)=>a+b.ear,0)/CALIBRATION_FRAMES;
                const restingMAR = calibrationBuffer.reduce((a,b)=>a+b.mar,0)/CALIBRATION_FRAMES;
                const restingEyebrow = calibrationBuffer.reduce((a,b)=>a+b.eyebrow,0)/CALIBRATION_FRAMES;
                
                DYNAMIC_EAR_THRESHOLD = restingEAR * 0.70; // Set customized eye closure threshold
                DYNAMIC_MAR_THRESHOLD = restingMAR + 0.15; // Set customized open mouth threshold
                DYNAMIC_EYEBROW_THRESHOLD = restingEyebrow * 1.10; // Set customized eyebrow raise threshold
                
                isCalibrating = false;
                showLog(`Calibrated! Threshold: ${DYNAMIC_EAR_THRESHOLD.toFixed(2)}`, 'action');
                updateUI();
            }
            canvasCtx.restore();
            return;
        }

        // --- Visual Tracking Dots ---
        canvasCtx.fillStyle = "rgba(16, 185, 129, 0.6)";
        [...LEFT_EYE, ...RIGHT_EYE, MOUTH_TOP, MOUTH_BOTTOM, EYEBROW_LEFT, EYEBROW_RIGHT].forEach(i => {
            canvasCtx.beginPath();
            canvasCtx.arc(scaledLandmarks[i].x, scaledLandmarks[i].y, 2.5, 0, 2 * Math.PI);
            canvasCtx.fill();
        });

        // --- 2. Advanced Multi-Gestural Face Controls ---
        if (currentTime - gestureCooldown > 1.5) {
            
            // Gesture A: Mouth Wide Open -> Clear Text
            if (mar > DYNAMIC_MAR_THRESHOLD) {
                clearState();
                showLog("MOUTH OPEN: Txt Cleared", "error");
                gestureCooldown = currentTime;
            } 
            
            // Gesture B: Eyebrow Raise -> Speak/Enter Space
            else if (eyebrow > DYNAMIC_EYEBROW_THRESHOLD && finalText.trim().length > 0) {
                const sentence = finalText.trim();
                
                // Only speak if we haven't already finished the sentence with a period
                if (!finalText.endsWith(". ")) {
                    showLog("BROWS RAISED: Spoken", "action");
                    speakText(sentence);
                    finalText += ". "; 
                    updateUI();
                }
                gestureCooldown = currentTime;
            }
        }
        
        // --- 3. Robust EAR Blink Processing ---
        EAR_BUFFER.push(rawEAR);
        if (EAR_BUFFER.length > BUFFER_SIZE) EAR_BUFFER.shift();
        const ear = EAR_BUFFER.reduce((a, b) => a + b, 0) / EAR_BUFFER.length;
        
        if (ear < DYNAMIC_EAR_THRESHOLD && !eyeClosed) {
            eyeClosed = true;
            blinkStart = currentTime;
            canvasCtx.fillStyle = "rgba(59, 130, 246, 0.4)";
            canvasCtx.fillRect(0, 0, width, height);
            
        } else if (ear >= DYNAMIC_EAR_THRESHOLD && eyeClosed) {
            eyeClosed = false;
            const duration = currentTime - blinkStart;
            lastBlink = currentTime;
            total_blinks++;
            
            if (duration >= MIN_BLINK_TIME) {
                valid_blinks++;
                
                // Audio Beep Feedback based on dot/dash
                if (duration < DOT_TIME) {
                    currentMorse += ".";
                    beepDot();
                } else {
                    currentMorse += "-";
                    beepDash();
                }
                triggerMorseAnimation();
                updateUI();
            }
        }
    }
    canvasCtx.restore();
}

// Core Translator Letter/Word Polling Loop
setInterval(() => {
    if (!isCameraRunning || isCalibrating) return;
    const currentTime = Date.now() / 1000;
    const pause = currentTime - lastBlink;
    let changed = false;
    
    // Flush out a completed letter
    if (pause > LETTER_PAUSE && currentMorse) {
        const letter = MORSE_DICT[currentMorse] || "?";
        finalText += letter;
        currentMorse = "";
        lastBlink = currentTime; 
        changed = true;
    }
    
    // Flush out a completed word and autocorrect it
    if (pause > WORD_PAUSE && finalText && !finalText.endsWith(" ") && !finalText.endsWith(". ")) {
        const words = finalText.trim().split(" ");
        const lastWordRaw = words[words.length - 1];
        
        // Run AI autocorrect
        const corrected = autocorrect(lastWordRaw);
        words[words.length - 1] = corrected;
        finalText = words.join(" ") + " ";
        
        // Voice Synthesizer speaks every completed word
        speakText(corrected);
        changed = true;
    }
    
    if (changed) updateUI();
}, 100);

let camera = null;

async function toggleCamera() {
    initAudio(); // Initialize browser audio API on click
    if (isCameraRunning) {
        if (camera) camera.stop();
        isCameraRunning = false;
        cameraBtn.innerText = "Start Camera";
        cameraBtn.classList.replace('secondary', 'primary');
        calibrateBtn.disabled = true;
        startOverlay.style.display = 'flex';
        loadingOverlay.style.display = 'none';
        canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    } else {
        startOverlay.style.display = 'none';
        loadingOverlay.style.display = 'flex';
        cameraBtn.disabled = true;
        cameraBtn.innerText = "Starting...";
        if (!camera) {
            camera = new Camera(videoEl, {
                onFrame: async () => {
                    if (isCameraRunning) {
                        try { await faceMesh.send({image: videoEl}); } catch(err) { console.error(err); }
                    }
                },
                width: 640, height: 480
            });
        }
        await camera.start();
        isCameraRunning = true;
        loadingOverlay.style.display = 'none';
        cameraBtn.innerText = "Pause Camera";
        cameraBtn.classList.replace('primary', 'secondary');
        cameraBtn.disabled = false;
        calibrateBtn.disabled = false;
        lastBlink = Date.now() / 1000;
        
        showLog("System Ready. Please Calibrate!", "action");
    }
}

calibrateBtn.addEventListener('click', () => {
    isCalibrating = true;
    calibrationBuffer = [];
    currentMorse = "";
    
    // Flash UI red to signal recording state
    morseDisplay.innerHTML = '<span class="placeholder" style="color:var(--accent); font-weight:800;">[ CALIBRATING ] Keep face neutral...</span>';
    beepAction();
});

cameraBtn.addEventListener('click', toggleCamera);
clearBtn.addEventListener('click', clearState);

updateUI();

// Populate Morse Code Grid
function initMorseDictionary() {
    if (!morseGrid) return;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const invertedDict = {};
    for (const [code, letter] of Object.entries(MORSE_DICT)) invertedDict[letter] = code;
    alphabet.forEach(letter => {
        const code = invertedDict[letter];
        if (code) {
            const div = document.createElement('div');
            div.className = 'morse-item';
            div.innerHTML = `<span class="morse-char">${letter}</span><span class="morse-code">${code}</span>`;
            morseGrid.appendChild(div);
        }
    });
}
initMorseDictionary();
