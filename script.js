// Configuration mirroring the original Python code
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

const EAR_THRESHOLD = 0.20;
const DOT_TIME = 0.4;
const LETTER_PAUSE = 1.5;
const WORD_PAUSE = 3.0;

const BUFFER_SIZE = 5;
const MIN_BLINK_TIME = 0.1;

let EAR_BUFFER = [];

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

const WORD_LIST = ["HELLO","HI","YES","NO","THANK","YOU","HELP","I","AM","GOOD","BAD"];

// App State
let isCameraRunning = false;
let eyeClosed = false;
let blinkStart = null;
let lastBlink = Date.now() / 1000;

let currentMorse = "";
let finalText = "";

// DOM Elements
const videoEl = document.getElementById('webcam');
const canvasEl = document.getElementById('output_canvas');
const canvasCtx = canvasEl.getContext('2d');
const loadingOverlay = document.getElementById('loading-overlay');
const startOverlay = document.getElementById('start-overlay');
const cameraBtn = document.getElementById('camera-btn');
const clearBtn = document.getElementById('clear-btn');
const morseDisplay = document.getElementById('morse-display');
const textDisplay = document.getElementById('text-display');
const blinksVal = document.getElementById('blinks-val');
const validVal = document.getElementById('valid-val');
const accuracyVal = document.getElementById('accuracy-val');
const morseGrid = document.getElementById('morse-grid');

// Helper Functions
function getDistance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function eyeAspectRatio(landmarks, eyeIndices) {
    const eye = eyeIndices.map(i => landmarks[i]);
    const A = getDistance(eye[1], eye[5]);
    const B = getDistance(eye[2], eye[4]);
    const C = getDistance(eye[0], eye[3]);
    return (A + B) / (2.0 * C);
}

function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function similarText(str1, str2) {
    if (str1 === str2) return 1.0;
    const dist = levenshteinDistance(str1, str2);
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1.0;
    
    // Return a similarity ratio format (1.0 = exact match, 0.0 = no match)
    return 1 - (dist / maxLen);
}

function autocorrect(word) {
    if (!word) return word;
    let bestMatch = word;
    let highestScore = 0;
    
    // Python cutoff was 0.6
    for (const w of WORD_LIST) {
        const score = similarText(word, w);
        if (score > highestScore && score >= 0.6) {
            highestScore = score;
            bestMatch = w;
        }
    }
    return bestMatch;
}

function updateUI() {
    // Show current morse, fallback to placeholder
    if (currentMorse) {
        morseDisplay.innerText = currentMorse;
    } else {
        morseDisplay.innerHTML = '<span class="placeholder">Awaiting blink...</span>';
    }
    
    textDisplay.innerText = finalText;
    blinksVal.innerText = total_blinks;
    validVal.innerText = valid_blinks;
    
    const accuracy = total_blinks ? ((valid_blinks / total_blinks) * 100).toFixed(2) : 100;
    accuracyVal.innerText = `${accuracy}%`;
    
    // Style check
    if (accuracy < 50) accuracyVal.style.color = 'var(--danger)';
    else accuracyVal.style.color = 'var(--accent)';
}

function clearState() {
    currentMorse = "";
    finalText = "";
    total_blinks = 0;
    valid_blinks = 0;
    EAR_BUFFER = [];
    eyeClosed = false;
    blinkStart = null;
    lastBlink = Date.now() / 1000;
    updateUI();
}

// Ensure elements exist
if (!window.FaceMesh) {
    console.warn("FaceMesh not imported properly.");
} else {
    // Setup MediaPipe Face Mesh
    window.faceMesh = new FaceMesh({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
    }});

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);
}

function triggerMorseAnimation() {
    morseDisplay.classList.remove('morse-added');
    // Force a reflow
    void morseDisplay.offsetWidth;
    morseDisplay.classList.add('morse-added');
}


function onResults(results) {
    // Manage canvas drawing
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        const currentTime = Date.now() / 1000;
        const width = canvasEl.width;
        const height = canvasEl.height;
        
        // Convert normalized coordinates to pixel coords
        const scaledLandmarks = landmarks.map(lm => ({ x: lm.x * width, y: lm.y * height }));
        
        // Draw delicate tracking dots over the eyes
        canvasCtx.fillStyle = "rgba(16, 185, 129, 0.8)"; // Accent green
        
        for (const i of LEFT_EYE) {
            canvasCtx.beginPath();
            canvasCtx.arc(scaledLandmarks[i].x, scaledLandmarks[i].y, 1.5, 0, 2 * Math.PI);
            canvasCtx.fill();
        }
        for (const i of RIGHT_EYE) {
            canvasCtx.beginPath();
            canvasCtx.arc(scaledLandmarks[i].x, scaledLandmarks[i].y, 1.5, 0, 2 * Math.PI);
            canvasCtx.fill();
        }
        
        const leftEAR = eyeAspectRatio(scaledLandmarks, LEFT_EYE);
        const rightEAR = eyeAspectRatio(scaledLandmarks, RIGHT_EYE);
        const rawEAR = (leftEAR + rightEAR) / 2;
        
        EAR_BUFFER.push(rawEAR);
        if (EAR_BUFFER.length > BUFFER_SIZE) EAR_BUFFER.shift();
        
        const ear = EAR_BUFFER.reduce((a, b) => a + b, 0) / EAR_BUFFER.length;
        
        // Blink logic
        if (ear < EAR_THRESHOLD && !eyeClosed) {
            eyeClosed = true;
            blinkStart = currentTime;
            
            // Draw visual feedback (blue tint) when eye is closed
            canvasCtx.fillStyle = "rgba(59, 130, 246, 0.4)";
            canvasCtx.fillRect(0, 0, width, height);
            
        } else if (ear >= EAR_THRESHOLD && eyeClosed) {
            eyeClosed = false;
            const duration = currentTime - blinkStart;
            lastBlink = currentTime;
            total_blinks++;
            
            // Draw valid blink feedback on release
            if (duration >= MIN_BLINK_TIME) {
                valid_blinks++;
                // Check if dot or dash based on time
                if (duration < DOT_TIME) {
                    currentMorse += ".";
                } else {
                    currentMorse += "-";
                }
                triggerMorseAnimation();
                updateUI();
            }
        }
    }
    canvasCtx.restore();
}

// Track pauses for translating
setInterval(() => {
    if (!isCameraRunning) return;
    
    const currentTime = Date.now() / 1000;
    const pause = currentTime - lastBlink;
    
    let changed = false;
    
    // Evaluate letter pause
    if (pause > LETTER_PAUSE && currentMorse) {
        const letter = MORSE_DICT[currentMorse] || "?";
        finalText += letter;
        currentMorse = "";
        lastBlink = currentTime;
        changed = true;
    }
    
    // Evaluate word pause
    if (pause > WORD_PAUSE && finalText && !finalText.endsWith(" ")) {
        const words = finalText.trim().split(" ");
        const lastWord = words[words.length - 1];
        words[words.length - 1] = autocorrect(lastWord);
        finalText = words.join(" ") + " ";
        changed = true;
    }
    
    if (changed) updateUI();
}, 100);

let camera = null;

async function toggleCamera() {
    if (isCameraRunning) {
        // Stop Camera
        if (camera) {
            camera.stop();
        }
        isCameraRunning = false;
        cameraBtn.innerText = "Start Camera";
        cameraBtn.classList.replace('secondary', 'primary');
        startOverlay.style.display = 'flex';
        loadingOverlay.style.display = 'none';
        
        canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    } else {
        // Start Camera
        startOverlay.style.display = 'none';
        loadingOverlay.style.display = 'flex';
        cameraBtn.disabled = true;
        cameraBtn.innerText = "Starting...";
        
        if (!camera) {
            camera = new Camera(videoEl, {
                onFrame: async () => {
                    if (isCameraRunning) {
                        try {
                            await faceMesh.send({image: videoEl});
                        } catch(err) {
                            console.error(err);
                        }
                    }
                },
                width: 640,
                height: 480
            });
        }
        
        await camera.start();
        isCameraRunning = true;
        
        loadingOverlay.style.display = 'none';
        cameraBtn.innerText = "Pause Camera";
        cameraBtn.classList.replace('primary', 'secondary');
        cameraBtn.disabled = false;
        
        // Optional: clear state on start
        // clearState(); 
        // We'll reset lastBlink so we don't translate garbage instantly
        lastBlink = Date.now() / 1000;
    }
}

// Event Listeners
cameraBtn.addEventListener('click', toggleCamera);
clearBtn.addEventListener('click', clearState);

// Initialize
updateUI();

// Populate Morse Code Dictionary Window
function initMorseDictionary() {
    if (!morseGrid) return;
    
    // Sort alphabet A-Z
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    
    // Create an inverted dictionary to match Letters -> Codes easily
    const invertedDict = {};
    for (const [code, letter] of Object.entries(MORSE_DICT)) {
        invertedDict[letter] = code;
    }
    
    // Build the Grid Items
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
