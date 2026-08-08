import {
  PoseLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

// ---------- DOM ----------
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const loading = document.getElementById("loading");
const loadingText = document.getElementById("loadingText");
const statusBanner = document.getElementById("statusBanner");
const alertFlash = document.getElementById("alertFlash");
const headBar = document.getElementById("headBar");
const shoulderBar = document.getElementById("shoulderBar");

const settingsPanel = document.getElementById("settingsPanel");
const settingsToggle = document.getElementById("settingsToggle");
const closeSettings = document.getElementById("closeSettings");
const calibrateBtn = document.getElementById("calibrateBtn");
const calibrateStatus = document.getElementById("calibrateStatus");
const sensitivityInput = document.getElementById("sensitivity");
const soundToggle = document.getElementById("soundToggle");
const volumeInput = document.getElementById("volume");
const visualToggle = document.getElementById("visualToggle");
const badHoldInput = document.getElementById("badHold");
const skeletonToggle = document.getElementById("skeletonToggle");
const mirrorToggle = document.getElementById("mirrorToggle");

// ---------- Landmark indices (BlazePose) ----------
const NOSE = 0;
const LEFT_EAR = 7;
const RIGHT_EAR = 8;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const SKELETON_POINTS = [NOSE, LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER];
const SKELETON_LINES = [
  [LEFT_EAR, RIGHT_EAR],
  [LEFT_SHOULDER, RIGHT_SHOULDER],
  [LEFT_EAR, LEFT_SHOULDER],
  [RIGHT_EAR, RIGHT_SHOULDER],
];

// ---------- Settings (persisted) ----------
const SETTINGS_KEY = "postureWatch.settings.v1";
const CALIBRATION_KEY = "postureWatch.calibration.v1";

const defaultSettings = {
  sensitivity: 18,
  sound: true,
  volume: 60,
  visual: true,
  badHoldSec: 1.5,
  skeleton: true,
  mirror: true,
};

let settings = { ...defaultSettings, ...loadJSON(SETTINGS_KEY, {}) };
let calibration = loadJSON(CALIBRATION_KEY, null);

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
function saveCalibration() {
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(calibration));
}

function applySettingsToUI() {
  sensitivityInput.value = settings.sensitivity;
  soundToggle.checked = settings.sound;
  volumeInput.value = settings.volume;
  visualToggle.checked = settings.visual;
  badHoldInput.value = settings.badHoldSec;
  skeletonToggle.checked = settings.skeleton;
  mirrorToggle.checked = settings.mirror;
  video.classList.toggle("mirrored", settings.mirror);
  overlay.classList.toggle("mirrored", settings.mirror);
}
applySettingsToUI();

// ---------- Settings panel wiring ----------
settingsToggle.addEventListener("click", () => settingsPanel.classList.remove("hidden"));
closeSettings.addEventListener("click", () => settingsPanel.classList.add("hidden"));

sensitivityInput.addEventListener("input", () => {
  settings.sensitivity = Number(sensitivityInput.value);
  saveSettings();
});
soundToggle.addEventListener("change", () => {
  settings.sound = soundToggle.checked;
  saveSettings();
});
volumeInput.addEventListener("input", () => {
  settings.volume = Number(volumeInput.value);
  saveSettings();
});
visualToggle.addEventListener("change", () => {
  settings.visual = visualToggle.checked;
  if (!settings.visual) {
    statusBanner.classList.add("hidden");
    alertFlash.classList.remove("active");
  }
  saveSettings();
});
badHoldInput.addEventListener("change", () => {
  settings.badHoldSec = Number(badHoldInput.value);
  saveSettings();
});
skeletonToggle.addEventListener("change", () => {
  settings.skeleton = skeletonToggle.checked;
  saveSettings();
});
mirrorToggle.addEventListener("change", () => {
  settings.mirror = mirrorToggle.checked;
  video.classList.toggle("mirrored", settings.mirror);
  overlay.classList.toggle("mirrored", settings.mirror);
  saveSettings();
});

// ---------- Audio alert ----------
let audioCtx = null;
let beepTimer = null;

function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function beep() {
  if (!settings.sound) return;
  ensureAudioCtx();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  const vol = Math.max(0, Math.min(1, settings.volume / 100)) * 0.25;
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.35);
}

function startBeeping() {
  if (beepTimer) return;
  beep();
  beepTimer = setInterval(beep, 2200);
}
function stopBeeping() {
  clearInterval(beepTimer);
  beepTimer = null;
}

// Unlock audio on first user gesture (required by iOS Safari)
document.body.addEventListener(
  "click",
  () => {
    ensureAudioCtx();
  },
  { once: true }
);

// ---------- Camera + model setup ----------
async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });
  video.play();
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

let poseLandmarker = null;

async function setupPoseLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

// ---------- Metrics ----------
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Returns null if key landmarks aren't confidently visible
function computeMetrics(landmarks) {
  const nose = landmarks[NOSE];
  const lEar = landmarks[LEFT_EAR];
  const rEar = landmarks[RIGHT_EAR];
  const lSh = landmarks[LEFT_SHOULDER];
  const rSh = landmarks[RIGHT_SHOULDER];

  const minVis = 0.4;
  for (const p of [nose, lEar, rEar, lSh, rSh]) {
    if (!p || (p.visibility !== undefined && p.visibility < minVis)) return null;
  }

  const earWidth = dist(lEar, rEar) || 0.0001;
  const shoulderMid = mid(lSh, rSh);
  const shoulderWidth = dist(lSh, rSh);

  return {
    headDropRatio: dist(nose, shoulderMid) / earWidth,
    shoulderWidthRatio: shoulderWidth / earWidth,
  };
}

// Exponential smoothing of live metrics to reduce jitter
let smoothed = null;
const SMOOTHING = 0.35;
function smoothMetrics(m) {
  if (!smoothed) {
    smoothed = { ...m };
  } else {
    smoothed.headDropRatio += (m.headDropRatio - smoothed.headDropRatio) * SMOOTHING;
    smoothed.shoulderWidthRatio += (m.shoulderWidthRatio - smoothed.shoulderWidthRatio) * SMOOTHING;
  }
  return smoothed;
}

// ---------- Calibration ----------
let calibrating = false;

calibrateBtn.addEventListener("click", () => runCalibration());

async function runCalibration() {
  if (calibrating) return;
  calibrating = true;
  calibrateBtn.disabled = true;

  for (let s = 3; s > 0; s--) {
    calibrateStatus.textContent = `Sit up straight... capturing in ${s}`;
    await new Promise((r) => setTimeout(r, 1000));
  }

  calibrateStatus.textContent = "Hold still...";
  const samples = [];
  const start = performance.now();
  while (performance.now() - start < 1200) {
    if (lastMetrics) samples.push(lastMetrics);
    await new Promise((r) => requestAnimationFrame(r));
  }

  if (samples.length === 0) {
    calibrateStatus.textContent = "Couldn't see you clearly — try again with better lighting.";
    calibrating = false;
    calibrateBtn.disabled = false;
    return;
  }

  const avg = (key) => samples.reduce((sum, s) => sum + s[key], 0) / samples.length;
  calibration = {
    headDropRatio: avg("headDropRatio"),
    shoulderWidthRatio: avg("shoulderWidthRatio"),
  };
  saveCalibration();

  calibrateStatus.textContent = "Calibrated! Alerts are now active.";
  calibrating = false;
  calibrateBtn.disabled = false;
}

if (calibration) {
  calibrateStatus.textContent = "Using saved calibration from this browser.";
}

// ---------- Posture evaluation ----------
let lastMetrics = null;
let badSince = null;
let goodSince = null;
let isAlerting = false;

function evaluatePosture(m) {
  if (!calibration) return { bad: false, headScore: 0.5, shoulderScore: 0.5 };

  const thresh = settings.sensitivity / 100; // fraction of baseline allowed to shrink

  // headDropRatio / shoulderWidthRatio shrink when posture worsens (head forward/down,
  // shoulders rounding in). Score: 1 = as good as calibration or better, 0 = at/past threshold.
  const headScore = clamp01(
    (m.headDropRatio - calibration.headDropRatio * (1 - thresh)) /
      (calibration.headDropRatio * thresh)
  );
  const shoulderScore = clamp01(
    (m.shoulderWidthRatio - calibration.shoulderWidthRatio * (1 - thresh)) /
      (calibration.shoulderWidthRatio * thresh)
  );

  const bad = headScore <= 0 || shoulderScore <= 0;
  return { bad, headScore, shoulderScore };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function updateBars(headScore, shoulderScore) {
  setBar(headBar, headScore);
  setBar(shoulderBar, shoulderScore);
}
function setBar(el, score) {
  el.style.width = `${Math.round(score * 100)}%`;
  el.style.background =
    score > 0.5 ? "var(--good)" : score > 0 ? "#ffcc00" : "var(--bad)";
}

function handleAlertState(bad) {
  const now = performance.now();
  if (bad) {
    goodSince = null;
    if (badSince === null) badSince = now;
    const holdMs = settings.badHoldSec * 1000;
    if (!isAlerting && now - badSince >= holdMs) {
      isAlerting = true;
      triggerAlertOn();
    }
  } else {
    badSince = null;
    if (goodSince === null) goodSince = now;
    if (isAlerting && now - goodSince >= 600) {
      isAlerting = false;
      triggerAlertOff();
    }
  }
}

function triggerAlertOn() {
  if (settings.visual) {
    statusBanner.classList.remove("hidden");
    alertFlash.classList.add("active");
  }
  if (settings.sound) startBeeping();
}
function triggerAlertOff() {
  statusBanner.classList.add("hidden");
  alertFlash.classList.remove("active");
  stopBeeping();
}

// ---------- Drawing ----------
function drawSkeleton(landmarks) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!settings.skeleton) return;

  ctx.strokeStyle = isAlerting ? "#ff453a" : "#34c759";
  ctx.lineWidth = 3;
  ctx.fillStyle = "#4da3ff";

  for (const [a, b] of SKELETON_LINES) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    ctx.beginPath();
    ctx.moveTo(pa.x * overlay.width, pa.y * overlay.height);
    ctx.lineTo(pb.x * overlay.width, pb.y * overlay.height);
    ctx.stroke();
  }
  for (const i of SKELETON_POINTS) {
    const p = landmarks[i];
    ctx.beginPath();
    ctx.arc(p.x * overlay.width, p.y * overlay.height, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- Main loop ----------
function renderLoop() {
  if (poseLandmarker && video.readyState >= 2) {
    const result = poseLandmarker.detectForVideo(video, performance.now());
    if (result.landmarks && result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];
      const raw = computeMetrics(landmarks);
      if (raw) {
        lastMetrics = raw;
        const m = smoothMetrics(raw);
        const { bad, headScore, shoulderScore } = evaluatePosture(m);
        updateBars(headScore, shoulderScore);
        handleAlertState(bad);
      }
      drawSkeleton(landmarks);
    } else {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
  }
  requestAnimationFrame(renderLoop);
}

// ---------- Boot ----------
async function boot() {
  try {
    loadingText.textContent = "Requesting camera access…";
    await setupCamera();
    loadingText.textContent = "Loading pose model…";
    await setupPoseLandmarker();
    loading.classList.add("hidden");
    renderLoop();
  } catch (err) {
    console.error(err);
    loadingText.textContent =
      "Error: " + (err && err.message ? err.message : "could not start camera/model.");
  }
}

boot();
