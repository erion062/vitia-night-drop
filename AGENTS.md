# Marketing video workflow

- The editable Canvas animation is `marketing/motion-ads.html`. It uses the existing VND logo geometry, Albanian copy, and `vndviti.com` as the confirmed advertising domain.
- `node scripts/render-motion-ads.mjs --preview-only` generates a storyboard, cover images, and the original synthesized instrumental without encoding videos.
- `node scripts/render-motion-ads.mjs` exports 10 silent TikTok videos (01–10, 10–36 s each) as 1080×1920, 30 fps H.264/AAC MP4s to `marketing/video-ads/` and verifies their metadata and full decoding. Each gets `<name>-cover.png` and `<name>-storyboard.png`. Captions/hashtags per video are in `marketing/video-ads/tiktok-captions.md`.
- `--ad=N` or `--ad=1,4,7` selects videos. Videos 05–08 need `partner-campaign.json` (run `prepare-partner-ad.mjs` once). The walkthroughs use illustrative product, account, and map data rather than placing real orders.
- Scenes live in `motion-ads.html` as `scene*` functions indexed by `names`/`durations`/`sceneLengths`; the render script mirrors those arrays in `NAMES`/`DURATIONS`/`SCENE_LENGTHS` — keep them in sync. Background beats are `vnd-beat-<duration>s.wav`.
- Rendering requires Node.js with built-in WebSocket support, FFmpeg/FFprobe on PATH, and Chrome or Edge. Set `CHROME_PATH` if the browser is installed outside the standard Windows locations. No Python or additional npm dependencies are required.
- `node scripts/render-motion-ads.mjs --verify` verifies existing exports. Inspect `marketing/video-ads/storyboard.png` for layout and review the videos with sound for creative quality.
- `node scripts/render-motion-ads.mjs --serve` serves only the ad preview and exported media on `http://127.0.0.1:8790` without starting the application or accessing its database.
- Keep marketing claims limited to confirmed facts. These ads deliberately omit prices, opening hours, guaranteed delivery times, tobacco, and third-party music samples.
- Partner campaigns use the active partner array from `https://vndviti.com/api/products`, not the marketing prospect list. `node scripts/prepare-partner-ad.mjs` rechecks the live catalog, downloads public menu assets into `video-ads/partner-assets/`, and writes `partner-campaign.json` + `partner-campaign.js`. It also generates edge-tts Albanian narration (`sq-AL-AnilaNeural`), but the user rejected that voice as unnatural — videos are currently rendered **without** voice-over. A premium TTS service is planned; do not re-add edge-tts narration to the videos.
- The preparation script stops if the active partner set changes, so review the partner scenes before updating it. Never advertise test catalog items (Andi Market currently only has a "test" product — show its name/logo only) or use private customer/order records as video assets.

# Instagram Halloween set

- `marketing/instagram-halloween/` holds 10 Halloween posts (1080×1350 JPG/PNG), captions, gallery `index.html`, `contact-sheet.jpg` and `VND-Halloween-10-Posts.zip`. The first set (`instagram-tonight/`) stays untouched.
- Rebuild with Blender's Python (has Pillow/numpy): `scripts/prepare-halloween-assets.py` (snapshots live public prices `price_cents` + images into `catalogue-check.json`), then `scripts/make-halloween-posts.py` (reuses the `Poster` engine from `make-instagram-posts.py`).
- Posts show the real current prices as "Çmimi i Halloween-it, deri 31.10". From 1 November 2026 00:00 Europe/Belgrade, every product with a price gets +€0.30 once (`server/lib/priceRaise.js`, flag `price_raise_2026_11_01`). Never show an inflated "was" price or fake discount.

# Minimalist live wallpaper

- `node scripts/render-live-wallpaper.mjs` creates `wallpapers/mindset-live-wallpaper.mp4` (WebM fallback if MP4 encoding is unavailable) and `wallpapers/mindset-preview.png`. The wallpaper is a silent, 48-second, 2560×1440 black-background loop with centered motivational code-style typing.
- Rendering uses Chrome/Edge's built-in MediaRecorder, not FFmpeg or the application server. Node.js with built-in WebSocket support is required; `CHROME_PATH` can override browser discovery. Verification checks decoded dimensions, duration, playback to completion, frame count, and matching loop-boundary artwork.
- The deliverable is a video for a desktop wallpaper player such as Lively Wallpaper or Wallpaper Engine, not an HTML wallpaper. Customize the `PHRASES` array in the render script.

# Night Watch (sleep while waiting for orders)

- Desktop shortcuts: `Night Watch.lnk` (Ctrl+Alt+W) and `Fireplace.lnk` (Ctrl+Alt+F). Night Watch is the shop on the main monitor. The fireplace is its own window on the second monitor (`night-watch-fireplace.bat`). Press **W** in Night Watch to place the fire on the other screen. A new order rings; visitors do not.
- Windows cannot run a live app on the lock screen. Night Watch covers the monitors and keeps the PC awake instead. Esc / Alt+F4 leaves. `--windowed` skips the dual-monitor cover.
- It logs into live `https://vndviti.com` with the VND admin phone. Do not commit credentials. `NIGHT_WATCH_SHOP` can point at a local server.
