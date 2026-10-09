import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'marketing', 'video-ads');
const ASSETS = path.join(OUT, 'partner-assets');
const BASE = 'https://vndviti.com';
const VOICE = 'sq-AL-AnilaNeural';
const SCENES = [
  { speech: 'Partnerët e tu në Viti. Tani në Vitia Najt Drop.', captions: ['Partnerët e tu në Viti.', 'Tani në Vitia Night Drop.'] },
  { speech: 'Pica La Kasa. Pica, sanduiçe dhe hamburgerë. Zgjidh shijen tënde.', captions: ['Pizza La Casa. Pica, sanduiçe dhe', 'hamburgerë. Zgjidh shijen tënde.'] },
  { speech: 'Amiçi Launxh end Bar. Pica, pasta dhe krepa. Ti zgjedh.', captions: ['Amici Lounge & Bar. Pica, pasta', 'dhe krepa. Ti zgjedh.'] },
  { speech: 'Andi Market. Një tjetër partner në platformën Vitia Najt Drop.', captions: ['Andi Market. Një tjetër partner', 'në platformën Vitia Night Drop.'] },
  { speech: 'Hap faqen, zgjidh partnerin dhe porosit. Ndiqe porosinë nga telefoni.', captions: ['Hap faqen, zgjidh partnerin dhe porosit.', 'Ndiqe porosinë nga telefoni.'] },
  { speech: 'Ne dalim për ty. Porosit në vi en di viti, pikë kom.', captions: ['Ne dalim për ty.', 'Porosit në vndviti.com.'] },
];

function run(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8', windowsHide: true, timeout: 180000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} failed: ${result.stderr}`);
  return result.stdout;
}

async function download(source, stem) {
  const url = new URL(source, BASE);
  assert.equal(url.origin, BASE);
  assert.ok(url.pathname.startsWith('/uploads/'));
  const ext = path.extname(url.pathname).toLowerCase();
  assert.ok(['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(ext));
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Asset HTTP ${response.status}: ${url.pathname}`);
  const name = `${stem}${ext}`;
  fs.writeFileSync(path.join(ASSETS, name), Buffer.from(await response.arrayBuffer()));
  return `video-ads/partner-assets/${name}`;
}

fs.mkdirSync(ASSETS, { recursive: true });
const response = await fetch(`${BASE}/api/products`, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Live catalog HTTP ${response.status}`);
const catalog = await response.json();
const expected = ['lacasa', 'amici', 'andi'];
assert.deepEqual(catalog.partners.map(p => p.slug).sort(), [...expected].sort(), 'The current partner list changed. Review the campaign copy before rendering.');
const partners = [];
for (const slug of expected) {
  const partner = catalog.partners.find(p => p.slug === slug);
  const products = catalog.products.filter(p => p.partner === slug && p.available && p.name.toLowerCase() !== 'test');
  const logo = await download(partner.logo_url, `${slug}-logo`);
  const product = products.find(p => p.name === (slug === 'lacasa' ? 'Pizza Margarita (30cm)' : 'Pasta Carbonara'));
  if (slug !== 'andi') assert.ok(product?.image_url, `Missing selected menu image for ${slug}`);
  const photo = product ? await download(product.image_url, `${slug}-food`) : null;
  partners.push({ slug, name: partner.name, tagline: partner.tagline, kind: partner.kind, logo, photo, productName: product?.name || null, publicProductCount: products.length });
}
console.log('Verified current live partners:', partners.map(p => p.name).join(', '));

for (let i = 0; i < SCENES.length; i++) {
  const scene = SCENES[i];
  const raw = path.join(OUT, `05-voice-${i + 1}-raw.mp3`);
  run('uvx', ['--python', '3.11', '--from', 'edge-tts==7.2.8', 'edge-tts', '--voice', VOICE, '--rate=+5%', '--text', scene.speech, '--write-media', raw]);
  const duration = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', raw]).trim());
  assert.ok(duration > 1 && duration < 8, `Unexpected narration duration ${duration}s for scene ${i + 1}`);
  const speed = Math.max(1, duration / 5.45);
  assert.ok(speed <= 1.3, `Narration scene ${i + 1} needs shorter copy, not excessive acceleration`);
  const file = `05-voice-${i + 1}.wav`;
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', `atempo=${speed.toFixed(6)},highpass=f=85,loudnorm=I=-17:TP=-2:LRA=7,afade=t=out:st=5.4:d=0.08`, '-ar', '48000', '-ac', '2', path.join(OUT, file)]);
  scene.start = i * 6 + .3;
  scene.file = `video-ads/${file}`;
  scene.duration = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path.join(OUT, file)]).trim());
  console.log(`Albanian voice scene ${i + 1}: ${scene.duration.toFixed(2)}s`);
}

const inputs = SCENES.flatMap(scene => ['-i', path.join(ROOT, 'marketing', scene.file)]);
const filters = SCENES.map((scene, i) => `[${i}:a]adelay=${Math.round(scene.start * 1000)}:all=1[a${i}]`).join(';');
const mix = SCENES.map((_, i) => `[a${i}]`).join('');
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', `${filters};${mix}amix=inputs=${SCENES.length}:normalize=0,apad,atrim=duration=36[out]`, '-map', '[out]', '-ar', '48000', '-ac', '2', path.join(OUT, '05-albanian-voiceover.wav')]);

function stamp(seconds) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
fs.writeFileSync(path.join(OUT, '05-partneret-shqip.srt'), SCENES.map((scene, i) => `${i + 1}\n${stamp(scene.start)} --> ${stamp(scene.start + scene.duration)}\n${scene.captions.join('\n')}\n`).join('\n'));
const campaign = { checkedAt: new Date().toISOString(), source: `${BASE}/api/products`, duration: 36, voice: VOICE, syntheticVoice: true, partners, scenes: SCENES };
fs.writeFileSync(path.join(OUT, 'partner-campaign.json'), JSON.stringify(campaign, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'marketing', 'partner-campaign.js'), `window.partnerCampaign = ${JSON.stringify(campaign, null, 2)};\n`);
console.log('Partner assets, Albanian narration, subtitles, and campaign snapshot prepared.');
