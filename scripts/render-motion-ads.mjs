import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'marketing', 'video-ads');
const HTML = path.join(ROOT, 'marketing', 'motion-ads.html');
const NAMES = ['01-mos-dil-sonte', '02-pije-snacks', '03-te-dera', '04-porosit-ndiq-live', '05-partneret', '06-pizza-la-casa', '07-amici', '08-andi-market', '09-tre-hapa', '10-zona-orari'];
const DURATIONS = [15, 15, 15, 30, 36, 15, 15, 10, 20, 10];
const SCENE_LENGTHS = [3.75, 3.75, 3.75, 3.75, 6, 3.75, 3.75, 5, 5, 5];
const NEEDS_CAMPAIGN = new Set([4, 5, 6, 7]);
const FPS = 30;
const RATE = 48000;
const previewOnly = process.argv.includes('--preview-only');
const verifyOnly = process.argv.includes('--verify');
const choice = process.argv.find(arg => arg.startsWith('--ad='));
const AD_IDS = choice ? choice.split('=')[1].split(',').map(n => Number(n) - 1) : NAMES.map((_, i) => i);
assert.ok(AD_IDS.every(id => Number.isInteger(id) && id >= 0 && id < NAMES.length), `Use --ad=1 through --ad=${NAMES.length} (comma-separated allowed).`);
const audioName = duration => `vnd-beat-${duration}s.wav`;
const campaignPath = path.join(OUT, 'partner-campaign.json');
const campaign = fs.existsSync(campaignPath) ? JSON.parse(fs.readFileSync(campaignPath, 'utf8')) : null;
fs.mkdirSync(OUT, { recursive: true });

function command(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program}: ${result.stderr}`);
  return result.stdout;
}

function soundtrack(duration) {
  const total = RATE * duration;
  const left = new Float64Array(total), right = new Float64Array(total);
  const beat = 60 / 128;
  let seed = 1847;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  function sound(at, length, sample, gain = 1, pan = 0) {
    const start = Math.round(at * RATE);
    const count = Math.min(Math.round(length * RATE), total - start);
    for (let i = 0; i < count; i++) {
      const t = i / RATE;
      const value = sample(t, i) * gain;
      left[start + i] += value * Math.sqrt((1 - pan) / 2);
      right[start + i] += value * Math.sqrt((1 + pan) / 2);
    }
  }
  const roots = [55, 43.6535, 65.4064, 48.9994];
  for (let b = 0; b < Math.round(duration / beat); b++) {
    const at = b * beat;
    sound(at, .4, t => Math.sin(2 * Math.PI * (47 * t + 7.8 * (1 - Math.exp(-t * 35)))) * Math.exp(-t * 13) * Math.min(1, t * 600), .85);
    if (b % 2 === 1) {
      sound(at, .17, t => (noise() * .7 + Math.sin(2 * Math.PI * 180 * t) * .18) * Math.exp(-t * 27) * Math.min(1, t * 900), .33, .05);
      sound(at + .014, .09, t => noise() * Math.exp(-t * 47), .1, -.12);
    }
    for (let h = 0; h < 2; h++) {
      let previous = 0;
      sound(at + h * beat / 2, h ? .11 : .045, t => {
        const n = noise(), high = n - previous;
        previous = n;
        return high * Math.exp(-t * (h ? 39 : 85)) * Math.min(1, t * 1800);
      }, h ? .064 : .048, h ? .4 : -.35);
    }
    const root = roots[Math.floor(b / 8) % roots.length];
    for (const [offset, multiplier, gain] of [[0, 1, .33], [.75, b % 4 === 3 ? 2 : 1, .2]]) {
      sound(at + offset * beat, .31, t => {
        const freq = root * multiplier;
        const wave = Math.sin(2 * Math.PI * freq * t) + .22 * Math.sin(2 * Math.PI * freq * 2 * t);
        return wave * (1 - Math.exp(-t * 110)) * Math.exp(-t * 11);
      }, gain);
    }
    const melody = [12, 19, 15, 22, 19, 15, 10, 19][b % 8];
    const f = root * 2 ** (melody / 12) * 2;
    const pluck = t => (Math.sin(2 * Math.PI * f * t + 1.5 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 18)) + .15 * Math.sin(2 * Math.PI * f * 3 * t)) * Math.exp(-t * 7) * Math.min(1, t * 160);
    sound(at + beat / 2, .75, pluck, .105, b % 2 ? .28 : -.28);
    sound(at + beat / 2 + beat * .75, .65, pluck, .026, b % 2 ? -.6 : .6);
    if (b % 8 === 0) {
      for (const semitone of [0, 3, 7, 10]) {
        const chord = root * 4 * 2 ** (semitone / 12);
        sound(at, 3.4, t => (Math.sin(2 * Math.PI * chord * t) + .15 * Math.sin(2 * Math.PI * chord * 1.003 * t)) * (1 - Math.exp(-t * 3)) * Math.exp(-t * 1.1), .045, semitone / 10 - .5);
      }
      sound(at, .65, t => noise() * Math.exp(-t * 9) * (1 - Math.exp(-t * 150)), .1, .3);
    }
  }
  if (duration === 30) {
    for (const at of [.85, 1.65, 4.6, 5.4, 6.6, 8.7, 10.35, 11.85, 15.9, 17.95]) {
      sound(at, .065, t => Math.sin(2 * Math.PI * 1450 * t) * Math.exp(-t * 90) * Math.min(1, t * 1500), .12);
    }
    for (const at of [16.45, 26.25]) {
      [659.255, 830.609, 987.767].forEach((frequency, i) => {
        sound(at + i * .11, .65, t => Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 8) * Math.min(1, t * 180), .12, (i - 1) * .2);
      });
    }
  }
  let peak = 0;
  for (let i = 0; i < total; i++) {
    const fade = Math.min(1, i / (RATE * .007), (total - i - 1) / (RATE * .25));
    left[i] = Math.tanh(left[i] * 1.3) * fade;
    right[i] = Math.tanh(right[i] * 1.3) * fade;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const wav = Buffer.alloc(44 + total * 4);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 4, 28);
  wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(total * 4, 40);
  for (let i = 0; i < total; i++) {
    wav.writeInt16LE(Math.round(left[i] / peak * 26000), 44 + i * 4);
    wav.writeInt16LE(Math.round(right[i] / peak * 26000), 46 + i * 4);
  }
  fs.writeFileSync(path.join(OUT, audioName(duration)), wav);
  console.log(`Original ${duration}s, 128 BPM instrumental synthesized.`);
}

async function connect(port) {
  let last;
  for (let i = 0; i < 80; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find(t => t.type === 'page');
      if (target) {
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
        let id = 0;
        const pending = new Map();
        ws.onmessage = ({ data }) => {
          const msg = JSON.parse(data);
          const waiter = pending.get(msg.id);
          if (!waiter) return;
          pending.delete(msg.id);
          clearTimeout(waiter.timer);
          if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
          else waiter.resolve(msg.result);
        };
        return {
          close: () => ws.close(),
          call: (method, params = {}) => new Promise((resolve, reject) => {
            const key = ++id;
            const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 60000);
            pending.set(key, { resolve, reject, timer });
            ws.send(JSON.stringify({ id: key, method, params }));
          }),
        };
      }
    } catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Chrome not reachable: ${last?.message}`);
}

function verify() {
  for (const ad of AD_IDS) {
    const name = NAMES[ad], duration = DURATIONS[ad];
    const file = path.join(OUT, `${name}.mp4`);
    const data = JSON.parse(command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
    const video = data.streams.find(s => s.codec_type === 'video');
    const audio = data.streams.find(s => s.codec_type === 'audio');
    assert.equal(video.codec_name, 'h264');
    assert.equal(video.width, 1080); assert.equal(video.height, 1920);
    assert.equal(video.pix_fmt, 'yuv420p'); assert.equal(video.r_frame_rate, '30/1');
    assert.equal(Number(video.nb_frames), FPS * duration);
    assert.equal(video.color_range, 'tv'); assert.equal(video.color_space, 'bt709');
    assert.equal(audio.codec_name, 'aac'); assert.equal(audio.channels, 2);
    assert.ok(Math.abs(Number(data.format.duration) - duration) < .1);
    command('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-']);
    console.log(`Verified ${name}: 1080x1920, ${FPS} fps, ${FPS * duration} frames, ${duration}s, H.264 + stereo AAC, full decode OK.`);
  }
}

async function render() {
  command('ffmpeg', ['-version']);
  if (AD_IDS.some(ad => NEEDS_CAMPAIGN.has(ad))) assert.ok(campaign, 'Run node scripts/prepare-partner-ad.mjs first (partner logos and menu photos).');
  for (const duration of new Set(AD_IDS.map(ad => DURATIONS[ad]))) soundtrack(duration);
  const chrome = process.env.CHROME_PATH || [
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
  ].find(p => fs.existsSync(p));
  if (!chrome) throw new Error('Set CHROME_PATH to your Chrome or Edge executable.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vnd-ad-render-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let cdp;
  try {
    cdp = await connect(port);
    await cdp.call('Page.enable');
    await cdp.call('Page.navigate', { url: pathToFileURL(HTML).href });
    async function evaluate(expression) {
      const data = await cdp.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (data.exceptionDetails) throw new Error(JSON.stringify(data.exceptionDetails));
      return data.result.value;
    }
    for (let i = 0; i < 80; i++) {
      if (await evaluate('typeof window.renderFrame === "function"')) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(await evaluate('typeof window.renderFrame'), 'function');
    await evaluate('document.fonts.ready.then(() => true)');
    await evaluate('window.assetsReady.then(() => true)');
    for (const ad of AD_IDS) {
      const duration = DURATIONS[ad], scenes = Math.round(duration / SCENE_LENGTHS[ad]);
      const board = await evaluate(`(() => {
        const n = ${scenes}, cols = Math.min(n, 4), rows = Math.ceil(n / cols);
        const sheet = document.createElement('canvas'); sheet.width = cols * 270; sheet.height = rows * 518;
        const c = sheet.getContext('2d'); c.fillStyle = '#0a100d'; c.fillRect(0, 0, sheet.width, sheet.height);
        for (let shot = 0; shot < n; shot++) {
          const x = (shot % cols) * 270, y = Math.floor(shot / cols) * 518;
          c.fillStyle = '#00ff66'; c.font = 'bold 18px Arial';
          c.fillText('${NAMES[ad].toUpperCase()} · ' + (shot + 1), x + 12, y + 27);
          window.renderFrame(shot * ${SCENE_LENGTHS[ad]} + ${SCENE_LENGTHS[ad]} * .45, ${ad});
          c.drawImage(document.getElementById('art'), x, y + 38, 270, 480);
        }
        return sheet.toDataURL('image/png').split(',')[1];
      })()`);
      fs.writeFileSync(path.join(OUT, `${NAMES[ad]}-storyboard.png`), Buffer.from(board, 'base64'));
      const image = await evaluate(`window.renderFrame(1.6, ${ad}); document.getElementById('art').toDataURL('image/png').split(',')[1]`);
      fs.writeFileSync(path.join(OUT, `${NAMES[ad]}-cover.png`), Buffer.from(image, 'base64'));
      if (previewOnly) continue;
      const encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-vcodec', 'mjpeg', '-i', 'pipe:0', '-i', path.join(OUT, audioName(duration)), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', String(RATE), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7', '-t', String(duration), '-movflags', '+faststart', '-metadata', 'title=VND - ' + NAMES[ad], '-metadata', NEEDS_CAMPAIGN.has(ad) ? `comment=Original VND motion graphics and synthesized instrumental. Partner listings checked ${campaign.checkedAt}.` : 'comment=Original VND motion graphics and synthesized instrumental. No third-party music samples.', path.join(OUT, `${NAMES[ad]}.mp4`)], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
      let encoderError = '', inputError;
      encoder.stderr.on('data', d => { encoderError += d.toString(); });
      encoder.stdin.on('error', error => { inputError = error; });
      const done = new Promise((resolve, reject) => {
        encoder.on('error', reject);
        encoder.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}: ${encoderError}`)));
      });
      done.catch(() => {});
      try {
        for (let frame = 0; frame < FPS * duration; frame++) {
          if (inputError) throw inputError;
          const data = await evaluate(`window.renderFrame(${frame / FPS}, ${ad}); document.getElementById('art').toDataURL('image/jpeg', .97).split(',')[1]`);
          if (!encoder.stdin.write(Buffer.from(data, 'base64'))) await once(encoder.stdin, 'drain');
          if (frame % 90 === 0) console.log(`${NAMES[ad]}: ${frame}/${FPS * duration} frames`);
        }
        encoder.stdin.end();
        await done;
      } catch (error) {
        encoder.kill();
        throw error;
      }
      console.log(`Rendered ${NAMES[ad]}.mp4`);
    }
    console.log('Covers and storyboard exported.');
  } finally {
    if (cdp) { await cdp.call('Browser.close').catch(() => {}); cdp.close(); }
    browser.kill();
    await new Promise(resolve => setTimeout(resolve, 750));
    try { fs.rmSync(profile, { recursive: true, force: true }); }
    catch { console.log(`Temporary Chrome profile retained: ${profile}`); }
  }
  if (!previewOnly) verify();
}

if (process.argv.includes('--serve')) {
  const allowed = new Set(['motion-ads.html', 'partner-campaign.js', 'video-ads/tiktok-captions.md', ...new Set(DURATIONS.map(d => `video-ads/${audioName(d)}`)), ...(campaign?.partners || []).flatMap(partner => [partner.logo, partner.photo]).filter(Boolean), ...NAMES.flatMap(name => [`video-ads/${name}.mp4`, `video-ads/${name}-cover.png`, `video-ads/${name}-storyboard.png`])]);
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.md': 'text/plain; charset=utf-8' };
  createServer((req, res) => {
    const name = req.url.split('?')[0].replace(/^\//, '') || 'motion-ads.html';
    if (!allowed.has(name)) { res.writeHead(404); res.end(); return; }
    const file = path.join(ROOT, 'marketing', name);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('Not rendered yet.'); return; }
    const size = fs.statSync(file).size;
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = match ? Number(match[1]) : 0;
    const end = match && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    const headers = { 'Content-Type': mime[path.extname(file)], 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' };
    if (match) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(match ? 206 : 200, headers);
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file, { start, end }).pipe(res);
  }).listen(8790, '127.0.0.1', () => console.log('VND video preview: http://127.0.0.1:8790'));
} else if (verifyOnly) verify();
else await render();
