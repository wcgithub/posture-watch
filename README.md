# Posture Watch

A browser-based posture monitor. It uses your webcam and on-device pose
detection (Google's MediaPipe Pose Landmarker, running via WebAssembly) to
track your ears and shoulders, and warns you when your head or shoulders
drift forward from a calibrated "good posture" baseline.

- 100% client-side: video is processed on your device and never uploaded
  anywhere or sent to Claude — the app has no backend at all.
- Works on Mac (Safari/Chrome), iPad (Safari), and Android (Chrome) since
  it's just a web page — no app install needed.
- Alerts: an audible beep, a flashing red screen border + "STRAIGHTEN UP"
  banner, or both — configurable in Settings (⚙ top right).

## Run it on your Mac

Browsers only allow camera access on "secure" origins, and `localhost`
counts as one, so just serve the folder locally:

```bash
cd /Users/wilburchannels/projects/posture01
python3 -m http.server 8765
```

Then open **http://localhost:8765** in Chrome or Safari, allow camera
access, and in Settings click **Calibrate good posture** (sit up straight)
and **Calibrate bad posture** (slouch / crane your head forward like you
normally would). Both are required before alerts activate. Do this once
per spot you typically sit in — it saves to that browser's local storage.

## Using it on iPad / Android

Mobile browsers require HTTPS (not just `localhost`) for camera access, so
you need to host the folder somewhere with a real HTTPS URL. Two easy
options:

**Option A — Netlify Drop (fastest, no account needed for a quick test)**
1. Go to https://app.netlify.com/drop in a browser on your Mac.
2. Drag the `posture01` folder onto the page.
3. It gives you an `https://...netlify.app` URL — open that on your
   iPad/Android.

**Option B — GitHub Pages (free, permanent)**
1. Push this folder to a GitHub repo.
2. In the repo Settings → Pages, enable Pages for the `main` branch.
3. Open the resulting `https://<you>.github.io/<repo>/` URL on your devices.

Either way, once loaded, calibrate separately on each device — it stores
calibration locally in that browser, since your torso/camera angle differs
by device and where you place it.

## How detection works

Each frame, the app measures two ratios (normalized by the distance
between your ears, so it's insensitive to how far you are from the
camera):

- **Head position**: distance from your nose to your shoulder midpoint.
  This shrinks as your head drops forward/down toward your shoulders.
- **Shoulder position**: distance between your shoulders. This shrinks as
  shoulders round forward/inward.

Calibration records both ratios twice — once for your good posture and
once for your bad posture (however *you* slouch or crane forward). Each
metric is then scored on a 0–1 scale where 1 = matches your good
calibration and 0 = matches your bad calibration, so the alert threshold
is based on your own actual range of motion instead of a generic
percentage. Both bars in the main view show live scores (green = good,
yellow/red = drifting), and the **Posture over time** chart plots both
scores continuously over a configurable time window, with dashed lines
showing where each sensitivity threshold currently sits. Below the lines,
two labeled strips (Head / Shoulders) fill in red for exactly the stretches
of time each metric was bad enough to alert.

## Settings

- **Calibrate good / bad posture** — two independent captures; redo either
  one any time without affecting the other.
- **Head / Shoulder sensitivity** — separate 0–100% sliders per metric,
  each set as how far from your good posture (toward your bad posture)
  triggers an alert. Lower = stricter/sooner, higher = more tolerant.
- **Sound alert** — repeating beep while posture is bad, with volume.
- **Visual alert** — red flashing border + banner while posture is bad.
- **Bad posture hold time** — seconds of sustained bad posture before
  alerting (avoids false alarms from quick movements/turning your head).
- **History chart time window** — how many past seconds the trend chart
  shows.
- **Show skeleton overlay** — draws the tracked points for debugging/trust.
- **Mirror video** — flips the preview so it behaves like a mirror.

## Pausing

Click **⏸ Pause** (top right) to stop monitoring and silence any active
alert — handy when you step away or want to move without triggering
alerts. The camera stays on for a fast resume; click **▶ Resume** to pick
back up.
