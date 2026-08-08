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
access, and click **Calibrate posture** in Settings while sitting up
straight. Do this once per spot you typically sit in — it saves to that
browser's local storage.

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

Calibration records these ratios while you sit well. During monitoring, if
either ratio drops more than the sensitivity threshold below its
calibrated value for longer than the "hold time" (to ignore brief
movements), an alert fires. Both bars in the main view show live scores
(green = good, yellow/red = drifting).

## Settings

- **Sensitivity** — how much drift is tolerated before alerting.
- **Sound alert** — repeating beep while posture is bad, with volume.
- **Visual alert** — red flashing border + banner while posture is bad.
- **Bad posture hold time** — seconds of sustained bad posture before
  alerting (avoids false alarms from quick movements/turning your head).
- **Show skeleton overlay** — draws the tracked points for debugging/trust.
- **Mirror video** — flips the preview so it behaves like a mirror.
