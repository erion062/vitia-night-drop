#!/usr/bin/env node
/**
 * Andi Market shelf list from store_display_all_24_images (photo transcription).
 * UNCLEAR prices are stored as €0.00 so Andi can set them in /partner.
 * Pack photos from Open Food Facts / Open Products Facts / Wikimedia Commons.
 * Generated tiles are only a last resort if no public pack shot exists.
 *   node scripts/import-andi.mjs
 *   node scripts/import-andi.mjs --photos
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPLOADS = path.join(ROOT, 'data', 'uploads');
const DB_PATH = path.join(ROOT, 'data', 'vnd.db');
const CREDITS = path.join(ROOT, 'marketing', 'partners', 'andi-photo-credits.json');
const PHOTOS_ONLY = process.argv.includes('--photos');
const UA = 'VND-andi-import/1.0 (https://vndviti.com; catalog photos for Andi Market)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PARTNER = {
  slug: 'andi',
  name: 'Andi Market',
  tagline: 'Market · pije, ushqim, shtëpi',
  phone: '+38345453998',
  hours: '14:00–23:00',
  logo: '/uploads/andi-logo.svg',
};

const open = 'Çmimi i hapur — Andi e vendos te paneli';
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function item(section, category, name, price, photo, description = '', accent = '#00FF66', popular = false) {
  return { section, category, name, price: price == null ? 0 : price, photo, description, accent, popular };
}

function isDark(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  if (!Number.isFinite(n)) return false;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 < 150;
}

function shelfSvg({ brand, variant, accent }) {
  const color = accent || '#00FF66';
  const ink = isDark(color) ? '#f2f2f2' : '#04140a';
  const b = xml(brand);
  const v = xml(variant);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <rect width="600" height="600" fill="#121212"/>
  <rect x="90" y="80" width="420" height="440" rx="28" fill="#1a1a1a" stroke="${color}" stroke-width="4"/>
  <rect x="90" y="80" width="420" height="120" rx="28" fill="${color}"/>
  <rect x="90" y="172" width="420" height="28" fill="#121212"/>
  <text x="300" y="155" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="34" font-weight="800" fill="${ink}">${b}</text>
  <text x="300" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#f2f2f2">${v}</text>
  <text x="300" y="460" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#9a9a9a">Andi Market</text>
</svg>
`;
}

const RB = '#0033A0';
const CHOC = '#6B3A2A';
const SNACK = '#E8A317';
const CIG = '#8B1A1F';
const DRINK = '#1FA2A2';

const MENU = [
  item('Pije', 'drinks', 'Red Bull Green Edition', 1.3, 'red-bull-green', 'Madhësia s’u pa në foto', '#00A651', true),
  item('Pije', 'drinks', 'Red Bull Lilac Edition', 2.5, 'red-bull-lilac', 'Madhësia s’u pa në foto', '#B57EDC'),
  item('Pije', 'drinks', 'Red Bull Original 250 ml', 1.3, 'red-bull-original', '250 ml', RB, true),
  item('Pije', 'drinks', 'Red Bull Yellow Edition', 1.3, 'red-bull-yellow', 'Madhësia s’u pa në foto', '#F5C518'),
  item('Pije', 'drinks', 'Red Bull Apricot Edition', 2.59, 'red-bull-apricot', 'Madhësia s’u pa në foto', '#E67E22'),
  item('Pije', 'drinks', 'Absolut Vodka Original', null, 'absolut-vodka', open, '#FAFAFA'),
  item('Pije', 'drinks', 'Jägermeister 1 L', 22, 'jagermeister', '1 L', '#1B5C32'),
  item('Pije', 'drinks', 'Grozd Cabernet 750 ml', null, 'grozd-cabernet', `${open} · 750 ml`, '#6B1028'),

  item('Çokollatë', 'snacks', 'Milka Alpine Milk 80 g', 1.49, 'milka-alpine', '80 g', CHOC, true),
  item('Çokollatë', 'snacks', 'Milka LU biscuit', 1.49, 'milka-lu', '', CHOC),
  item('Çokollatë', 'snacks', 'Milka Oreo 100 g', 1.5, 'milka-oreo', '100 g', CHOC),
  item('Çokollatë', 'snacks', 'Milka Bubbly Alpine Milk 90 g', 1.49, 'milka-bubbly-alpine', '90 g', CHOC),
  item('Çokollatë', 'snacks', 'Milka Strawberry', 1.49, 'milka-strawberry', '', '#C45C7A'),
  item('Çokollatë', 'snacks', 'Milka Bubbly White Chocolate 95 g', 1.49, 'milka-bubbly-white', '95 g', '#E8D9B0'),
  item('Çokollatë', 'snacks', 'Vitaminka Choco Stobi', 0.5, 'choco-stobi', '', CHOC),
  item('Çokollatë', 'snacks', 'Vitaminka Choco Peanuts', 1.09, 'choco-peanuts', '', CHOC),
  item('Çokollatë', 'snacks', 'Ülker Albeni Bites', 1.99, 'albeni-bites', '', '#C9A227'),

  item('Biskota e kek', 'snacks', 'Frondi Lemon (qese)', 2.19, 'frondi-lemon', 'Qese e madhe', '#E4D44A'),
  item('Biskota e kek', 'snacks', 'Frondi Cocoa (qese)', 2.19, 'frondi-cocoa', 'Qese e madhe', CHOC),
  item('Biskota e kek', 'snacks', 'Frondi Raspberry (qese)', 2.19, 'frondi-raspberry', 'Qese e madhe', '#C45C7A'),
  item('Biskota e kek', 'snacks', 'Frondi Coconut (qese)', 2.19, 'frondi-coconut', 'Qese e madhe', '#E8D9B0'),
  item('Biskota e kek', 'snacks', 'Frutti Orange (paketë e vogël)', 0.89, 'frutti-orange-small', 'Paketë e vogël', '#E67E22'),
  item('Biskota e kek', 'snacks', 'Frutti Orange (multipack)', 2.59, 'frutti-orange-multi', 'Multipack', '#E67E22'),
  item('Biskota e kek', 'snacks', 'Dankek Cocoa', 1.09, 'dankek-cocoa', 'Kek individual', CHOC),
  item('Biskota e kek', 'snacks', 'Dankek (letër e gjelbër)', 1.09, 'dankek-green', 'Shija s’u lexua qartë', '#3D8B4A'),
  item('Biskota e kek', 'snacks', 'Milka Choco Dessert Chocolate', 1.29, 'milka-dessert-choco', '', CHOC),
  item('Biskota e kek', 'snacks', 'Milka Choco Dessert Raspberry', 1.39, 'milka-dessert-raspberry', '', '#C45C7A'),
  item('Biskota e kek', 'snacks', 'Milka Choco Dessert Orange', null, 'milka-dessert-orange', open, '#E67E22'),
  item('Biskota e kek', 'snacks', 'Milka Choco Crème', 2.25, 'milka-choco-creme', '', CHOC),
  item('Biskota e kek', 'snacks', 'Jaffa Original orange 125 g', 0.99, 'jaffa-orange', '125 g', '#E67E22'),
  item('Biskota e kek', 'snacks', 'Euro Biscuit 125 g', 1.09, 'euro-biscuit', '125 g', SNACK),
  item('Biskota e kek', 'snacks', 'I Love You Classic', null, 'i-love-you', open, '#C45C7A'),
  item('Biskota e kek', 'snacks', 'Vincinni cream-filled cake', null, 'vincinni-cake', open, CHOC),
  item('Biskota e kek', 'snacks', 'Honey stroopwafels', null, 'stroopwafels', open, '#C9A227'),

  item('Kroasan', 'food', 'Belino Double Cocoa & Vanilla', 0.49, 'belino-cocoa-vanilla', '', CHOC, true),
  item('Kroasan', 'food', 'Belino Cherry', 0.49, 'belino-cherry', '', '#C41E3A'),
  item('Kroasan', 'food', 'Belino Pistachio', 0.49, 'belino-pistachio', '', '#7A9E3A'),
  item('Kroasan', 'food', 'Belino Double Cherry & Vanilla', 0.49, 'belino-cherry-vanilla', '', '#C41E3A'),
  item('Kroasan', 'food', 'Belino Cocoa (letër kafe)', null, 'belino-cocoa', open, CHOC),
  item('Kroasan', 'food', '7 Days Double', null, 'seven-days-double', open, SNACK),
  item('Kroasan', 'food', 'BONO Vanilla', null, 'bono-vanilla', open, '#E8D9B0'),
  item('Kroasan', 'food', 'BONO Cocoa & Vanilla', null, 'bono-cocoa-vanilla', open, CHOC),
  item('Kroasan', 'food', 'BONO Pistachio', 0.5, 'bono-pistachio', '', '#7A9E3A'),
  item('Kroasan', 'food', 'BONO (letër rozë)', null, 'bono-pink', `${open} · shija të konfirmohet`, '#C45C7A'),
  item('Kroasan', 'food', 'BONO (letër e kuqe)', null, 'bono-red', open, '#C41E3A'),
  item('Kroasan', 'food', 'BONO (letër blu)', null, 'bono-blue', open, RB),

  item('Krakerë', 'snacks', 'TUC Original', 0.85, 'tuc-original', '', SNACK, true),
  item('Krakerë', 'snacks', 'TUC Paprika', null, 'tuc-paprika', open, '#E67E22'),
  item('Krakerë', 'snacks', 'Eti Crax Herbs 40 g', 0.45, 'crax-herbs', '40 g', '#7A9E3A'),
  item('Krakerë', 'snacks', 'Eti Crax Spicy 40 g', null, 'crax-spicy', `${open} · 40 g`, '#C41E3A'),
  item('Krakerë', 'snacks', 'Eti Crax Cheese 40 g', 0.4, 'crax-cheese', '40 g', '#F5C518'),
  item('Krakerë', 'snacks', 'Eti Crax Gong Lime & Chilli', 0.4, 'crax-gong-lime', '', '#7A9E3A'),
  item('Krakerë', 'snacks', 'Eti Crax Hot Paprika', 0.49, 'crax-hot-paprika', '', '#C41E3A'),
  item('Krakerë', 'snacks', 'GUD Original (qese e madhe)', 0.8, 'gud-original-large', 'Qese e madhe', SNACK),
  item('Krakerë', 'snacks', 'GUD Chilli (qese e madhe)', 0.8, 'gud-chilli-large', 'Qese e madhe', '#C41E3A'),
  item('Krakerë', 'snacks', 'GUD Original (qese e vogël)', 0.5, 'gud-original-small', 'Qese e vogël', SNACK),
  item('Krakerë', 'snacks', 'GUD Chilli (qese e vogël)', 0.5, 'gud-chilli-small', 'Qese e vogël', '#C41E3A'),
  item('Krakerë', 'snacks', 'Taze Hot Fire', 1.09, 'taze-hot-fire', '', '#C41E3A'),
  item('Krakerë', 'snacks', 'Taze Salty', 1.09, 'taze-salty', '', SNACK),
  item('Krakerë', 'snacks', 'Stobi Flips Magnus Original', 1.65, 'stobi-magnus-original', '', SNACK),
  item('Krakerë', 'snacks', 'Stobi Flips Magnus Hot & Spicy', 1.65, 'stobi-magnus-hot', '', '#C41E3A'),
  item('Krakerë', 'snacks', 'Stobi Flips Magnus Extra Hot', 1.65, 'stobi-magnus-extra-hot', '', '#8B1A1F'),
  item('Krakerë', 'snacks', 'Maksi Flips BBQ', 1.65, 'maksi-flips-bbq', '', '#C45C26'),

  item('Kikirikë', 'snacks', "NicNac's Original 110 g", 1.59, 'nicnacs-original', '110 g', SNACK),
  item('Kikirikë', 'snacks', "NicNac's BBQ", 1.99, 'nicnacs-bbq', '', '#C45C26'),

  item('Pringles', 'snacks', 'Pringles Sour Cream & Onion (tub i madh)', 2.39, 'pringles-sco-large', 'Tub i madh', '#3D8B4A'),
  item('Pringles', 'snacks', 'Pringles Cheesy Cheese (tub i madh)', null, 'pringles-cheesy-large', `${open} · tub i madh`, '#F5C518'),
  item('Pringles', 'snacks', 'Pringles Cheese & Onion (tub i madh)', null, 'pringles-cheese-onion-large', `${open} · tub i madh`, '#F5C518'),
  item('Pringles', 'snacks', 'Pringles Original (tub i madh)', null, 'pringles-original-large', `${open} · tub i madh`, '#C41E3A'),
  item('Pringles', 'snacks', 'Pringles Sour Cream & Onion (tub i vogël)', 1.19, 'pringles-sco-small', 'Tub i vogël', '#3D8B4A'),
  item('Pringles', 'snacks', 'Pringles Original (tub i vogël)', null, 'pringles-original-small', `${open} · tub i vogël`, '#C41E3A'),
  item('Pringles', 'snacks', 'Pringles Paprika (tub i vogël)', null, 'pringles-paprika-small', `${open} · tub i vogël`, '#E67E22'),

  item('Chips', 'snacks', 'Patos Taco Spicy', 0.35, 'patos-taco-spicy', '', '#C41E3A', true),
  item('Chips', 'snacks', 'Patos Rolls Hot Pepper', 0.35, 'patos-rolls-hot', '', '#C41E3A'),
  item('Chips', 'snacks', 'Patos Alev', null, 'patos-alev', open, '#C41E3A'),
  item('Chips', 'snacks', 'Patos extra-spicy (qese e kuqe/zezë)', null, 'patos-extra-spicy', open, '#8B1A1F'),
  item('Chips', 'snacks', 'Vipa Chilli', 0.39, 'vipa-chilli', '', '#C41E3A'),
  item('Chips', 'snacks', 'Vipa Ketchup', 0.39, 'vipa-ketchup', '', '#C41E3A'),
  item('Chips', 'snacks', 'Vipa Paprika', null, 'vipa-paprika', open, '#E67E22'),
  item('Chips', 'snacks', 'Clipsy Ketchup', 0.6, 'clipsy-ketchup', '', '#C41E3A'),
  item('Chips', 'snacks', 'Clipsy Hot Dog', 0.6, 'clipsy-hotdog', '', '#C45C26'),
  item('Chips', 'snacks', "Lay's Maxx Chilli & Lime", 0.49, 'lays-maxx-chilli-lime', '', '#7A9E3A', true),
  item('Chips', 'snacks', "Lay's Maxx Paprika", 0.49, 'lays-maxx-paprika', '', '#E67E22'),
  item('Chips', 'snacks', 'Chipsy Rebrasti Chilli', 0.75, 'chipsy-rebrasti-chilli', '', '#C41E3A'),
  item('Chips', 'snacks', 'Doritos Sweet Chilli', 1.29, 'doritos-sweet-chilli', '', '#C41E3A'),
  item('Chips', 'snacks', 'Doritos Hot Corn', 1.29, 'doritos-hot-corn', '', '#E67E22'),
  item('Chips', 'snacks', 'Doritos Taco', 1.29, 'doritos-taco', '', '#C9A227'),
  item('Chips', 'snacks', 'Doritos Nacho', 1.29, 'doritos-nacho', '', '#F5C518'),
  item('Chips', 'snacks', 'Doritos Cool Original', 1.29, 'doritos-cool-original', '', '#3D8B4A'),
  item('Chips', 'snacks', 'Doritos Mexican Beef Burrito', 1.29, 'doritos-burrito', '', '#C45C26'),
  item('Chips', 'snacks', 'Doritos Thai Style', 1.29, 'doritos-thai', '', '#7A9E3A'),
  item('Chips', 'snacks', 'Fripsy Pizza', null, 'fripsy-pizza', open, '#C45C26'),
  item('Chips', 'snacks', 'Fripsy (panel i gjelbër)', null, 'fripsy-green', open, '#3D8B4A'),
  item('Chips', 'snacks', 'Fripsy Chicken', null, 'fripsy-chicken', open, SNACK),
  item('Chips', 'snacks', 'Fripsy BBQ', null, 'fripsy-bbq', open, '#C45C26'),
  item('Chips', 'snacks', 'Fripsy (qese e gjelbër në skaj)', null, 'fripsy-green-edge', open, '#3D8B4A'),

  item('Cigare', 'cigarettes', 'Marlboro Red', 3.5, 'marlboro-red', 'Varianti nga fotoja e raftit', CIG, true),
  item('Cigare', 'cigarettes', 'Marlboro Gold', 3.5, 'marlboro-gold', 'Varianti nga fotoja e raftit', '#C9A227', true),
  item('Cigare', 'cigarettes', 'Marlboro Gold Original', 2.9, 'marlboro-gold-original', 'Format tjetër pakete', '#C9A227'),
  item('Cigare', 'cigarettes', 'Marlboro Touch Dark', 3.0, 'marlboro-touch-dark', 'Paketë e errët', '#2a2a2a'),
  item('Cigare', 'cigarettes', 'Marlboro Touch Blue', 3.0, 'marlboro-touch-blue', 'Paketë blu', RB),
  item('Cigare', 'cigarettes', 'Marlboro Touch Gold', 3.0, 'marlboro-touch-gold', 'Paketë gold', '#C9A227'),
  item('Cigare', 'cigarettes', 'Davidoff Burgundy', 3.4, 'davidoff-burgundy', 'Paketë burgundy', '#6B1028'),
  item('Cigare', 'cigarettes', 'Davidoff White', 2.7, 'davidoff-white', 'Paketë e bardhë', '#E8E8E8'),
  item('Cigare', 'cigarettes', 'Lucky Strike Red', 2.8, 'lucky-strike-red', '', '#C41E3A'),
  item('Cigare', 'cigarettes', 'Lucky Strike Blue', 2.8, 'lucky-strike-blue', '', RB),
  item('Cigare', 'cigarettes', 'Lucky Strike Dark', 2.9, 'lucky-strike-dark', 'Paketë e errët', '#2a2a2a'),
  item('Cigare', 'cigarettes', 'Winston Red', 2.8, 'winston-red', '', '#C41E3A'),
  item('Cigare', 'cigarettes', 'Winston Blue', 2.8, 'winston-blue', '', RB),
  item('Cigare', 'cigarettes', 'Winston Grey', 2.8, 'winston-grey', 'Paketë gri', '#8a8a8a'),
  item('Cigare', 'cigarettes', 'Winston White', null, 'winston-white', open, '#E8E8E8'),
  item('Cigare', 'cigarettes', 'Winston XStyle Blue', 2.7, 'winston-xstyle-blue', '', RB),
  item('Cigare', 'cigarettes', 'Camel Yellow', null, 'camel-yellow', open, '#C4A35A'),
  item('Cigare', 'cigarettes', 'Camel Blue', null, 'camel-blue', open, RB),
  item('Cigare', 'cigarettes', 'Camel Compact Blue', 2.3, 'camel-compact-blue', 'Paketë kompakte blu', RB),
  item('Cigare', 'cigarettes', 'Kent Dark', 3.4, 'kent-dark', 'Paketë e errët', '#2a2a2a'),
  item('Cigare', 'cigarettes', 'Kent Grey', 3.4, 'kent-grey', 'Paketë gri', '#8a8a8a'),
  item('Cigare', 'cigarettes', 'Kent White/Blue', null, 'kent-white-blue', open, RB),
  item('Cigare', 'cigarettes', 'West Red', null, 'west-red', open, '#C41E3A'),
  item('Cigare', 'cigarettes', 'Prestige Blue', 2.9, 'prestige-blue', '', RB),
  item('Cigare', 'cigarettes', 'Eva Gold', 2.5, 'eva-gold', 'Paketë gold', '#C9A227'),
  item('Cigare', 'cigarettes', 'Sobranie Black', 3.4, 'sobranie-black', '', '#111111'),
  item('Cigare', 'cigarettes', 'Sobranie Gold', 3.5, 'sobranie-gold', '', '#C9A227'),
  item('Cigare', 'cigarettes', 'Ronson Red', 2.5, 'ronson-red', '', '#C41E3A'),
  item('Cigare', 'cigarettes', 'Rothmans Blue', 2.4, 'rothmans-blue', '', RB),
  item('Cigare', 'cigarettes', 'Rothmans Compact Blue', 2.7, 'rothmans-compact-blue', 'Paketë kompakte blu', RB),
  item('Cigare', 'cigarettes', 'Chesterfield Blue', null, 'chesterfield-blue', open, RB),
  item('Cigare', 'cigarettes', 'Chesterfield Dark Blue', 2.3, 'chesterfield-dark-blue', 'Paketë blu e errët', '#143C70'),
];

const SEARCH = {
  'red-bull-green': 'Red Bull Green Edition dragon fruit',
  'red-bull-lilac': 'Red Bull Lilac Edition',
  'red-bull-original': 'Red Bull Energy Drink 250ml',
  'red-bull-yellow': 'Red Bull Yellow Edition tropical',
  'red-bull-apricot': 'Red Bull Apricot Edition',
  'absolut-vodka': 'Absolut Vodka bottle',
  jagermeister: 'Jagermeister bottle',
  'grozd-cabernet': 'Grozd Cabernet wine',
  'milka-alpine': 'Milka Alpine Milk chocolate',
  'milka-lu': 'Milka LU biscuit chocolate',
  'milka-oreo': 'Milka Oreo chocolate',
  'milka-bubbly-alpine': 'Milka Bubbly Alpine Milk',
  'milka-strawberry': 'Milka strawberry chocolate',
  'milka-bubbly-white': 'Milka Bubbly white chocolate',
  'choco-stobi': 'Stobi Choco Vitaminka',
  'choco-peanuts': 'Vitaminka Choco Peanuts',
  'albeni-bites': 'Ulker Albeni Bites',
  'frondi-lemon': 'Frondi Maxi lemon wafer',
  'frondi-cocoa': 'Frondi Maxi cocoa wafer',
  'frondi-raspberry': 'Frondi Maxi raspberry wafer',
  'frondi-coconut': 'Frondi Maxi coconut wafer',
  'frutti-orange-small': 'Jaffa Frutti orange biscuit',
  'frutti-orange-multi': 'Jaffa Frutti orange',
  'dankek-cocoa': 'Dankek cocoa cake',
  'dankek-green': 'Dankek cake',
  'milka-dessert-choco': 'Milka Choco Dessert chocolate',
  'milka-dessert-raspberry': 'Milka Choco Dessert raspberry',
  'milka-dessert-orange': 'Milka Choco Dessert orange',
  'milka-choco-creme': 'Milka Choco Creme',
  'jaffa-orange': 'Jaffa cakes original orange',
  'euro-biscuit': 'Euro Biscuit 125g',
  'i-love-you': 'I Love You chocolate wafer',
  'vincinni-cake': 'Vincinni cake',
  stroopwafels: 'stroopwafel honey caramel',
  'belino-cocoa-vanilla': 'Belino croissant cocoa vanilla',
  'belino-cherry': 'Belino croissant cherry',
  'belino-pistachio': 'Belino croissant pistachio',
  'belino-cherry-vanilla': 'Belino croissant cherry vanilla',
  'belino-cocoa': 'Belino croissant cocoa',
  'seven-days-double': '7 Days croissant Double',
  'bono-vanilla': 'BONO croissant vanilla',
  'bono-cocoa-vanilla': 'BONO croissant cocoa vanilla',
  'bono-pistachio': 'BONO croissant pistachio',
  'bono-pink': 'BONO croissant',
  'bono-red': 'BONO croissant strawberry',
  'bono-blue': 'BONO croissant',
  'tuc-original': 'TUC original crackers',
  'tuc-paprika': 'TUC paprika crackers',
  'crax-herbs': 'Eti Crax herbs',
  'crax-spicy': 'Eti Crax spicy',
  'crax-cheese': 'Eti Crax cheese',
  'crax-gong-lime': 'Eti Crax Gong lime chilli',
  'crax-hot-paprika': 'Eti Crax hot paprika',
  'gud-original-large': 'GUD flips original',
  'gud-chilli-large': 'GUD flips chilli',
  'gud-original-small': 'GUD flips original',
  'gud-chilli-small': 'GUD flips chilli',
  'taze-hot-fire': 'Taze Hot Fire chips',
  'taze-salty': 'Taze salty chips',
  'stobi-magnus-original': 'Stobi Flips Magnus original',
  'stobi-magnus-hot': 'Stobi Flips Magnus hot spicy',
  'stobi-magnus-extra-hot': 'Stobi Flips Magnus extra hot',
  'maksi-flips-bbq': 'Maksi Flips BBQ',
  'nicnacs-original': "NicNac's peanuts original",
  'nicnacs-bbq': "NicNac's BBQ peanuts",
  'pringles-sco-large': 'Pringles Sour Cream Onion',
  'pringles-cheesy-large': 'Pringles Cheesy Cheese',
  'pringles-cheese-onion-large': 'Pringles Cheese Onion',
  'pringles-original-large': 'Pringles Original',
  'pringles-sco-small': 'Pringles Sour Cream Onion',
  'pringles-original-small': 'Pringles Original',
  'pringles-paprika-small': 'Pringles Paprika',
  'patos-taco-spicy': 'Patos Taco Spicy',
  'patos-rolls-hot': 'Patos Rolls hot pepper',
  'patos-alev': 'Patos Alev chips',
  'patos-extra-spicy': 'Patos aci chips',
  'vipa-chilli': 'Vipa chilli chips',
  'vipa-ketchup': 'Vipa ketchup chips',
  'vipa-paprika': 'Vipa paprika chips',
  'clipsy-ketchup': 'Clipsy ketchup chips',
  'clipsy-hotdog': 'Clipsy hot dog chips',
  'lays-maxx-chilli-lime': "Lay's Maxx chilli lime",
  'lays-maxx-paprika': "Lay's Maxx paprika",
  'chipsy-rebrasti-chilli': 'Chipsy Rebrasti chilli',
  'doritos-sweet-chilli': 'Doritos Sweet Chilli',
  'doritos-hot-corn': 'Doritos Hot Corn',
  'doritos-taco': 'Doritos Taco',
  'doritos-nacho': 'Doritos Nacho Cheese',
  'doritos-cool-original': 'Doritos Cool Original',
  'doritos-burrito': 'Doritos Mexican Beef Burrito',
  'doritos-thai': 'Doritos Thai Sweet Chilli',
  'fripsy-pizza': 'Fripsy pizza snacks',
  'fripsy-green': 'Fripsy chips',
  'fripsy-chicken': 'Fripsy chicken snacks',
  'fripsy-bbq': 'Fripsy BBQ snacks',
  'fripsy-green-edge': 'Fripsy snacks',
  'marlboro-red': 'Marlboro Red cigarettes',
  'marlboro-gold': 'Marlboro Gold cigarettes',
  'marlboro-gold-original': 'Marlboro Gold cigarettes',
  'marlboro-touch-dark': 'Marlboro Touch cigarettes',
  'marlboro-touch-blue': 'Marlboro Touch cigarettes',
  'marlboro-touch-gold': 'Marlboro Fine Touch',
  'davidoff-burgundy': 'Davidoff cigarettes burgundy',
  'davidoff-white': 'Davidoff cigarettes white',
  'lucky-strike-red': 'Lucky Strike red cigarettes',
  'lucky-strike-blue': 'Lucky Strike blue cigarettes',
  'lucky-strike-dark': 'Lucky Strike cigarettes',
  'winston-red': 'Winston red cigarettes',
  'winston-blue': 'Winston blue cigarettes',
  'winston-grey': 'Winston cigarettes',
  'winston-white': 'Winston white cigarettes',
  'winston-xstyle-blue': 'Winston Xstyle blue',
  'camel-yellow': 'Camel yellow cigarettes',
  'camel-blue': 'Camel blue cigarettes',
  'camel-compact-blue': 'Camel blue cigarettes',
  'kent-dark': 'Kent cigarettes',
  'kent-grey': 'Kent cigarettes',
  'kent-white-blue': 'Kent cigarettes',
  'west-red': 'West red cigarettes',
  'prestige-blue': 'Prestige blue cigarettes',
  'eva-gold': 'Eva gold cigarettes',
  'sobranie-black': 'Sobranie black cigarettes',
  'sobranie-gold': 'Sobranie gold cigarettes',
  'ronson-red': 'Ronson red cigarettes',
  'rothmans-blue': 'Rothmans blue cigarettes',
  'rothmans-compact-blue': 'Rothmans blue cigarettes',
  'chesterfield-blue': 'Chesterfield blue cigarettes',
  'chesterfield-dark-blue': 'Chesterfield cigarettes',
};

const SHARE = {
  'gud-original-small': 'gud-original-large',
  'gud-chilli-small': 'gud-chilli-large',
  'gud-original-large': 'gud-chilli-large',
  'pringles-sco-small': 'pringles-sco-large',
  'pringles-original-small': 'pringles-original-large',
  'frutti-orange-multi': 'frutti-orange-small',
  'frondi-lemon': 'frondi-coconut',
  'frondi-cocoa': 'frondi-coconut',
  'frondi-raspberry': 'frondi-coconut',
  'belino-cocoa-vanilla': 'belino-cocoa',
  'belino-cherry': 'belino-cocoa',
  'belino-pistachio': 'belino-cocoa',
  'belino-cherry-vanilla': 'belino-cocoa',
  'bono-vanilla': 'bono-pistachio',
  'bono-cocoa-vanilla': 'bono-pistachio',
  'bono-pink': 'bono-pistachio',
  'bono-red': 'bono-pistachio',
  'bono-blue': 'bono-pistachio',
  'fripsy-green-edge': 'fripsy-green',
  'fripsy-pizza': 'fripsy-green',
  'fripsy-chicken': 'fripsy-green',
  'fripsy-bbq': 'fripsy-green',
  'vipa-paprika': 'vipa-chilli',
  'patos-alev': 'patos-taco-spicy',
  'patos-extra-spicy': 'patos-taco-spicy',
  'marlboro-gold-original': 'marlboro-gold',
  'marlboro-touch-blue': 'marlboro-touch-dark',
  'marlboro-touch-gold': 'marlboro-touch-dark',
  'camel-compact-blue': 'camel-blue',
  'camel-yellow': 'camel-blue',
  'rothmans-compact-blue': 'rothmans-blue',
  'davidoff-white': 'davidoff-burgundy',
  'sobranie-gold': 'sobranie-black',
  'stobi-magnus-hot': 'stobi-magnus-original',
  'stobi-magnus-extra-hot': 'stobi-magnus-original',
};

const PHOTO_URLS = {
  'albeni-bites': 'https://images.openfoodfacts.org/images/products/869/050/403/4438/front_ro.29.400.jpg',
  'frondi-coconut': 'https://images.openfoodfacts.org/images/products/387/045/000/1936/front_sl.15.400.jpg',
  'belino-cocoa-vanilla': 'https://images.openfoodfacts.org/images/products/530/100/023/0011/front_en.4.400.jpg',
  'seven-days-double': 'https://images.openfoodfacts.org/images/products/762/220/201/0231/front_en.32.400.jpg',
  'nicnacs-original': 'https://images.openfoodfacts.org/images/products/401/807/700/4896/front_de.34.400.jpg',
  'clipsy-hotdog': 'https://images.openfoodfacts.org/images/products/387/018/340/0013/front_hr.9.400.jpg',
  'chipsy-rebrasti-chilli': 'https://images.openfoodfacts.org/images/products/860/601/737/7597/front_fr.3.400.jpg',
  'crax-gong-lime': 'https://images.openfoodfacts.org/images/products/869/052/602/4493/front_en.4.400.jpg',
  'crax-hot-paprika': 'https://images.openfoodfacts.org/images/products/869/052/661/4083/front_en.7.400.jpg',
  'jaffa-orange': 'https://images.openfoodfacts.org/images/products/860/011/400/6244/front_fr.8.400.jpg',
  'dankek-green': 'https://images.openfoodfacts.org/images/products/869/050/407/8708/front_en.3.400.jpg',
  'patos-alev': 'https://images.openfoodfacts.org/images/products/869/147/720/0134/front_en.4.400.jpg',
  'stobi-magnus-original': 'https://images.openfoodfacts.org/images/products/531/000/500/5562/front_fr.3.400.jpg',
  'gud-chilli-large': 'https://images.openfoodfacts.org/images/products/860/601/737/8396/front_en.11.400.jpg',
  'gud-chilli-small': 'https://images.openfoodfacts.org/images/products/860/601/737/8310/front_en.3.400.jpg',
  'vipa-paprika': 'https://images.openfoodfacts.org/images/products/390/263/465/0118/front_fr.15.400.jpg',
  stroopwafels: 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Stroopwafels_01.jpg',
};

const BARCODES = {
  'albeni-bites': '8690504034438',
  'frondi-coconut': '3870450001936',
  'belino-cocoa-vanilla': '5301000230011',
  'belino-cherry': '5301000230103',
  'seven-days-double': '7622202010231',
  'nicnacs-original': '4018077004896',
  'clipsy-hotdog': '3870183400013',
  'chipsy-rebrasti-chilli': '8606017377597',
  'crax-gong-lime': '8690526024493',
  'jaffa-orange': '8600114006244',
  'dankek-cocoa': '8690504078708',
  'stobi-magnus-original': '5310005005562',
  'gud-chilli-large': '8606017378396',
};

const COMMONS_FILE = {
  'davidoff-burgundy': 'Davidoff_Cigarettes.JPG',
  'davidoff-white': 'Davidoff_Cigarettes.JPG',
  'camel-yellow': 'Camel_cigarette_pack_(softpack)_on_white_background.jpg',
  'sobranie-black': 'سوبرانی_Sobranie_01.jpg',
  'sobranie-gold': 'سوبرانی_Sobranie_01.jpg',
  stroopwafels: 'Stroopwafels_01.jpg',
  'jaffa-orange': 'Jaffa_cakes_in_lightbox_01_(cropped).png',
};

const WIKI_PAGE = {
  stroopwafels: 'Stroopwafel',
  'jaffa-orange': 'Jaffa_Cakes',
  jagermeister: 'Jägermeister',
};

const BRAND_TAG = {
  'frondi-lemon': 'frondi',
  'frondi-cocoa': 'frondi',
  'frondi-raspberry': 'frondi',
  'frondi-coconut': 'frondi',
  'albeni-bites': 'albeni',
  'dankek-cocoa': 'dankek',
  'dankek-green': 'dankek',
  'belino-cocoa-vanilla': 'belino',
  'belino-cherry': 'belino',
  'belino-pistachio': 'belino',
  'belino-cherry-vanilla': 'belino',
  'seven-days-double': '7-days',
  'gud-original-large': 'gud',
  'gud-chilli-large': 'gud',
  'clipsy-hotdog': 'clipsy',
  'chipsy-rebrasti-chilli': 'chipsy',
  'patos-alev': 'patos',
  'stobi-magnus-original': 'vitaminka',
  'stobi-magnus-hot': 'vitaminka',
  'maksi-flips-bbq': 'vitaminka',
  'choco-peanuts': 'vitaminka',
  'nicnacs-original': 'lorenz',
  'crax-gong-lime': 'eti',
  'crax-hot-paprika': 'eti',
  'vipa-paprika': 'vipa',
  'euro-biscuit': 'eurocrem',
  'milka-bubbly-alpine': 'milka',
  'milka-dessert-choco': 'milka',
  'frutti-orange-small': 'jaffa',
  'grozd-cabernet': 'grozd',
  'davidoff-burgundy': 'davidoff',
  'rothmans-blue': 'rothmans',
  'sobranie-black': 'sobranie',
  'prestige-blue': 'prestige',
  'eva-gold': 'eva',
};

const REUSE = {
  'red-bull-original': 'viva-3937.webp',
  'red-bull-yellow': 'viva-14276.webp',
  'lays-maxx-chilli-lime': 'viva-10433.webp',
  'pringles-original-large': 'viva-13913.webp',
  'marlboro-red': 'cig-marlboro-red.svg',
  'marlboro-gold': 'cig-marlboro-gold.svg',
  'marlboro-touch-dark': 'cig-marlboro-touch-6mg.svg',
  'marlboro-touch-gold': 'cig-marlboro-fine-touch-4mg.svg',
  'lucky-strike-red': 'cig-lucky-strike-original-red-20pcs.svg',
  'lucky-strike-blue': 'cig-lucky-strike-blue-20pcs.svg',
  'winston-blue': 'cig-winston-blue.svg',
  'winston-red': 'cig-winston-classic.svg',
  'camel-blue': 'cig-camel-blue.svg',
  'camel-yellow': 'cig-camel-filter.svg',
  'west-red': 'cig-west-red-soft.svg',
  'chesterfield-blue': 'cig-chesterfield-tuned-blue-6mg.svg',
  'kent-dark': 'cig-kent-demi-crystal-6mg.svg',
  'kent-grey': 'cig-kent-demi-crystal-4mg.svg',
};

function rasterPath(photo) {
  for (const ext of ['.jpg', '.webp', '.png']) {
    const f = path.join(UPLOADS, `andi-${photo}${ext}`);
    if (fs.existsSync(f) && fs.statSync(f).size > 2000) return f;
  }
  return '';
}

function imageFor(photo) {
  for (const ext of ['.jpg', '.webp', '.png', '.svg']) {
    const f = `andi-${photo}${ext}`;
    if (fs.existsSync(path.join(UPLOADS, f))) return `/uploads/${f}`;
  }
  return '';
}

function dropSvg(photo) {
  const svg = path.join(UPLOADS, `andi-${photo}.svg`);
  if (fs.existsSync(svg)) fs.rmSync(svg);
}

async function jsonGet(url) {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (res.status === 429 || res.status === 503) {
        await sleep(1200 * (i + 1));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await sleep(800 * (i + 1));
    }
  }
  return null;
}

async function saveUrl(url, dest) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      if (!res.ok) {
        await sleep(600);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2500) return false;
      fs.writeFileSync(dest, buf);
      return true;
    } catch {
      await sleep(600);
    }
  }
  return false;
}

function pickOffImage(products, query) {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9äöüéèçß]+/i)
    .filter((t) => t.length > 2 && !['the', 'and', 'cigarettes', 'bottle'].includes(t));
  const ranked = (products || [])
    .map((p) => {
      const hay = `${p.product_name || ''} ${p.brands || ''}`.toLowerCase();
      const img = p.image_front_url || p.image_url || '';
      const score = tokens.filter((t) => hay.includes(t)).length;
      return { p, img, score, hay };
    })
    .filter((x) => x.img.startsWith('http') && (tokens.length ? x.score > 0 : true))
    .sort((a, b) => b.score - a.score);
  return ranked[0] || null;
}

async function productByCode(host, code) {
  const data = await jsonGet(
    `https://${host}/api/v2/product/${code}.json?fields=product_name,brands,image_front_url,image_url`,
  );
  const p = data?.product;
  const img = p?.image_front_url || p?.image_url || '';
  if (!img.startsWith('http')) return null;
  return { img, p, source: host };
}

async function searchV2Brand(host, brand, query) {
  const url =
    `https://${host}/api/v2/search?` +
    new URLSearchParams({
      brands_tags: brand,
      fields: 'code,product_name,brands,image_front_url,image_url',
      page_size: '24',
    });
  const data = await jsonGet(url);
  return pickOffImage(data?.products, query);
}

async function searchCatalog(host, query) {
  const url =
    `https://${host}/api/v2/search?` +
    new URLSearchParams({
      search_terms: query,
      fields: 'code,product_name,brands,image_front_url,image_url',
      page_size: '12',
    });
  const data = await jsonGet(url);
  return pickOffImage(data?.products, query);
}

async function commonsFile(file) {
  const url =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      format: 'json',
      origin: '*',
      action: 'query',
      titles: `File:${file}`,
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '800',
    });
  const data = await jsonGet(url);
  const page = Object.values(data?.query?.pages || {})[0];
  const thumb = page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url;
  if (!thumb) return null;
  return { img: thumb, name: file, source: 'commons' };
}

async function wikiThumb(title) {
  const data = await jsonGet(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  const img = data?.originalimage?.source || data?.thumbnail?.source || '';
  if (!img.startsWith('http')) return null;
  return { img, name: data.title, source: 'wikipedia' };
}

async function searchCommons(query) {
  const url =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      format: 'json',
      origin: '*',
      action: 'query',
      generator: 'search',
      gsrsearch: `${query} filetype:bitmap`,
      gsrnamespace: '6',
      gsrlimit: '8',
      prop: 'imageinfo',
      iiprop: 'url|mime|size',
      iiurlwidth: '600',
    });
  const data = await jsonGet(url);
  const pages = Object.values(data?.query?.pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !ii.thumburl) continue;
    if (ii.mime && !String(ii.mime).startsWith('image/')) continue;
    return { img: ii.thumburl, name: p.title, source: 'commons' };
  }
  return null;
}

async function findPackPhoto(m) {
  const query = SEARCH[m.photo] || m.name.replace(/\(.*?\)/g, '').trim();
  const hosts =
    m.category === 'cigarettes'
      ? ['world.openproductsfacts.org', 'world.openfoodfacts.org']
      : ['world.openfoodfacts.org', 'world.openproductsfacts.org'];

  if (PHOTO_URLS[m.photo]) {
    return { url: PHOTO_URLS[m.photo], name: query, source: 'openfoodfacts', query };
  }

  if (BARCODES[m.photo]) {
    const hit = await productByCode(hosts[0], BARCODES[m.photo]);
    if (hit) return { url: hit.img, name: hit.p.product_name, source: hit.source, query };
  }

  if (COMMONS_FILE[m.photo]) {
    const hit = await commonsFile(COMMONS_FILE[m.photo]);
    if (hit) return { url: hit.img, name: hit.name, source: 'commons', query };
  }

  if (WIKI_PAGE[m.photo]) {
    const hit = await wikiThumb(WIKI_PAGE[m.photo]);
    if (hit) return { url: hit.img, name: hit.name, source: 'wikipedia', query };
  }

  if (BRAND_TAG[m.photo]) {
    const hit = await searchV2Brand(hosts[0], BRAND_TAG[m.photo], query);
    if (hit) return { url: hit.img, name: hit.p.product_name, source: hosts[0], query };
    await sleep(200);
  }

  for (const host of hosts) {
    const hit = await searchCatalog(host, query);
    if (hit) return { url: hit.img, name: hit.p.product_name, source: host, query };
    await sleep(250);
  }
  const wiki = await searchCommons(query);
  if (wiki) return { url: wiki.img, name: wiki.name, source: 'commons', query };
  return null;
}

async function downloadPhotos() {
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.mkdirSync(path.dirname(CREDITS), { recursive: true });
  const credits = fs.existsSync(CREDITS) ? JSON.parse(fs.readFileSync(CREDITS, 'utf8')) : {};
  const seen = new Set();
  let ok = 0;
  let miss = 0;
  for (const m of MENU) {
    if (seen.has(m.photo)) continue;
    seen.add(m.photo);
    if (rasterPath(m.photo)) {
      ok += 1;
      continue;
    }
    const reuse = REUSE[m.photo];
    const src = reuse ? path.join(UPLOADS, reuse) : '';
    if (src && fs.existsSync(src) && !src.endsWith('.svg')) {
      fs.copyFileSync(src, path.join(UPLOADS, `andi-${m.photo}${path.extname(src)}`));
      dropSvg(m.photo);
      credits[m.photo] = { reused: reuse };
      ok += 1;
      continue;
    }
    process.stdout.write(`photo ${m.photo} … `);
    const found = await findPackPhoto(m);
    if (found && (await saveUrl(found.url, path.join(UPLOADS, `andi-${m.photo}.jpg`)))) {
      dropSvg(m.photo);
      credits[m.photo] = { source: found.source, name: found.name, query: found.query, url: found.url };
      console.log(found.source);
      ok += 1;
    } else {
      console.log('none');
      miss += 1;
    }
    await sleep(350);
  }
  let copied = true;
  while (copied) {
    copied = false;
    for (const [need, from] of Object.entries(SHARE)) {
      if (rasterPath(need) || !rasterPath(from)) continue;
      const src = rasterPath(from);
      fs.copyFileSync(src, path.join(UPLOADS, `andi-${need}${path.extname(src)}`));
      dropSvg(need);
      credits[need] = { sharedFrom: from };
      ok += 1;
      miss = Math.max(0, miss - 1);
      copied = true;
    }
  }
  fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2));
  console.log(`photos: ${ok} raster, ${miss} still missing`);
}

function writeFallbackSvgs() {
  fs.mkdirSync(UPLOADS, { recursive: true });
  for (const m of MENU) {
    if (rasterPath(m.photo)) continue;
    const reuse = REUSE[m.photo];
    const src = reuse ? path.join(UPLOADS, reuse) : '';
    if (src && fs.existsSync(src) && !src.endsWith('.svg')) {
      fs.copyFileSync(src, path.join(UPLOADS, `andi-${m.photo}${path.extname(src)}`));
      continue;
    }
    const brand = m.name.split(/[\s(]/)[0];
    const variant = m.name.replace(brand, '').replace(/^\s+/, '') || m.section;
    fs.writeFileSync(path.join(UPLOADS, `andi-${m.photo}.svg`), shelfSvg({ brand, variant: variant.slice(0, 42), accent: m.accent }));
  }
}

function importMenu() {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA busy_timeout = 8000; PRAGMA foreign_keys = ON;');
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO partners (slug, name, tagline, logo_url, phone, hours, active, sort, created_at, kind)
       VALUES (?, ?, ?, ?, ?, ?, 1, 2, ?, 'market')
       ON CONFLICT(slug) DO UPDATE SET name=excluded.name, tagline=excluded.tagline, logo_url=excluded.logo_url,
         phone=excluded.phone, hours=excluded.hours, active=1, kind='market'`,
    ).run(PARTNER.slug, PARTNER.name, PARTNER.tagline, PARTNER.logo, PARTNER.phone, PARTNER.hours, now);

    const names = new Set(MENU.map((m) => m.name));
    const ordered = db.prepare('SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1');
    for (const row of db.prepare('SELECT id, name FROM products WHERE partner = ?').all(PARTNER.slug)) {
      if (names.has(row.name)) continue;
      if (ordered.get(row.id)) db.prepare('UPDATE products SET available = 0 WHERE id = ?').run(row.id);
      else db.prepare('DELETE FROM products WHERE id = ?').run(row.id);
    }

    const sortBase = 7000;
    const find = db.prepare('SELECT id FROM products WHERE partner = ? AND name = ?');
    const update = db.prepare(
      `UPDATE products SET description=?, category=?, price_cents=?, cost_cents=?, image_url=?, accent=?, available=1,
         popular=?, sort=?, section=?, updated_at=? WHERE id=?`,
    );
    const insert = db.prepare(
      `INSERT INTO products (name, description, category, price_cents, cost_cents, image_url, accent, available, popular, sort,
         partner, section, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    );
    MENU.forEach((m, i) => {
      const cents = Math.round(m.price * 100);
      const photo = imageFor(m.photo);
      const popular = m.popular ? 1 : 0;
      const existing = find.get(PARTNER.slug, m.name);
      if (existing) update.run(m.description, m.category, cents, cents, photo, m.accent, popular, sortBase + i, m.section, now, existing.id);
      else insert.run(m.name, m.description, m.category, cents, cents, photo, m.accent, popular, sortBase + i, PARTNER.slug, m.section, now, now);
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  const n = db.prepare('SELECT COUNT(*) AS n FROM products WHERE partner = ? AND available = 1').get(PARTNER.slug).n;
  const openPrice = db.prepare('SELECT COUNT(*) AS n FROM products WHERE partner = ? AND price_cents = 0').get(PARTNER.slug).n;
  const noPhoto = db.prepare("SELECT COUNT(*) AS n FROM products WHERE partner = ? AND image_url = ''").get(PARTNER.slug).n;
  console.log(`${PARTNER.name}: ${n} products, ${openPrice} at €0.00 for Andi to set, ${noPhoto} without photo`);
  db.close();
}

await downloadPhotos();
writeFallbackSvgs();
if (!PHOTOS_ONLY) {
  await import('../server/db.js');
  importMenu();
}
