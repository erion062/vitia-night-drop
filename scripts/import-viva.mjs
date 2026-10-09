#!/usr/bin/env node
/**
 * One-shot importer: scrape Viva Fresh listings on zbritje.de, pick a late-night
 * catalog, download images into data/uploads, upsert products in data/vnd.db,
 * and regenerate server/seed.js (image_url empty in seed).
 *
 * Listing price = shop cost (what Whitey pays). Customer price is a late-night markup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LISTING_URL = 'https://zbritje.de/websites/viva-fresh-store/?products-page=';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CACHE = path.join(ROOT, 'data', 'viva-listing.json');
const UPLOADS = path.join(ROOT, 'data', 'uploads');
const DB_PATH = path.join(ROOT, 'data', 'vnd.db');
const SEED_PATH = path.join(ROOT, 'server', 'seed.js');
const REPORT = path.join(ROOT, 'data', 'viva-import-report.json');

const CONCURRENCY = 8;
const PAGE_RETRIES = 3;
const IMG_RETRIES = 2;
const TARGET_MIN = 150;
const TARGET_MAX = 300;
const QUOTAS = { drinks: 58, food: 95, cigarettes: 28, snacks: 40, other: 62 };

const args = new Set(process.argv.slice(2));
const forceRescrape = args.has('--rescrape');

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&#8211;/g, '-')
    .replace(/&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/ç/g, 'c')
    .replace(/ë/g, 'e')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#215;/g, '×')
    .replace(/&times;/g, '×')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function withRetry(fn, tries, label) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await sleep(400 * (i + 1));
    }
  }
  throw new Error(`${label}: ${last?.message || last}`);
}

function attr(chunk, name) {
  const m = chunk.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : '';
}

function pickImage(chunk) {
  const srcset = attr(chunk, 'srcset') || '';
  const src = attr(chunk, 'src') || '';
  const entries = [];
  for (const part of srcset.split(',')) {
    const m = part.trim().match(/^(https?:\/\/\S+)\s+(\d+)w$/);
    if (m) entries.push({ url: m[1], w: Number(m[2]) });
  }
  if (src && !entries.some((e) => e.url === src)) entries.push({ url: src, w: 300 });
  const usable = entries.filter((e) => e.url && !/placeholder/i.test(e.url) && !/zbritje\.de\/wp-content\/plugins/i.test(e.url));
  if (!usable.length) return '';
  usable.sort((a, b) => Math.abs(a.w - 700) - Math.abs(b.w - 700));
  const best = usable.find((e) => e.w >= 300 && e.w <= 900) || usable[0];
  return best.url;
}

function parsePage(html) {
  const start = html.indexOf('class="website-products-grid"');
  if (start < 0) return { products: [], maxPage: 0 };
  const from = html.slice(start);
  const end = from.search(/class="navigation pagination|website-products-pagination/);
  const grid = end > 0 ? from.slice(0, end) : from.slice(0, 250000);
  const products = [];
  for (const part of grid.split(/<article\b/i).slice(1)) {
    const chunk = part.split('</article>')[0];
    if (!/medium-rectangle-card/.test(chunk)) continue;
    const id = Number(attr(chunk, 'data-product-id') || (chunk.match(/id="product-(\d+)/) || [])[1]);
    const price = Number.parseFloat(attr(chunk, 'data-product-price'));
    const nameHtml = (chunk.match(/class="mr-product-name"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || '';
    const name = decodeEntities(nameHtml.replace(/<[^>]+>/g, ''));
    const href = (chunk.match(/href="(https:\/\/zbritje\.de\/products\/[^"]+)"/) || [])[1] || '';
    const image = pickImage(chunk);
    if (!id || !name || !Number.isFinite(price) || price <= 0) continue;
    products.push({ id, name, price, href, image });
  }
  let maxPage = 0;
  for (const m of html.matchAll(/products-page=(\d+)/g)) maxPage = Math.max(maxPage, Number(m[1]));
  return { products, maxPage };
}

async function scrapeAll() {
  if (!forceRescrape && fs.existsSync(CACHE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (Array.isArray(cached.products) && cached.products.length > 200) {
      console.log(`[viva] Using cached listing (${cached.products.length} SKUs from ${cached.pages} pages). Pass --rescrape to refresh.`);
      return cached;
    }
  }

  console.log('[viva] Fetching page 1 to learn pagination…');
  const firstHtml = await withRetry(() => fetchText(`${LISTING_URL}1`), PAGE_RETRIES, 'page 1');
  const first = parsePage(firstHtml);
  const maxPage = Math.max(first.maxPage, 1);
  console.log(`[viva] Last listing page is ${maxPage} (${first.products.length} products on page 1).`);

  const byId = new Map();
  for (const p of first.products) byId.set(p.id, p);

  const pages = [];
  for (let n = 2; n <= maxPage; n++) pages.push(n);

  let done = 1;
  let emptyStreak = 0;
  for (let i = 0; i < pages.length; i += CONCURRENCY) {
    const batch = pages.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (n) => {
        const html = await withRetry(() => fetchText(`${LISTING_URL}${n}`), PAGE_RETRIES, `page ${n}`);
        return { n, ...parsePage(html) };
      }),
    );
    for (const r of results) {
      done++;
      if (!r.products.length) emptyStreak++;
      else emptyStreak = 0;
      for (const p of r.products) if (!byId.has(p.id)) byId.set(p.id, p);
    }
    if (done % 16 === 0 || done === maxPage) {
      console.log(`[viva] Scraped ${done}/${maxPage} pages · ${byId.size} unique SKUs`);
      fs.writeFileSync(CACHE, JSON.stringify({ pages: done, products: [...byId.values()] }, null, 0));
    }
    if (emptyStreak >= 3) {
      console.log(`[viva] Stopping: ${emptyStreak} empty pages in a row at ~page ${batch[batch.length - 1]}.`);
      break;
    }
  }

  const products = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  const listing = { scrapedAt: new Date().toISOString(), pages: done, products };
  fs.writeFileSync(CACHE, JSON.stringify(listing));
  console.log(`[viva] Listing complete: ${products.length} unique SKUs.`);
  return listing;
}

const MUST_NAMES = [
  'Coca Cola 0.45L',
  'Coca Cola Original 0.33L',
  'Coca Cola Zero 0.45L',
  'Pije e gazuar Coca Cola 1.25l',
  'Birra kanaqe Peja 500ml',
  'Fanta Orange 0.45L',
  'Fanta Orange 0.33L',
  'Sprite 0.33L',
  'Sprite 2L',
  'Pepsi Cola 0.5L',
  'Red Bull 250ml',
  'Red Bull pa sheqer 250ml',
  'Pije energjike Monster 0.5L',
  'Uje natyral Rugove 0.5L',
  'Uje natyral Rugove 1.5l',
  'Uje natyral Dea 0.5L',
  'Uje natyral Dea 1.5L',
  'Uje natyral i Alpeve 0.5L',
  'Birra kanaqe Peja 500ml',
  'Birre Heineken 0.5L Kanaqe',
  'Birre ne shishe Tuborg 330ml',
  'Schweppes Tonic 0.33L',
  'Qumesht Vita 3.2% 1l',
  'Qumesht Alpsko 3.5% 1l',
  'Qumesht Alpsko 0.5% 1l',
  'Buke e bardhe Sheki 400gr',
  'Buke thekre Ko-Bake 500gr',
  'Veze 10 cope Fresh',
  'Veze te fresketa katuni Kaage 10 Cope',
  'Makarona tortiglioni Barilla 500gr',
  'Vaj luledielli Floil 1l',
  'Vaj luledielli Zvijezda 1l',
  'Kafe turke Prince 100gr',
  'Kafe turke Lona 100gr',
  'Ajvar i embel Podravka 350gr',
  'Ajvar djeges Podravka 350gr',
  'Butter Zdenka 250g',
  'Djath I bute Viotros Mozarella 200gr',
  'Djathe Feta Origjinal Olympus 200g',
  'Tuna e plote Happy Chunks 185gr',
  'Jogurt MU 1.3% 500ml',
  'Leter Toaleti Economic 2sh 8+2cope',
  'Leter toaleti Bora Kamomil 10cope 3Fsh',
  'Pelena per femije Junior Moltex 26 cope',
  'Pelena per femije Maxi Moltex 30 cope',
  'DOMESTOS 24H ORIGINAL 750ml',
  'CIF CREAM 500ml',
  'Detergjent Pllaka Ajax Lilac 1L',
  'Past dhembesh Colgate Advances White 75m',
  'Sapun Palmolive Aloe & Olive 90gr',
  'Sapun per duar Dove Pump. Protect 250ml',
  'Shampo flokesh oil repair Fructis 250ml',
  'Deodorant per femra original Dove 150ml',
  'Deodorant fresh active Nivea 150ml M',
  'Vata higjienike Always normal plus 10cop',
  'Camel Blue',
  'Camel Filter',
  'Winston Blue',
  'Winston Classic',
  'Lucky Strike Original Red 20pcs',
  'Lucky Strike blue 20pcs',
  'Marlboro Touch 6MG',
  'Marlboro Fine Touch 4MG',
  'West Red Soft',
  'Chesterfield Tuned Blue 6MG',
];

function isCigarette(n) {
  if (/\b(smoki|supe|sos |vaj |cokollat|loder|makarona|sode buke|pashtet)\b/.test(n)) return false;
  if (/\b(marlboro|winston|lucky strike|chesterfield|davidoff|parliament)\b/.test(n)) return true;
  if (/\bcamel\b/.test(n)) return true;
  if (/\bwest (red|silver|blue|white|soft)\b/.test(n)) return true;
  if (/\bkent\b/.test(n) && /\b(\d\s*mg|demi|crystal)\b/.test(n)) return true;
  if (/\b(cigare|duhan|20pcs)\b/.test(n) && !/\b(pelena|leter|sapun)\b/.test(n)) return true;
  return false;
}

function isSnack(n) {
  if (/cokollat|chocolate/.test(n) && !/\b(pije|uje )\b/.test(n)) return true;
  return /\b(cips|chips|lays|pringles|milka|kinder|snickers|twix|oreo|biskot|plazma|vafer|wafer|smoki|haribo|bonbona|kikirik|popcorn|keeks|keks |bombon|bueno|kitkat)\b/.test(n);
}

function isDrink(n) {
  if (isSnack(n) && !/(pije|uje |leng |cola |fanta|sprite|pepsi|red bull)/.test(n)) return false;
  if (/\b(bonbona|gome cola|haribo|bebeto)\b/.test(n)) return false;
  return /(pije|uje |uje\b|water|coca cola|fanta|sprite|pepsi|schweppes|red bull|energjike|monster 0|birr|heineken|tuborg|leng |frutti |bravo |capri sun|tonic|ice tea|cedevita)/.test(n);
}

function isHygiene(n) {
  if (/fairy drink|capri sun/.test(n)) return false;
  return /(sapun|shampo|shampon|paste dhem|past dhem|colgate|leter toalet|leter e lagur|peceta higj|pelena|always|libresse|domestos|cif |ajax |deodorant|nivea|dove |palmolive|vata higj|wipes|brushe per dhembe|shperlares goje|aroma per wc|faculete|zewa)/.test(n);
}

function isFood(n) {
  if (isSnack(n)) return false;
  if (/\b(ushqim qen|ushqim mace|friskies)\b/.test(n)) return false;
  if (/\b(sheqer vanille|sode buke|maj buke|gote letre)\b/.test(n)) return false;
  return /\b(qumesht|jogurt|djath|buke |veze |makarona|oriz |vaj luledielli|vaj ulliri|kafe turke|kafe inst|ajvar|butter |gjalp|margarin|tuna |sallam|virshlle|pashtet|kos |ajran|activia|barilla|podravka|indomie)\b/.test(n);
}

function isBulk(n) {
  if (/\b([6-9]|[1-9]\d+)\s*kg\b/.test(n)) return true;
  if (/\b(8|10|12|15|18|20|25)\s*(l|litra|liter|ltr)\b/.test(n)) return true;
  if (/\b(24|30|36|38)\s*(cope|cop|pcs)\b/.test(n) && !/\bpelena\b/.test(n)) return true;
  if (/\b(kuti e madhe|industrial|profesional|pallet|shumice)\b/.test(n)) return true;
  if (/\bsapun.*\b3\s*l\b/.test(n)) return true;
  if (/\buje.*\b5\s*l\b/.test(n)) return true;
  return false;
}

function skipReason(p) {
  const n = fold(p.name);
  if (!n) return 'empty-name';
  if (isBulk(n)) return 'bulk-industrial';
  if (/\b(aceton|thonje|klorhidrik|acid klor|arf grill|boje muri|cimento|vaj motori|antifriz|lodra|kepuce|tigan|tenxhere|mbajtese per sapun|mbajetse per sapun|set me sfungjer per grim)\b/.test(n)) {
    return 'not-latenight';
  }
  if (/\b(ushqim qen|ushqim mace|friskies|cat food|dog food)\b/.test(n)) return 'pet';
  if (/\b(dvd|playstation|usb stick|kufje)\b/.test(n)) return 'electronics';
  if (p.price > 40) return 'too-expensive';
  if (p.price < 0.15) return 'too-cheap';
  return '';
}

function classify(p) {
  const n = fold(p.name);
  const skip = skipReason(p);
  if (skip) return { category: null, tag: 'skip', skip, score: 0 };
  const must = MUST_NAMES.some((m) => fold(m) === n);

  if (isCigarette(n)) return { category: 'cigarettes', tag: 'tobacco', skip: '', score: must ? 120 : 95 };
  if (isHygiene(n)) {
    const core = /\b(leter toalet|pelena|always|colgate|domestos|cif |ajax |sapun|shampo|deodorant|leter e lagur)\b/.test(n);
    return { category: 'other', tag: 'hygiene', skip: '', score: (must ? 120 : core ? 88 : 62) };
  }
  if (isDrink(n)) {
    const core = /\b(coca cola|fanta|sprite|pepsi|red bull|monster|uje natyral|uje mineral|birra|heineken|tuborg)\b/.test(n);
    const handy = /\b(0 5|0 45|0 33|250 ml|330|355|1 5)\b/.test(n);
    return { category: 'drinks', tag: 'drinks', skip: '', score: (must ? 120 : 60) + (core ? 25 : 0) + (handy ? 10 : 0) };
  }
  if (isSnack(n)) {
    const core = /\b(lays|pringles|snickers|milka|oreo|kinder|plazma)\b/.test(n);
    return { category: 'snacks', tag: 'snacks', skip: '', score: (must ? 100 : 52) + (core ? 20 : 0) };
  }
  if (isFood(n)) {
    const staple = /\b(qumesht \S+ 1l|buke |veze |makarona|vaj luledielli|kafe turke|ajvar|butter |djath|tuna |jogurt.{0,24}(500|1l))\b/.test(n);
    return { category: 'food', tag: 'food', skip: '', score: (must ? 120 : staple ? 86 : 56) };
  }
  if (/\b(bateri|battery|kondom|durex|folie alumini|qese mbeturin)\b/.test(n)) {
    return { category: 'other', tag: 'household', skip: '', score: 48 };
  }
  return { category: null, tag: 'skip', skip: 'unclassified', score: 0 };
}

function customerPrice(costCents, category) {
  if (category === 'cigarettes') {
    const add = costCents >= 350 ? 70 : costCents >= 250 ? 60 : 50;
    let price = Math.round((costCents + add) / 10) * 10;
    if (price <= costCents) price = costCents + 50;
    return price;
  }
  const markup = category === 'drinks' ? 0.4 : category === 'snacks' ? 0.45 : category === 'food' ? 0.32 : 0.38;
  let price = Math.round((costCents * (1 + markup)) / 10) * 10;
  if (price <= costCents) price = Math.round((costCents + 20) / 10) * 10;
  if (price - costCents < 10) price = costCents + 10;
  return price;
}

function accentFor(name, category) {
  const n = fold(name);
  if (/coca|cola/.test(n)) return '#E61D2B';
  if (/fanta/.test(n)) return '#FF8A00';
  if (/sprite/.test(n)) return '#2DB24A';
  if (/red bull/.test(n)) return '#2F5FD0';
  if (/monster/.test(n)) return '#7ED321';
  if (/marlboro/.test(n)) return '#D7282F';
  if (/lays|lay s/.test(n)) return '#FFD200';
  if (/milka/.test(n)) return '#9B7FD4';
  return { drinks: '#4DA3FF', food: '#E8A54B', snacks: '#FFD200', cigarettes: '#C45C26', other: '#C5D4E0' }[category] || '#00FF66';
}

function isPopular(name, category) {
  const n = fold(name);
  return (
    /\b(coca cola|fanta|sprite|red bull|monster|pepsi|lays|pringles|snickers|milka|oreo|kinder|marlboro|winston|camel|pampers|always|ariel|colgate|dove |nutella|qumesht 1l|buke)\b/.test(n) ||
    (category === 'drinks' && /\b(uje 0 5|uje 1 5|water)\b/.test(n))
  );
}

function descriptionFor(name, category) {
  const bits = [];
  const unit = name.match(/(\d+(?:[.,]\d+)?\s?(?:ml|l|cl|g|gr|kg|cop|cope|rula)\b.*)$/i);
  if (unit) bits.push(unit[1].replace(/\s+/g, ' ').trim());
  if (category === 'cigarettes') bits.push('18+ only');
  bits.push('Viva Fresh');
  return bits.join(' · ').slice(0, 180);
}

function sizeKey(n) {
  const m = n.match(/(\d+(?:[.,]\d+)?)\s*(ml|l|cl|g|gr|kg)/);
  if (!m) return '';
  return `${m[1].replace(',', '.')}${m[2].replace('gr', 'g')}`;
}

function familyKey(name) {
  const n = fold(name).replace(/\b(\d+(?:[.,]\d+)?)\s*(ml|l|cl|g|gr|kg|cop|cope|rula)\b/g, '').replace(/\s+/g, ' ').trim();
  return n.slice(0, 48);
}

function groupKey(item) {
  const n = item.n || fold(item.name);
  if (item.category === 'drinks') {
    if (/frutti/.test(n)) return 'juice-frutti';
    if (/\bbravo\b/.test(n)) return 'juice-bravo';
    if (/\beko\b/.test(n)) return 'juice-eko';
    if (/uje me shije/.test(n)) return 'flavored-water';
    if (/fluidi/.test(n)) return 'soda-fluidi';
    if (/\brc cola\b/.test(n)) return 'soda-rc';
  }
  if (item.category === 'food') {
    if (/jogurt/.test(n)) return 'yogurt';
    if (/sallam pule/.test(n)) return 'sallam-pule';
    if (/virshlle/.test(n)) return 'virshlle';
    if (/pashtet/.test(n)) return 'pashtet';
    if (/kafe inst/.test(n)) return 'coffee-sachet';
    if (/muesli bar/.test(n)) return 'muesli-bar';
  }
  if (item.category === 'other') {
    if (/sapun i ngurt lahor/.test(n)) return 'soap-lahor';
    if (/sapun i lenget fresh/.test(n)) return 'soap-fresh-liquid';
    if (/sapun i ngurt fax/.test(n)) return 'soap-fax';
    if (/sapun palmolive/.test(n)) return 'soap-palmolive';
    if (/colgate/.test(n)) return 'colgate';
    if (/always/.test(n)) return 'always';
    if (/butterfly/.test(n)) return 'pads-butterfly';
    if (/hobby/.test(n)) return 'shamp-hobby';
    if (/schauma/.test(n)) return 'shamp-schauma';
    if (/fructis/.test(n)) return 'shamp-fructis';
    if (/leter e lagur/.test(n)) return 'wet-wipes';
    if (/aroma per wc/.test(n)) return 'wc-aroma';
    if (/leter toalet/.test(n)) return 'toilet-paper';
  }
  if (item.category === 'snacks') {
    if (/kinder/.test(n)) return 'kinder';
    if (/pringles/.test(n)) return 'pringles';
    if (/snickers/.test(n)) return 'snickers';
  }
  return `${item.category}:${familyKey(item.name)}`;
}

const GROUP_CAPS = {
  'juice-frutti': 4,
  'juice-bravo': 2,
  'juice-eko': 2,
  'flavored-water': 2,
  'soda-fluidi': 2,
  'soda-rc': 2,
  yogurt: 6,
  'sallam-pule': 2,
  virshlle: 2,
  pashtet: 2,
  'coffee-sachet': 2,
  'muesli-bar': 2,
  'soap-lahor': 2,
  'soap-fresh-liquid': 2,
  'soap-fax': 1,
  'soap-palmolive': 3,
  colgate: 3,
  always: 3,
  'pads-butterfly': 2,
  'shamp-hobby': 2,
  'shamp-schauma': 2,
  'shamp-fructis': 2,
  'wet-wipes': 3,
  domestos: 2,
  'wc-aroma': 2,
  'toilet-paper': 3,
  kinder: 4,
  pringles: 2,
  snickers: 2,
};

function selectCatalog(raw) {
  const skipped = [];
  const buckets = { drinks: [], food: [], snacks: [], cigarettes: [], other: [] };

  for (const p of raw) {
    p.name = decodeEntities(p.name);
    const cls = classify(p);
    if (!cls.category) {
      skipped.push({ name: p.name, price: p.price, reason: cls.skip });
      continue;
    }
    buckets[cls.category].push({ ...p, ...cls, cost_cents: Math.round(p.price * 100), n: fold(p.name) });
  }

  for (const cat of Object.keys(buckets)) {
    buckets[cat].sort((a, b) => b.score - a.score || a.price - b.price);
    const famCount = new Map();
    const groupCount = new Map();
    const kept = [];
    for (const item of buckets[cat]) {
      const fam = `${cat}:${familyKey(item.name)}`;
      const famCap = cat === 'drinks' || cat === 'cigarettes' ? 3 : 2;
      if ((famCount.get(fam) || 0) >= famCap) {
        skipped.push({ name: item.name, price: item.price, reason: 'duplicate-family' });
        continue;
      }
      const g = groupKey(item);
      const gCap = GROUP_CAPS[g] ?? 99;
      if ((groupCount.get(g) || 0) >= gCap) {
        skipped.push({ name: item.name, price: item.price, reason: 'duplicate-group' });
        continue;
      }
      famCount.set(fam, (famCount.get(fam) || 0) + 1);
      groupCount.set(g, (groupCount.get(g) || 0) + 1);
      kept.push(item);
    }
    buckets[cat] = kept;
  }

  const picked = [];
  const take = (cat, n) => {
    const list = buckets[cat].filter((p) => !picked.some((x) => x.id === p.id));
    picked.push(...list.slice(0, n));
  };

  const mustItems = Object.values(buckets)
    .flat()
    .filter((p) => MUST_NAMES.some((m) => fold(m) === fold(p.name)));
  picked.push(...mustItems);

  take('cigarettes', 40);
  take('drinks', QUOTAS.drinks);
  take('food', QUOTAS.food);
  take('other', QUOTAS.other);
  take('snacks', QUOTAS.snacks);

  if (picked.length < TARGET_MIN) {
    const rest = Object.values(buckets)
      .flat()
      .filter((p) => !picked.some((x) => x.id === p.id))
      .sort((a, b) => b.score - a.score);
    picked.push(...rest.slice(0, TARGET_MIN - picked.length));
  }
  if (picked.length > TARGET_MAX) {
    const mustIds = new Set(mustItems.map((p) => p.id));
    const keepCat = { cigarettes: 0, drinks: 0, food: 0, other: 0, snacks: 0 };
    const trimmed = [];
    for (const p of picked) {
      if (mustIds.has(p.id) || keepCat[p.category] < QUOTAS[p.category]) {
        trimmed.push(p);
        keepCat[p.category]++;
      }
      if (trimmed.length >= TARGET_MAX) break;
    }
    picked.length = 0;
    picked.push(...trimmed);
  }

  return { picked, skipped, bucketCounts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])) };
}

function extOf(url, contentType) {
  if (/webp/i.test(contentType) || /\.webp(\?|$)/i.test(url)) return 'webp';
  if (/png/i.test(contentType) || /\.png(\?|$)/i.test(url)) return 'png';
  if (/jpe?g/i.test(contentType) || /\.jpe?g(\?|$)/i.test(url)) return 'jpg';
  return 'webp';
}

async function downloadImages(items) {
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (p) => {
        if (!p.image || /placeholder/i.test(p.image)) {
          const local = ['webp', 'jpg', 'png'].map((ext) => `viva-${p.id}.${ext}`).find((f) => fs.existsSync(path.join(UPLOADS, f)));
          if (local) {
            p.image_url = `/uploads/${local}`;
            ok++;
            return;
          }
          p.image_url = '';
          fail++;
          return;
        }
        const already = ['webp', 'jpg', 'png'].map((ext) => `viva-${p.id}.${ext}`).find((f) => fs.existsSync(path.join(UPLOADS, f)));
        if (already) {
          p.image_url = `/uploads/${already}`;
          ok++;
          return;
        }
        try {
          const buf = await withRetry(async () => {
            const res = await fetch(p.image, { headers: { 'User-Agent': UA, Accept: 'image/webp,image/*,*/*' } });
            if (!res.ok) throw new Error(String(res.status));
            const ab = Buffer.from(await res.arrayBuffer());
            if (ab.length < 400) throw new Error('tiny');
            if (ab.length > 2_000_000) throw new Error('huge');
            p._ctype = res.headers.get('content-type') || '';
            return ab;
          }, IMG_RETRIES, `img ${p.id}`);
          const ext = extOf(p.image, p._ctype || '');
          const name = `viva-${p.id}.${ext}`;
          fs.writeFileSync(path.join(UPLOADS, name), buf);
          p.image_url = `/uploads/${name}`;
          ok++;
        } catch {
          p.image_url = '';
          fail++;
        }
      }),
    );
    if ((i + CONCURRENCY) % 32 === 0 || i + CONCURRENCY >= items.length) {
      console.log(`[viva] Images ${Math.min(i + CONCURRENCY, items.length)}/${items.length} (saved ${ok}, skipped ${fail})`);
    }
  }
  return { ok, fail };
}

function jsStr(s) {
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function writeSeed(products, defaultSettingsSrc) {
  const byCat = { drinks: [], food: [], snacks: [], cigarettes: [], other: [] };
  for (const p of products) byCat[p.category]?.push(p);
  const lines = [
    '// Launch catalog. Prices are in euro cents: `price` = what the customer pays,',
    '// `cost` = Viva Fresh shop price (what VND pays). Photos live in data/uploads after import.',
    '// Generated by scripts/import-viva.mjs — image_url is empty here on purpose.',
    'export const SEED_PRODUCTS = [',
  ];
  for (const [cat, list] of Object.entries(byCat)) {
    if (!list.length) continue;
    lines.push(`  // ${cat[0].toUpperCase()}${cat.slice(1)}`);
    for (const p of list) {
      const pop = p.popular ? ', popular: true' : '';
      lines.push(
        `  { name: ${jsStr(p.name)}, description: ${jsStr(p.description)}, category: '${p.category}', price: ${p.price_cents}, cost: ${p.cost_cents}, accent: '${p.accent}'${pop} },`,
      );
    }
    lines.push('');
  }
  lines.push('];');
  lines.push('');
  const settingsMatch = defaultSettingsSrc.match(/export const DEFAULT_SETTINGS = \{[\s\S]*?\n\};/);
  if (!settingsMatch) throw new Error('Could not preserve DEFAULT_SETTINGS in seed.js');
  fs.writeFileSync(SEED_PATH, `${lines.join('\n')}\n${settingsMatch[0]}\n`);
}

function decorate(p, i) {
  const catOrder = { drinks: 0, food: 1000, snacks: 2000, cigarettes: 3000, other: 4000 };
  p.price_cents = customerPrice(p.cost_cents, p.category);
  p.description = descriptionFor(p.name, p.category);
  p.accent = accentFor(p.name, p.category);
  p.popular = isPopular(p.name, p.category) ? 1 : 0;
  p.sort = (catOrder[p.category] || 0) + i;
}

function pickForOrdered(id, selected) {
  const by = (re) => selected.find((p) => re.test(p.name));
  switch (id) {
    case 1:
      return by(/^Coca Cola 0\.45L$/i) || by(/^Coca Cola Original 0\.33L$/i);
    case 2:
      return selected.find((p) => /coca cola 1\.25/i.test(p.name) && !/zero/i.test(p.name));
    case 3:
      return by(/^Sprite 0\.33L$/i);
    case 4:
      return by(/^Fanta Orange 0\.45L$/i) || by(/^Fanta Orange 0\.33L$/i);
    case 5:
      return by(/^Red Bull 250ml$/i);
    case 6:
      return by(/^Pije energjike Monster 0\.5L$/i);
    case 7:
      return by(/^Uje natyral Rugove 0\.5L$/i) || by(/^Uje natyral Dea 0\.5L$/i);
    case 10:
      return selected.find((p) => /lays/i.test(p.name));
    case 20:
      return by(/^Camel Blue$/i);
    default:
      return null;
  }
}

function upsertDb(selected) {
  selected.forEach(decorate);
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA busy_timeout = 8000; PRAGMA foreign_keys = ON;');
  const orderedIds = new Set(
    db.prepare('SELECT DISTINCT product_id AS id FROM order_items WHERE product_id IS NOT NULL').all().map((r) => r.id),
  );
  const now = new Date().toISOString();
  const update = db.prepare(
    `UPDATE products SET name=?, description=?, category=?, price_cents=?, cost_cents=?, image_url=?, accent=?, available=1, popular=?, sort=?, updated_at=? WHERE id=?`,
  );
  const insert = db.prepare(
    `INSERT INTO products (name, description, category, price_cents, cost_cents, image_url, accent, available, popular, sort, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,1,?,?,?,?)`,
  );

  const usedViva = new Set();
  let updated = 0;
  let inserted = 0;
  let removed = 0;

  db.exec('BEGIN IMMEDIATE');
  try {
    const keepForever = new Set([...orderedIds]);
    const batteries = db.prepare("SELECT id FROM products WHERE name = 'AA Batteries (2 pack)'").get();
    if (batteries) keepForever.add(batteries.id);

    for (const row of db.prepare('SELECT id FROM products').all()) {
      if (!keepForever.has(row.id)) {
        db.prepare('DELETE FROM products WHERE id = ?').run(row.id);
        removed++;
      }
    }

    for (const id of orderedIds) {
      const hit = pickForOrdered(id, selected);
      if (!hit) continue;
      update.run(
        hit.name,
        hit.description,
        hit.category,
        hit.price_cents,
        hit.cost_cents,
        hit.image_url || '',
        hit.accent,
        hit.popular,
        hit.sort,
        now,
        id,
      );
      usedViva.add(hit.id);
      updated++;
    }

    for (const p of selected) {
      if (usedViva.has(p.id)) continue;
      insert.run(
        p.name,
        p.description,
        p.category,
        p.price_cents,
        p.cost_cents,
        p.image_url || '',
        p.accent,
        p.popular,
        p.sort,
        now,
        now,
      );
      inserted++;
    }

    const extras = [
      { name: 'USB-C Charging Cable', description: '1 m fast charging cable', category: 'other', price: 600, cost: 400, accent: '#9A9A9A' },
      { name: 'Ice Bag', description: '2 kg ice cubes', category: 'other', price: 150, cost: 100, accent: '#8FD3FF' },
      { name: 'Lighter', description: 'Disposable lighter', category: 'cigarettes', price: 120, cost: 70, accent: '#FF5A36' },
      { name: 'Marlboro Red', description: '20 cigarettes · 18+ only', category: 'cigarettes', price: 450, cost: 390, accent: '#D7282F', popular: true },
    ];
    for (const e of extras) {
      const exists = db.prepare('SELECT id FROM products WHERE name = ?').get(e.name);
      if (exists) continue;
      insert.run(e.name, e.description, e.category, e.price, e.cost, '', e.accent, e.popular ? 1 : 0, 9000, now, now);
      inserted++;
    }

    db.exec('COMMIT');
    return { updated, inserted, removed, ordered: orderedIds.size };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.close();
  }
}

async function main() {
  const listing = await scrapeAll();
  const { picked, skipped, bucketCounts } = selectCatalog(listing.products);
  console.log('[viva] Classified usable pool', bucketCounts);
  console.log(`[viva] Selected ${picked.length} late-night SKUs (skipped ${skipped.length}).`);

  const img = await downloadImages(picked);
  const dbStats = upsertDb(picked);

  const seedSrc = fs.readFileSync(SEED_PATH, 'utf8');
  const finalRows = (() => {
    const db = new DatabaseSync(DB_PATH);
    const rows = db.prepare('SELECT name, description, category, price_cents, cost_cents, accent, popular FROM products WHERE available = 1 ORDER BY sort, id').all();
    db.close();
    return rows.map((r) => ({
      name: r.name,
      description: r.description,
      category: r.category,
      price_cents: r.price_cents,
      cost_cents: r.cost_cents,
      accent: r.accent,
      popular: !!r.popular,
    }));
  })();
  writeSeed(finalRows, seedSrc);

  const counts = {};
  for (const p of finalRows) counts[p.category] = (counts[p.category] || 0) + 1;
  const skipReasons = {};
  for (const s of skipped) skipReasons[s.reason] = (skipReasons[s.reason] || 0) + 1;

  const report = {
    scraped: listing.products.length,
    pages: listing.pages,
    selected: picked.length,
    imagesSaved: img.ok,
    imagesSkipped: img.fail,
    db: dbStats,
    categoryCounts: counts,
    skipReasons,
    markup:
      'Listing EUR ×100 = cost_cents. Customer price ≈ +32% food, +40% drinks, +45% snacks, +38% other, rounded to 10 cents. Cigarettes: cost +50–70 cents.',
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('[viva] Done.', JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('[viva] FAILED', err);
  process.exit(1);
});
