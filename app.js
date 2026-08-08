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
const pauseToggle = document.getElementById("pauseToggle");
const pausedOverlay = document.getElementById("pausedOverlay");
const modeBadge = document.getElementById("modeBadge");

const debugPanel = document.getElementById("debugPanel");
const dbgView = document.getElementById("dbgView");
const dbgEarVis = document.getElementById("dbgEarVis");
const dbgShVis = document.getElementById("dbgShVis");
const dbgHead = document.getElementById("dbgHead");
const dbgShoulder = document.getElementById("dbgShoulder");
const dbgScores = document.getElementById("dbgScores");
const dbgThresholds = document.getElementById("dbgThresholds");

const chartCanvas = document.getElementById("historyChart");
const chartCtx = chartCanvas.getContext("2d");

const settingsPanel = document.getElementById("settingsPanel");
const settingsToggle = document.getElementById("settingsToggle");
const closeSettings = document.getElementById("closeSettings");
const viewModeOverrideInput = document.getElementById("viewModeOverride");
const viewModeStatus = document.getElementById("viewModeStatus");
const calibrateGoodBtn = document.getElementById("calibrateGoodBtn");
const calibrateBadBtn = document.getElementById("calibrateBadBtn");
const calibrateGoodStatus = document.getElementById("calibrateGoodStatus");
const calibrateBadStatus = document.getElementById("calibrateBadStatus");
const calibrateMsg = document.getElementById("calibrateMsg");
const headSensitivityInput = document.getElementById("headSensitivity");
const shoulderSensitivityInput = document.getElementById("shoulderSensitivity");
const headSensVal = document.getElementById("headSensVal");
const shoulderSensVal = document.getElementById("shoulderSensVal");
const soundToggle = document.getElementById("soundToggle");
const volumeInput = document.getElementById("volume");
const visualToggle = document.getElementById("visualToggle");
const badHoldInput = document.getElementById("badHold");
const historyWindowInput = document.getElementById("historyWindow");
const skeletonToggle = document.getElementById("skeletonToggle");
const mirrorToggle = document.getElementById("mirrorToggle");
const debugInfoToggle = document.getElementById("debugInfoToggle");

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
const SETTINGS_KEY = "postureWatch.settings.v3";
const CALIBRATION_KEY = "postureWatch.calibration.v3";

const defaultSettings = {
  viewModeOverride: "auto", // "auto" | "frontal" | "profile"
  headSensitivity: 40,
  shoulderSensitivity: 40,
  sound: true,
  volume: 60,
  visual: true,
  badHoldSec: 1.5,
  historyWindowSec: 60,
  skeleton: true,
  mirror: true,
  debugInfo: false,
};

let settings = { ...defaultSettings, ...loadJSON(SETTINGS_KEY, {}) };
let calibration = loadJSON(CALIBRATION_KEY, null);
if (!calibration || typeof calibration !== "object" || !calibration.frontal) {
  calibration = { frontal: { good: null, bad: null }, profile: { good: null, bad: null } };
}

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

// Tracks which formula (frontal vs. profile) is currently active; declared
// early since UI setup below reads it before the view-detection loop runs.
let currentView = { view: "frontal", side: null, raw: null };

function applySettingsToUI() {
  viewModeOverrideInput.value = settings.viewModeOverride;
  headSensitivityInput.value = settings.headSensitivity;
  headSensVal.textContent = settings.headSensitivity;
  shoulderSensitivityInput.value = settings.shoulderSensitivity;
  shoulderSensVal.textContent = settings.shoulderSensitivity;
  soundToggle.checked = settings.sound;
  volumeInput.value = settings.volume;
  visualToggle.checked = settings.visual;
  badHoldInput.value = settings.badHoldSec;
  historyWindowInput.value = settings.historyWindowSec;
  skeletonToggle.checked = settings.skeleton;
  mirrorToggle.checked = settings.mirror;
  debugInfoToggle.checked = settings.debugInfo;
  debugPanel.classList.toggle("hidden", !settings.debugInfo);
  video.classList.toggle("mirrored", settings.mirror);
  overlay.classList.toggle("mirrored", settings.mirror);
}
applySettingsToUI();

function modeLabel(mode, side) {
  if (mode === "profile") return `Profile (${side || "…"})`;
  return "Frontal";
}

function refreshCalibrationUI() {
  const mode = currentView.view;
  const cal = calibration[mode];
  const label = modeLabel(mode, currentView.side);

  calibrateGoodBtn.textContent = `Calibrate good posture (${label})`;
  calibrateBadBtn.textContent = `Calibrate bad posture (${label})`;
  calibrateGoodStatus.textContent = cal.good ? "Calibrated" : "Not set";
  calibrateGoodStatus.classList.toggle("set", !!cal.good);
  calibrateBadStatus.textContent = cal.bad ? "Calibrated" : "Not set";
  calibrateBadStatus.classList.toggle("set", !!cal.bad);

  if (cal.good && cal.bad) {
    calibrateMsg.textContent = `Both poses calibrated for ${label} — alerts are active.`;
  } else if (cal.good || cal.bad) {
    calibrateMsg.textContent = `Calibrate the other ${label} pose too to activate alerts.`;
  } else {
    calibrateMsg.textContent = `Calibrate both ${label} poses to activate alerts.`;
  }

  viewModeStatus.textContent = `Currently detected: ${label}`;
  modeBadge.textContent = label;
}
refreshCalibrationUI();

// ---------- Settings panel wiring ----------
settingsToggle.addEventListener("click", () => settingsPanel.classList.remove("hidden"));
closeSettings.addEventListener("click", () => settingsPanel.classList.add("hidden"));

viewModeOverrideInput.addEventListener("change", () => {
  settings.viewModeOverride = viewModeOverrideInput.value;
  saveSettings();
});
headSensitivityInput.addEventListener("input", () => {
  settings.headSensitivity = Number(headSensitivityInput.value);
  headSensVal.textContent = settings.headSensitivity;
  saveSettings();
});
shoulderSensitivityInput.addEventListener("input", () => {
  settings.shoulderSensitivity = Number(shoulderSensitivityInput.value);
  shoulderSensVal.textContent = settings.shoulderSensitivity;
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
historyWindowInput.addEventListener("change", () => {
  settings.historyWindowSec = Number(historyWindowInput.value);
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
debugInfoToggle.addEventListener("change", () => {
  settings.debugInfo = debugInfoToggle.checked;
  debugPanel.classList.toggle("hidden", !settings.debugInfo);
  saveSettings();
});

// ---------- Pause ----------
let paused = false;

pauseToggle.addEventListener("click", () => {
  paused = !paused;
  pauseToggle.textContent = paused ? "▶ Resume" : "⏸ Pause";
  pausedOverlay.classList.toggle("hidden", !paused);
  if (paused) {
    resetAlertTiming();
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }
});

function resetAlertTiming() {
  badSince = null;
  goodSince = null;
  if (isAlerting) {
    isAlerting = false;
    triggerAlertOff();
  }
}

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

// ---------- Helpers ----------
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
function clampRange(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function vis(p) {
  return p.visibility !== undefined ? p.visibility : 1;
}

// ---------- View detection (frontal vs. profile) ----------
// A profile view means one whole side (ear + shoulder) is occluded — its
// landmarks come back with low confidence even though MediaPipe still
// guesses a position for them. A big visibility gap between left and right
// is the signal; a plain "turned my head" on a frontal camera doesn't drop
// visibility nearly this much, it's momentary and both sides stay visible.
function detectRawView(landmarks) {
  const lEarVis = vis(landmarks[LEFT_EAR]);
  const rEarVis = vis(landmarks[RIGHT_EAR]);
  const lShVis = vis(landmarks[LEFT_SHOULDER]);
  const rShVis = vis(landmarks[RIGHT_SHOULDER]);
  const leftVis = (lEarVis + lShVis) / 2;
  const rightVis = (rEarVis + rShVis) / 2;
  const minVis = Math.min(leftVis, rightVis);
  const maxVis = Math.max(leftVis, rightVis);
  const isProfile = minVis < 0.5 && maxVis - minVis > 0.3;

  return {
    view: isProfile ? "profile" : "frontal",
    side: isProfile ? (leftVis > rightVis ? "left" : "right") : null,
    lEarVis,
    rEarVis,
    lShVis,
    rShVis,
  };
}

const VIEW_SWITCH_HOLD_MS = 1500; // sustained disagreement required before switching modes
let viewModeStable = "frontal";
let viewModeSide = null;
let pendingView = null;
let pendingSince = 0;

function updateViewMode(landmarks) {
  const raw = detectRawView(landmarks);

  if (settings.viewModeOverride !== "auto") {
    viewModeStable = settings.viewModeOverride;
    if (raw.side) viewModeSide = raw.side;
    currentView = { view: viewModeStable, side: viewModeStable === "profile" ? viewModeSide || "left" : null, raw };
    return currentView;
  }

  if (raw.view !== viewModeStable) {
    if (pendingView !== raw.view) {
      pendingView = raw.view;
      pendingSince = performance.now();
    } else if (performance.now() - pendingSince >= VIEW_SWITCH_HOLD_MS) {
      viewModeStable = raw.view;
      pendingView = null;
    }
  } else {
    pendingView = null;
  }

  if (raw.view === "profile") viewModeSide = raw.side;
  currentView = { view: viewModeStable, side: viewModeStable === "profile" ? viewModeSide : null, raw };
  return currentView;
}

// ---------- Metrics ----------
// Frontal: head metric is the *vertical* drop from nose to shoulder-midpoint
// (not full 2D distance) normalized by shoulder width. Turning your head
// left/right shifts the nose sideways, not down, and shoulder width barely
// changes with head-only yaw — so this stays stable through head turns
// while still catching genuine forward/down craning.
function computeFrontalMetrics(landmarks) {
  const nose = landmarks[NOSE];
  const lEar = landmarks[LEFT_EAR];
  const rEar = landmarks[RIGHT_EAR];
  const lSh = landmarks[LEFT_SHOULDER];
  const rSh = landmarks[RIGHT_SHOULDER];

  const minVis = 0.4;
  for (const p of [nose, lEar, rEar, lSh, rSh]) {
    if (!p || vis(p) < minVis) return null;
  }

  const earWidth = dist(lEar, rEar) || 0.0001;
  const shoulderWidth = dist(lSh, rSh) || 0.0001;
  const shoulderMid = mid(lSh, rSh);

  return {
    head: (shoulderMid.y - nose.y) / shoulderWidth,
    shoulder: shoulderWidth / earWidth,
  };
}

// Profile: uses whichever side is actually visible. Both metrics come from
// the ear→shoulder vector, split into its two axes — horizontal offset
// (how far the ear has crept forward of the shoulder, the classic
// craniovertebral-angle signal) and vertical offset (how much the head has
// dropped toward the shoulder, i.e. collapsing/slumping). Normalized by
// ear-to-nose distance, a small but stable head-size reference that doesn't
// require the hips to be in frame.
function computeProfileMetrics(landmarks, side) {
  const ear = landmarks[side === "left" ? LEFT_EAR : RIGHT_EAR];
  const shoulder = landmarks[side === "left" ? LEFT_SHOULDER : RIGHT_SHOULDER];
  const nose = landmarks[NOSE];

  const minVis = 0.35;
  for (const p of [ear, shoulder, nose]) {
    if (!p || vis(p) < minVis) return null;
  }

  const scaleRef = dist(ear, nose) || 0.0001;

  return {
    head: (ear.x - shoulder.x) / scaleRef,
    shoulder: (shoulder.y - ear.y) / scaleRef,
  };
}

// Returns null if key landmarks aren't confidently visible for the given view
function computeMetrics(landmarks, mode, side) {
  return mode === "profile" ? computeProfileMetrics(landmarks, side) : computeFrontalMetrics(landmarks);
}

// Exponential smoothing of live metrics to reduce jitter. Hard-resets
// (instead of blending) whenever the view mode changes, since frontal and
// profile metrics are on entirely different scales.
let smoothed = null;
let smoothedMode = null;
const SMOOTHING = 0.35;
function smoothMetrics(m, mode) {
  if (!smoothed || smoothedMode !== mode) {
    smoothed = { ...m };
    smoothedMode = mode;
  } else {
    smoothed.head += (m.head - smoothed.head) * SMOOTHING;
    smoothed.shoulder += (m.shoulder - smoothed.shoulder) * SMOOTHING;
  }
  return smoothed;
}

// ---------- Calibration ----------
let calibrating = false;
let lastMetrics = null;
let lastMetricsMode = null;

calibrateGoodBtn.addEventListener("click", () => runCalibration("good"));
calibrateBadBtn.addEventListener("click", () => runCalibration("bad"));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runCalibration(kind) {
  if (calibrating) return;
  calibrating = true;
  calibrateGoodBtn.disabled = true;
  calibrateBadBtn.disabled = true;

  const mode = currentView.view;
  const label = kind === "good" ? "good, upright" : "bad (slouched / head forward)";
  const viewText = modeLabel(mode, currentView.side);

  for (let s = 3; s > 0; s--) {
    calibrateMsg.textContent = `Get into your ${label} posture (${viewText})... capturing in ${s}`;
    await sleep(1000);
  }

  calibrateMsg.textContent = "Hold still...";
  const samples = [];
  const start = performance.now();
  while (performance.now() - start < 1200) {
    if (lastMetrics && lastMetricsMode === mode) samples.push(lastMetrics);
    await new Promise((r) => requestAnimationFrame(r));
  }

  if (samples.length === 0) {
    calibrateMsg.textContent = "Couldn't see you clearly — try again with better lighting.";
  } else {
    const avg = (key) => samples.reduce((sum, s) => sum + s[key], 0) / samples.length;
    calibration[mode][kind] = {
      head: avg("head"),
      shoulder: avg("shoulder"),
    };
    saveCalibration();
    refreshCalibrationUI();
  }

  calibrating = false;
  calibrateGoodBtn.disabled = false;
  calibrateBadBtn.disabled = false;
}

// ---------- Posture evaluation ----------
let badSince = null;
let goodSince = null;
let isAlerting = false;

// value at calibration.good -> score 1, value at calibration.bad -> score 0, linear beyond
function scoreFromCalibration(value, goodVal, badVal) {
  if (goodVal === badVal) return 1;
  return (value - badVal) / (goodVal - badVal);
}

function evaluatePosture(m, mode) {
  const cal = calibration[mode];
  if (!cal.good || !cal.bad) {
    return { bad: false, headScore: 0.5, shoulderScore: 0.5, ready: false };
  }

  const headScore = scoreFromCalibration(m.head, cal.good.head, cal.bad.head);
  const shoulderScore = scoreFromCalibration(m.shoulder, cal.good.shoulder, cal.bad.shoulder);

  const headThreshold = 1 - settings.headSensitivity / 100;
  const shoulderThreshold = 1 - settings.shoulderSensitivity / 100;

  const bad = headScore <= headThreshold || shoulderScore <= shoulderThreshold;
  return { bad, headScore, shoulderScore, ready: true };
}

function updateBars(headScore, shoulderScore) {
  setBar(headBar, headScore);
  setBar(shoulderBar, shoulderScore);
}
function setBar(el, score) {
  el.style.width = `${Math.round(clamp01(score) * 100)}%`;
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

// ---------- Debug panel ----------
function fmt(v) {
  return v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(3);
}

function updateDebugPanel(viewInfo, raw, evalResult) {
  const mode = viewInfo.view;
  const cal = calibration[mode];
  dbgView.textContent = modeLabel(mode, viewInfo.side);
  dbgEarVis.textContent = `${fmt(viewInfo.raw.lEarVis)} / ${fmt(viewInfo.raw.rEarVis)}`;
  dbgShVis.textContent = `${fmt(viewInfo.raw.lShVis)} / ${fmt(viewInfo.raw.rShVis)}`;
  dbgHead.textContent = `${fmt(raw && raw.head)} / ${fmt(cal.good && cal.good.head)} / ${fmt(cal.bad && cal.bad.head)}`;
  dbgShoulder.textContent = `${fmt(raw && raw.shoulder)} / ${fmt(cal.good && cal.good.shoulder)} / ${fmt(cal.bad && cal.bad.shoulder)}`;
  dbgScores.textContent = `${fmt(evalResult.headScore)} / ${fmt(evalResult.shoulderScore)}`;
  dbgThresholds.textContent = `${fmt(1 - settings.headSensitivity / 100)} / ${fmt(1 - settings.shoulderSensitivity / 100)}`;
}

// ---------- Skeleton drawing ----------
function drawSkeleton(landmarks, viewInfo) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!settings.skeleton) return;

  const strokeColor = isAlerting ? "#ff453a" : "#34c759";
  ctx.lineWidth = 3;
  ctx.fillStyle = "#4da3ff";

  function drawLine(aIdx, bIdx) {
    const pa = landmarks[aIdx];
    const pb = landmarks[bIdx];
    ctx.beginPath();
    ctx.moveTo(pa.x * overlay.width, pa.y * overlay.height);
    ctx.lineTo(pb.x * overlay.width, pb.y * overlay.height);
    ctx.stroke();
  }
  function drawPoints(idxs) {
    for (const i of idxs) {
      const p = landmarks[i];
      ctx.beginPath();
      ctx.arc(p.x * overlay.width, p.y * overlay.height, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function drawMeasurement(pa, pb) {
    ctx.save();
    ctx.strokeStyle = "#ffcc00";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(pa.x * overlay.width, pa.y * overlay.height);
    ctx.lineTo(pb.x * overlay.width, pb.y * overlay.height);
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = strokeColor;

  if (viewInfo.view === "profile") {
    const side = viewInfo.side || "left";
    const earIdx = side === "left" ? LEFT_EAR : RIGHT_EAR;
    const shIdx = side === "left" ? LEFT_SHOULDER : RIGHT_SHOULDER;
    drawLine(NOSE, earIdx);
    drawLine(earIdx, shIdx);
    drawPoints([NOSE, earIdx, shIdx]);
    if (settings.debugInfo) drawMeasurement(landmarks[earIdx], landmarks[shIdx]);
  } else {
    for (const [a, b] of SKELETON_LINES) drawLine(a, b);
    drawPoints(SKELETON_POINTS);
    if (settings.debugInfo) {
      const lSh = landmarks[LEFT_SHOULDER];
      const rSh = landmarks[RIGHT_SHOULDER];
      drawMeasurement(landmarks[NOSE], mid(lSh, rSh));
    }
  }
}

// ---------- History chart ----------
const history = []; // { t, headScore, shoulderScore }
const HISTORY_SAMPLE_INTERVAL_MS = 100;
let lastHistorySampleT = 0;

function recordHistory(t, headScore, shoulderScore) {
  if (t - lastHistorySampleT < HISTORY_SAMPLE_INTERVAL_MS) return false;
  lastHistorySampleT = t;
  history.push({ t, headScore, shoulderScore });
  const cutoff = t - settings.historyWindowSec * 1000 - 2000;
  while (history.length && history[0].t < cutoff) history.shift();
  return true;
}

// Layout: line plot on top, two "bad enough to alert" indicator strips below
const CHART_PLOT_H = 128;
const CHART_STRIP_H = 14;
const CHART_STRIP_GAP = 6;
const CHART_HEAD_STRIP_Y = CHART_PLOT_H + CHART_STRIP_GAP;
const CHART_SHOULDER_STRIP_Y = CHART_HEAD_STRIP_Y + CHART_STRIP_H + 4;

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function drawHistoryChart() {
  const w = chartCanvas.width;
  const totalH = chartCanvas.height;
  const plotH = CHART_PLOT_H;
  chartCtx.clearRect(0, 0, w, totalH);

  const now = performance.now();
  const windowMs = settings.historyWindowSec * 1000;
  const tMin = now - windowMs;
  const yMin = -0.3;
  const yMax = 1.3;

  const yToPx = (score) => plotH - ((clampRange(score, yMin, yMax) - yMin) / (yMax - yMin)) * plotH;
  const tToPx = (t) => ((t - tMin) / windowMs) * w;

  chartCtx.strokeStyle = "rgba(255,255,255,0.08)";
  chartCtx.lineWidth = 1;
  [0, 1].forEach((gy) => {
    const py = yToPx(gy);
    chartCtx.beginPath();
    chartCtx.moveTo(0, py);
    chartCtx.lineTo(w, py);
    chartCtx.stroke();
  });

  const mode = currentView.view;
  const cal = calibration[mode];
  const haveCalibration = !!(cal.good && cal.bad);
  const headThreshold = 1 - settings.headSensitivity / 100;
  const shoulderThreshold = 1 - settings.shoulderSensitivity / 100;

  if (haveCalibration) {
    drawDashedLine(yToPx(headThreshold), "#4da3ff");
    drawDashedLine(yToPx(shoulderThreshold), "#c77dff");
  }

  drawSeries((p) => p.headScore, "#4da3ff");
  drawSeries((p) => p.shoulderScore, "#c77dff");

  if (haveCalibration) {
    drawBadStrip(CHART_HEAD_STRIP_Y, (p) => p.headScore <= headThreshold, "#4da3ff", "Head");
    drawBadStrip(CHART_SHOULDER_STRIP_Y, (p) => p.shoulderScore <= shoulderThreshold, "#c77dff", "Shoulders");
  }

  function drawDashedLine(py, color) {
    chartCtx.save();
    chartCtx.strokeStyle = color;
    chartCtx.globalAlpha = 0.5;
    chartCtx.setLineDash([4, 4]);
    chartCtx.beginPath();
    chartCtx.moveTo(0, py);
    chartCtx.lineTo(w, py);
    chartCtx.stroke();
    chartCtx.restore();
  }

  function drawSeries(getVal, color) {
    chartCtx.strokeStyle = color;
    chartCtx.lineWidth = 2;
    chartCtx.beginPath();
    let started = false;
    for (const point of history) {
      if (point.t < tMin) continue;
      const x = tToPx(point.t);
      const y = yToPx(getVal(point));
      if (!started) {
        chartCtx.moveTo(x, y);
        started = true;
      } else {
        chartCtx.lineTo(x, y);
      }
    }
    if (started) chartCtx.stroke();
  }

  // Fills the strip with a faint baseline tint, then solid red across any
  // stretch of history where isBad(point) held true — a timeline of exactly
  // when that metric was bad enough to alert.
  function drawBadStrip(y, isBad, color, label) {
    chartCtx.fillStyle = hexToRgba(color, 0.12);
    chartCtx.fillRect(0, y, w, CHART_STRIP_H);

    chartCtx.fillStyle = "#ff453a";
    let segStartX = null;
    let lastX = null;
    for (const point of history) {
      if (point.t < tMin) continue;
      const x = tToPx(point.t);
      const bad = isBad(point);
      if (bad && segStartX === null) segStartX = x;
      if (!bad && segStartX !== null) {
        chartCtx.fillRect(segStartX, y, Math.max(1, x - segStartX), CHART_STRIP_H);
        segStartX = null;
      }
      lastX = x;
    }
    if (segStartX !== null && lastX !== null) {
      chartCtx.fillRect(segStartX, y, Math.max(1, lastX - segStartX), CHART_STRIP_H);
    }

    chartCtx.strokeStyle = "rgba(255,255,255,0.15)";
    chartCtx.lineWidth = 1;
    chartCtx.strokeRect(0.5, y + 0.5, w - 1, CHART_STRIP_H - 1);

    chartCtx.fillStyle = "rgba(255,255,255,0.6)";
    chartCtx.font = "9px -apple-system, BlinkMacSystemFont, sans-serif";
    chartCtx.fillText(label, 4, y + CHART_STRIP_H - 3);
  }
}

// ---------- Main loop ----------
let lastKnownMode = null;
let lastKnownSide = null;

function renderLoop() {
  if (!paused && poseLandmarker && video.readyState >= 2) {
    const result = poseLandmarker.detectForVideo(video, performance.now());
    if (result.landmarks && result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];
      const viewInfo = updateViewMode(landmarks);

      if (viewInfo.view !== lastKnownMode || viewInfo.side !== lastKnownSide) {
        lastKnownMode = viewInfo.view;
        lastKnownSide = viewInfo.side;
        resetAlertTiming();
        refreshCalibrationUI();
      }

      const raw = computeMetrics(landmarks, viewInfo.view, viewInfo.side);
      let evalResult = { bad: false, headScore: 0.5, shoulderScore: 0.5, ready: false };
      if (raw) {
        lastMetrics = raw;
        lastMetricsMode = viewInfo.view;
        const m = smoothMetrics(raw, viewInfo.view);
        evalResult = evaluatePosture(m, viewInfo.view);
        updateBars(evalResult.headScore, evalResult.shoulderScore);
        handleAlertState(evalResult.bad);
        if (evalResult.ready) {
          const sampled = recordHistory(performance.now(), evalResult.headScore, evalResult.shoulderScore);
          if (sampled) drawHistoryChart();
        }
      }
      drawSkeleton(landmarks, viewInfo);
      if (settings.debugInfo) updateDebugPanel(viewInfo, raw, evalResult);
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
