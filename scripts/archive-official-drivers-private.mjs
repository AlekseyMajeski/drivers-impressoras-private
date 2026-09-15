import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = process.cwd();
const SITE = path.resolve(process.argv[2] || '../tutoriais');
const BASE = path.join(SITE, 'impressoras-termicas');
const DEFAULT_ARCHIVE = path.resolve(ROOT, '..', 'guia-impressoras-private-drivers');
const ARCHIVE = path.resolve(process.env.DRIVER_ARCHIVE_DIR || DEFAULT_ARCHIVE);
const FILES_DIR = path.join(ARCHIVE, 'files');
const TMP_DIR = path.join(ARCHIVE, '.tmp');
const CATALOG_PATH = path.join(ARCHIVE, 'catalog.json');
const CONCURRENCY = Number(process.env.DRIVER_ARCHIVE_CONCURRENCY || 3);
const UA = 'Guia-de-Impressoras-Private-Archive/2.0';

const officialHosts = {
  bematech: ['bematech.com.br', 'elgin.com.br'],
  c3tech: ['c3technology.com.br', 'c3tech.com.br'],
  controlid: ['controlid.com.br'],
  daruma: ['daruma.com.br'],
  dimep: ['dimep.com.br'],
  elgin: ['elgin.com.br'],
  epson: ['epson.com.br', 'epson.com', 'epson-biz.com', 'epson.net', 'epson.jp'],
  sweda: ['sweda.com.br'],
  tanca: ['tanca.com.br'],
  waytec: ['waytec.com.br'],
};

const directFile = /\.(?:exe|msi|zip|7z|rar|dmg|pkg|deb|rpm|run|tar\.gz)(?:[?#].*)?$/i;
const candidateText = /\b(?:driver|drivers|download|baixar|software|spooler|instalador|installer|utility|utilitário|utilitario|apd|vcom|com virtual|firmware|setup)\b/i;

function stripTags(s) { return s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } }
function isOfficial(brand, url) {
  const host = hostOf(url);
  if ((officialHosts[brand] || []).some(d => host === d || host.endsWith(`.${d}`))) return true;
  if (['elgin', 'bematech'].includes(brand)) {
    try {
      const u = new URL(url);
      const p = decodeURIComponent(u.pathname).toLowerCase();
      return ['raw.githubusercontent.com', 'github.com'].includes(u.hostname.toLowerCase()) && p.startsWith('/elgindevelopercommunity/');
    } catch {}
  }
  return false;
}
function collect() {
  if (!fs.existsSync(BASE)) throw new Error(`Diretório do site não encontrado: ${BASE}`);
  const map = new Map();
  for (const brand of fs.readdirSync(BASE, { withFileTypes: true })) {
    if (!brand.isDirectory()) continue;
    const brandDir = path.join(BASE, brand.name);
    for (const model of fs.readdirSync(brandDir, { withFileTypes: true })) {
      if (!model.isDirectory()) continue;
      const file = path.join(brandDir, model.name, 'index.html');
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, 'utf8');
      const title = stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || model.name);
      const anchors = [...html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)]
        .map(m => ({ url: m[2], text: stripTags(m[4]) }))
        .filter(x => /^https?:\/\//i.test(x.url) && directFile.test(x.url) && candidateText.test(`${x.text} ${x.url}`) && isOfficial(brand.name, x.url));
      for (const a of anchors) {
        if (!map.has(a.url)) map.set(a.url, { url: a.url, usedBy: [] });
        map.get(a.url).usedBy.push({ brand: brand.name, model: model.name, title, text: a.text });
      }
    }
  }
  return [...map.values()];
}
function safeFilename(url) {
  let name = 'driver.bin';
  try { name = path.basename(decodeURIComponent(new URL(url).pathname)) || name; } catch {}
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim() || 'driver.bin';
}
function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) return { schemaVersion: 1, archiveRoot: ARCHIVE, entries: [] };
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}
async function download(item) {
  const collectedAt = new Date().toISOString();
  const response = await fetch(item.url, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
  const tmp = path.join(TMP_DIR, `${crypto.randomUUID()}.part`);
  const hash = crypto.createHash('sha256');
  let size = 0;
  const meter = new Transform({ transform(chunk, _enc, cb) { hash.update(chunk); size += chunk.length; cb(null, chunk); } });
  try {
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(tmp));
    const sha256 = hash.digest('hex');
    const originalName = safeFilename(item.url);
    const storedName = `${sha256}--${originalName}`;
    const finalPath = path.join(FILES_DIR, storedName);
    if (fs.existsSync(finalPath)) fs.unlinkSync(tmp); else fs.renameSync(tmp, finalPath);
    return { sourceUrl: item.url, finalUrl: response.url, originalName, sha256, size, collectedAt, relativePath: path.relative(ARCHIVE, finalPath).replaceAll(path.sep, '/'), usedBy: item.usedBy };
  } catch (err) { try { fs.unlinkSync(tmp); } catch {} throw err; }
}
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let cursor = 0;
  async function worker() { while (true) { const i = cursor++; if (i >= items.length) return; try { out[i] = { ok: true, value: await fn(items[i]) }; } catch (err) { out[i] = { ok: false, item: items[i], error: String(err?.message || err) }; } } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const items = collect();
console.log(`Fonte pública: ${SITE}`);
console.log(`Arquivo privado local: ${ARCHIVE}`);
console.log(`Encontrados ${items.length} arquivos oficiais diretos para preservação.`);
const previous = loadCatalog();
const results = await mapLimit(items, CONCURRENCY, download);
const now = new Date().toISOString();
const entries = Array.isArray(previous.entries) ? previous.entries : [];
for (const r of results) {
  if (!r.ok) { console.error(`FALHA ${r.item.url}: ${r.error}`); continue; }
  const v = r.value;
  const same = entries.find(e => e.sourceUrl === v.sourceUrl && e.sha256 === v.sha256);
  if (same) { same.lastVerifiedAt = now; same.finalUrl = v.finalUrl; same.usedBy = v.usedBy; }
  else entries.push({ ...v, firstCollectedAt: v.collectedAt, lastVerifiedAt: now });
  console.log(`OK ${v.sha256.slice(0,12)} ${v.size} ${v.originalName}`);
}
const catalog = {
  schemaVersion: 2,
  archiveRoot: ARCHIVE,
  generatedAt: now,
  sourceRepository: 'AlekseyMajeski/tutoriais',
  entries: entries.sort((a,b) => (a.sourceUrl || '').localeCompare(b.sourceUrl || '') || (a.firstCollectedAt || '').localeCompare(b.firstCollectedAt || '')),
  failures: results.filter(r => !r.ok).map(r => ({ sourceUrl: r.item.url, error: r.error, usedBy: r.item.usedBy, checkedAt: now }))
};
fs.mkdirSync(ARCHIVE, { recursive: true });
fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n');
console.log(`Catálogo salvo em ${CATALOG_PATH}`);
console.log(`${results.filter(r => r.ok).length}/${results.length} arquivos verificados nesta execução.`);
if (catalog.failures.length) process.exitCode = 2;
