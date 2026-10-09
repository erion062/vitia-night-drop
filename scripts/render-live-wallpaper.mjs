import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'wallpapers');
const WIDTH = 2560;
const HEIGHT = 1440;
const FPS = 30;
const PHRASES = [
  ['keep_going();', 'you did not come this far to stop.'],
  ['trust_the_process();', 'small steps. every single day.'],
  ['focus_on_you();', 'less noise. more purpose.'],
  ['build_your_future();', 'one day, or day one.'],
  ['stay_consistent();', 'discipline outlasts motivation.'],
  ['make_it_happen();', 'let your work speak.'],
];
const DURATION = PHRASES.length * 8;

async function connect(port) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find(item => item.type === 'page');
      if (target) {
        const socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
        let id = 0;
        const pending = new Map();
        socket.onmessage = ({ data }) => {
          const message = JSON.parse(data);
          const waiter = pending.get(message.id);
          if (!waiter) return;
          pending.delete(message.id);
          clearTimeout(waiter.timer);
          if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
          else waiter.resolve(message.result);
        };
        return {
          close: () => socket.close(),
          call: (method, params = {}) => new Promise((resolve, reject) => {
            const key = ++id;
            const timer = setTimeout(() => { pending.delete(key); reject(new Error(`Timeout: ${method}`)); }, 180000);
            pending.set(key, { resolve, reject, timer });
            socket.send(JSON.stringify({ id: key, method, params }));
          }),
        };
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Could not connect to the browser renderer.');
}

function setup(width, height, fps, phrases) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  document.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
  canvas.style.cssText = 'width:100vw;height:100vh;object-fit:contain';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  const duration = phrases.length * 8;
  const font = 'Consolas, "Courier New", monospace';

  function draw(time) {
    const index = Math.min(phrases.length - 1, Math.floor(time / 8));
    const local = time - index * 8;
    const [code, caption] = phrases[index];
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    if (local < 0.4 || local >= 7.65) return;
    const start = 0.85;
    const typeSpeed = 0.078;
    const eraseAt = 6.5;
    const count = local < eraseAt
      ? Math.min(code.length, Math.max(0, Math.floor((local - start) / typeSpeed)))
      : Math.max(0, code.length - Math.floor((local - eraseAt) / 0.035));
    const opacity = Math.min(1, (local - 0.4) / 0.25, (7.65 - local) / 0.25);
    ctx.globalAlpha = opacity;
    ctx.font = `48px ${font}`;
    ctx.textBaseline = 'middle';
    const cell = ctx.measureText('M').width;
    const left = (width - (code.length + 3) * cell) / 2;
    const y = height / 2 - 14;
    ctx.fillStyle = '#78dba9';
    ctx.fillText('>', left, y);
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = /[();]/.test(code[i]) ? '#737a80' : '#e3e6e8';
      ctx.fillText(code[i], left + (i + 2) * cell, y);
    }
    const typing = (local >= start && count < code.length && local < eraseAt) || local >= eraseAt;
    if (typing || Math.floor((local - 0.4) / 0.55) % 2 === 0) {
      ctx.fillStyle = '#78dba9';
      ctx.fillRect(left + (count + 2) * cell + 2, y - 23, 3, 46);
    }
    const captionIn = start + code.length * typeSpeed + 0.3;
    ctx.globalAlpha = opacity * Math.max(0, Math.min(1, (local - captionIn) / 0.7, (eraseAt - local) / 0.4));
    ctx.font = `23px ${font}`;
    ctx.fillStyle = '#747a80';
    ctx.textAlign = 'center';
    ctx.fillText(`// ${caption}`, width / 2, y + 73);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  async function record() {
    const mimeType = ['video/mp4;codecs=avc1.420033', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('No supported built-in video encoder.');
    draw(0);
    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
    const chunks = [];
    const stopped = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = resolve;
      recorder.onerror = event => reject(new Error(event.error?.message || 'Video encoding failed.'));
    });
    let timer;
    try {
      recorder.start(1000);
      const started = performance.now();
      await new Promise(resolve => {
        timer = setInterval(() => {
          const time = (performance.now() - started) / 1000;
          draw(Math.min(time, duration - 0.001));
          if (time >= duration) { clearInterval(timer); resolve(); }
        }, 1000 / fps);
      });
      recorder.stop();
      await stopped;
      const blob = new Blob(chunks, { type: mimeType });
      window.wallpaperBlob = blob;
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return { base64, mimeType, bytes: blob.size };
    } finally {
      clearInterval(timer);
      stream.getTracks().forEach(track => track.stop());
    }
  }

  async function verify() {
    const video = document.createElement('video');
    video.muted = true;
    video.playbackRate = 16;
    video.src = URL.createObjectURL(window.wallpaperBlob);
    document.body.append(video);
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('Exported video metadata could not be decoded.'));
    });
    if (video.videoWidth !== width || video.videoHeight !== height) throw new Error('Incorrect video dimensions.');
    const decoded = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Video playback verification timed out.')), 90000);
      video.onended = () => { clearTimeout(timeout); resolve(); };
      video.onerror = () => { clearTimeout(timeout); reject(new Error('Video playback failed.')); };
    });
    await video.play();
    await decoded;
    const result = { width: video.videoWidth, height: video.videoHeight, duration: video.duration, frames: video.getVideoPlaybackQuality().totalVideoFrames };
    URL.revokeObjectURL(video.src);
    video.remove();
    return result;
  }

  window.wallpaper = { draw, record, verify, canvas };
  draw(3.8);
  return { mediaRecorder: typeof MediaRecorder, preview: canvas.toDataURL('image/png').split(',')[1] };
}

fs.mkdirSync(OUT, { recursive: true });
const chrome = process.env.CHROME_PATH || [
  path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
].find(file => fs.existsSync(file));
assert.ok(chrome, 'Chrome or Edge is required. Set CHROME_PATH if necessary.');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'minimal-wallpaper-'));
const port = 9400 + Math.floor(Math.random() * 500);
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', windowsHide: true });
let browserError;
browser.on('error', error => { browserError = error; });
let cdp;
try {
  cdp = await connect(port);
  if (browserError) throw browserError;
  const evaluate = async expression => {
    const data = await cdp.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (data.exceptionDetails) throw new Error(JSON.stringify(data.exceptionDetails));
    return data.result.value;
  };
  const ready = await evaluate(`(${setup.toString()})(${WIDTH}, ${HEIGHT}, ${FPS}, ${JSON.stringify(PHRASES)})`);
  assert.equal(ready.mediaRecorder, 'function');
  fs.writeFileSync(path.join(OUT, 'mindset-preview.png'), Buffer.from(ready.preview, 'base64'));
  console.log(`Recording ${DURATION}s minimalist wallpaper at ${WIDTH}x${HEIGHT}, ${FPS} fps using the browser encoder.`);
  const video = await evaluate('wallpaper.record()');
  const extension = video.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  const filename = path.join(OUT, `mindset-live-wallpaper.${extension}`);
  fs.writeFileSync(filename, Buffer.from(video.base64, 'base64'));
  console.log(`Exported ${filename} (${(video.bytes / 1048576).toFixed(2)} MB). Checking playback...`);
  const result = await evaluate('wallpaper.verify()');
  assert.ok(Math.abs(result.duration - DURATION) < 1, `Unexpected duration: ${result.duration}`);
  assert.ok(result.frames > FPS * DURATION * 0.8, `Too few decoded frames: ${result.frames}`);
  const loop = await evaluate(`(() => { wallpaper.draw(0); const first = wallpaper.canvas.toDataURL(); wallpaper.draw(${DURATION - 0.001}); return first === wallpaper.canvas.toDataURL(); })()`);
  assert.ok(loop, 'The loop boundary must match.');
  console.log(`Verified: ${result.width}x${result.height}, ${result.duration.toFixed(2)}s, ${result.frames} frames, playback to completion, matching black loop boundary, no audio.`);
} finally {
  cdp?.close();
  const exited = browser.exitCode !== null || browserError ? Promise.resolve() : new Promise(resolve => browser.once('exit', resolve));
  browser.kill();
  await exited;
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  catch (error) { console.warn(`Temporary browser profile could not be removed: ${error.message}`); }
}
