// Builds marketing/partners-data.js: every active food place and grocery market
// registered in Viti municipality (public ARBK register via arbk.org), with the
// business contact channels they published there.
//   node scripts/find-partners.mjs          (uses cache in data/partners-arbk.json)
//   node scripts/find-partners.mjs --fresh  (re-crawls)
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'data', 'partners-arbk.json');
const OUT = join(ROOT, 'marketing', 'partners-data.js');
const BASE = 'https://arbk.org/komuna/viti/';
const SECTORS = ['restorante-kafe', 'tregti-me-pakice'];
const FRESH = process.argv.includes('--fresh');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// arbk.org answers 429 quickly, so stay sequential and back off hard.
let gap = 1500;
async function get(url) {
  for (let i = 0; i < 8; i++) {
    await sleep(gap);
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'VND partner research (vndviti.com)' } });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
      if (res.status === 429) {
        gap = Math.min(gap + 500, 6000);
        const wait = (+res.headers.get('retry-after') || 45) * 1000;
        process.stdout.write(` [429, waiting ${wait / 1000}s, gap ${gap}ms]`);
        await sleep(wait);
        continue;
      }
    } catch {}
    await sleep(3000 * (i + 1));
  }
  return null;
}

async function listSector(sector, cache) {
  cache.lists ||= {};
  const list = (cache.lists[sector] ||= { pages: 0, done: [], slugs: [] });
  const slugs = new Set(list.slugs);
  const take = (html) => {
    for (const m of html.matchAll(/href="https:\/\/arbk\.org\/biz\/([^"/]+)\/"/g)) slugs.add(m[1]);
  };
  if (!list.pages) {
    const first = await get(`${BASE}?sector=${sector}&status=aktiv`);
    list.pages = Math.max(1, ...[...first.matchAll(/page\/(\d+)\//g)].map((m) => +m[1]));
    take(first);
    list.done.push(1);
  }
  for (let p = 2; p <= list.pages; p++) {
    if (list.done.includes(p)) continue;
    const html = await get(`${BASE}page/${p}/?sector=${sector}&status=aktiv`);
    if (html) { take(html); list.done.push(p); }
    list.slugs = [...slugs];
    writeFileSync(CACHE, JSON.stringify(cache));
    process.stdout.write(`\r${sector}: page ${p}/${list.pages}, ${slugs.size} businesses`);
  }
  console.log();
  list.slugs = [...slugs];
  return list.slugs;
}

function parseBiz(slug, html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter(Boolean);
  const org = blocks.find((b) => b['@type'] === 'Organization' && Array.isArray(b.naics)) ||
    blocks.find((b) => b['@type'] === 'Organization' && b.url?.includes('/biz/'));
  if (!org) return null;
  const h1 = html.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/)?.[1];
  const status = /badge-pos">[^<]*Regjistruar/.test(html) ? 'aktiv' : 'pasiv';
  return {
    slug,
    name: decode(h1 || org.legalName || org.name),
    legal: decode(org.name),
    nui: org.identifier?.value || '',
    founded: org.foundingDate || '',
    employees: org.numberOfEmployees?.value ?? null,
    address: decode(org.address?.streetAddress || ''),
    phone: org.telephone || '',
    email: org.email || '',
    naics: org.naics || [],
    status,
  };
}

function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&#8211;/g, '–').replace(/&#8220;|&#8221;/g, '"').replace(/\s+/g, ' ').trim();
}

const FOOD = ['5610', '5621', '5629'];
const MARKET = ['4711', '4721', '4722', '4723', '4724', '4725', '4729', '4781'];

function classify(b) {
  const [primary] = b.naics;
  const has = (codes) => b.naics.some((c) => codes.includes(c));
  if (FOOD.includes(primary)) return 'food';
  if (MARKET.includes(primary)) return primary === '4724' ? 'bakery' : 'market';
  if (primary === '5630') return has(['5610']) ? 'food' : 'cafe';
  if (primary?.startsWith('47') && has(['4711'])) return 'market';
  return null;
}

function normPhone(p) {
  const d = String(p).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('383')) return '+' + d;
  if (d.startsWith('0')) return '+383' + d.slice(1);
  return '+' + d;
}

async function crawl() {
  mkdirSync(dirname(CACHE), { recursive: true });
  const cache = !FRESH && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : { businesses: {}, missing: [] };
  cache.missing ||= [];
  // Restaurants first so the tracker is useful before the long retail crawl ends.
  for (const sector of SECTORS) {
    const todo = (await listSector(sector, cache)).filter((s) => !cache.businesses[s] && !cache.missing.includes(s));
    console.log(`${sector}: ${todo.length} detail pages to fetch`);
    let done = 0;
    for (const slug of todo) {
      const html = await get(`https://arbk.org/biz/${slug}/`);
      const b = html && parseBiz(slug, html);
      if (b) cache.businesses[slug] = b;
      else cache.missing.push(slug);
      done++;
      process.stdout.write(`\r${sector}: details ${done}/${todo.length}`);
      if (done % 20 === 0) {
        writeFileSync(CACHE, JSON.stringify(cache));
        writeOutput(cache, true);
      }
    }
    writeFileSync(CACHE, JSON.stringify(cache));
    writeOutput(cache, true);
    console.log();
  }
  cache.crawledAt = new Date().toISOString();
  writeFileSync(CACHE, JSON.stringify(cache));
  return cache;
}

writeOutput(await crawl(), false);

function writeOutput(cache, quiet) {
const seenPhones = new Set();
const partners = Object.values(cache.businesses)
  .filter((b) => b.status === 'aktiv')
  .map((b) => ({ ...b, type: classify(b), phone: normPhone(b.phone) }))
  .filter((b) => b.type && (b.phone || b.email))
  .sort((a, b) => ({ food: 0, market: 1, bakery: 2, cafe: 3 }[a.type] - { food: 0, market: 1, bakery: 2, cafe: 3 }[b.type]) ||
    (b.employees ?? 0) - (a.employees ?? 0) || a.name.localeCompare(b.name))
  .map((b) => {
    const dup = b.phone && seenPhones.has(b.phone);
    if (b.phone) seenPhones.add(b.phone);
    return {
      id: b.nui || b.slug,
      name: b.name,
      legal: b.legal !== b.name ? b.legal : '',
      type: b.type,
      address: b.address,
      phone: b.phone,
      email: b.email,
      employees: b.employees,
      founded: b.founded,
      naics: b.naics.slice(0, 4),
      source: `https://arbk.org/biz/${b.slug}/`,
      dupPhone: dup || undefined,
    };
  });

const counts = partners.reduce((m, p) => ((m[p.type] = (m[p.type] || 0) + 1), m), {});
writeFileSync(OUT, `// Generated by scripts/find-partners.mjs on ${new Date().toISOString().slice(0, 10)} from the public ARBK register (arbk.org).\nwindow.VND_PARTNERS = ${JSON.stringify(partners, null, 1)};\n`);
if (!quiet) console.log(`wrote ${partners.length} partners to ${OUT}`, counts);
}
