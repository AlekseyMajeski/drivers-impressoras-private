import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SITE = path.resolve(process.argv[2] || 'public-site');
const BASE = path.join(SITE, 'impressoras-termicas');
const TMP = path.resolve('.archive-tmp');
const CATALOG_DIR = path.resolve('catalog');
const CATALOG_JSON = path.join(CATALOG_DIR, 'latest.json');
const CATALOG_MD = path.join(CATALOG_DIR, 'latest.md');
const RELEASE_TAG = 'private-driver-archive';
const REPO = process.env.GITHUB_REPOSITORY || 'AlekseyMajeski/drivers-impressoras-private';
const UA = 'Guia-de-Impressoras-Private-Archive/1.0';
const directFile = /\.(?:exe|msi|zip|7z|rar|dmg|pkg|deb|rpm|run|tar\.gz)(?:[?#].*)?$/i;
const candidateText = /\b(?:driver|drivers|download|baixar|software|spooler|instalador|installer|utility|utilitário|utilitario|apd|vcom|com virtual|firmware|setup)\b/i;

const officialHosts = {
  bematech: ['bematech.com.br', 'elgin.com.br'], c3tech: ['c3technology.com.br', 'c3tech.com.br'],
  controlid: ['controlid.com.br'], daruma: ['daruma.com.br'], dimep: ['dimep.com.br'],
  elgin: ['elgin.com.br'], epson: ['epson.com.br', 'epson.com', 'epson.net', 'epson.jp'],
  sweda: ['sweda.com.br'], tanca: ['tanca.com.br'], waytec: ['waytec.com.br'],
};

function stripTags(s) { return s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function slug(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'item'; }
function basenameFromUrl(url) {
  try { return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'driver.bin'); }
  catch { return 'driver.bin'; }
}
function splitExt(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.tar.gz')) return [name.slice(0, -7), '.tar.gz'];
  const ext = path.extname(name);
  return [name.slice(0, -ext.length || undefined), ext || '.bin'];
}
function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } }
function sourceKind(brand, url) {
  const host = hostOf(url);
  try {
    const u = new URL(url); const p = decodeURIComponent(u.pathname).toLowerCase();
    if (['elgin','bematech'].includes(brand) && ['raw.githubusercontent.com','github.com'].includes(host) && p.startsWith('/elgindevelopercommunity/')) return 'official-developer-repository';
  } catch {}
  if ((officialHosts[brand] || []).some(d => host === d || host.endsWith(`.${d}`))) return 'official-manufacturer';
  if (host === 'catalog.update.microsoft.com' || host.endsWith('.catalog.update.microsoft.com')) return 'trusted-distribution';
  return 'third-party-or-community';
}
function modelFiles() {
  if (!fs.existsSync(BASE)) throw new Error(`Diretório não encontrado: ${BASE}`);
  return fs.readdirSync(BASE, { withFileTypes: true }).flatMap(brand => {
    if (!brand.isDirectory()) return [];
    return fs.readdirSync(path.join(BASE, brand.name), { withFileTypes: true }).flatMap(model => {
      if (!model.isDirectory()) return [];
      const file = path.join(BASE, brand.name, model.name, 'index.html');
      return fs.existsSync(file) ? [{ file, brand: brand.name, model: model.name }] : [];
    });
  });
}
function collectSources() {
  const map = new Map();
  for (const { file, brand, model } of modelFiles()) {
    const html = fs.readFileSync(file, 'utf8');
    const title = stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || model);
    const anchors = [...html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)]
      .map(m => ({ href: m[2], text: stripTags(m[4]) }))
      .filter(a => /^https?:\/\//i.test(a.href) && directFile.test(a.href) && candidateText.test(`${a.text} ${a.href}`));
    for (const a of anchors) {
      if (!map.has(a.href)) map.set(a.href, { url: a.href, brand, model, title, text: a.text, usedBy: [], sourceKind: sourceKind(brand, a.href) });
      map.get(a.href).usedBy.push({ brand, model, title, text: a.text });
    }
  }
  return [...map.values()].sort((a,b) => a.url.localeCompare(b.url));
}
function loadPrevious() {
  if (!fs.existsSync(CATALOG_JSON)) return { entries: [] };
  try { return JSON.parse(fs.readFileSync(CATALOG_JSON, 'utf8')); } catch { return { entries: [] }; }
}
function ensureRelease() {
  try { execFileSync('gh', ['release','view',RELEASE_TAG,'--repo',REPO], { stdio: 'ignore' }); }
  catch {
    execFileSync('gh', ['release','create',RELEASE_TAG,'--repo',REPO,'--title','Acervo privado de drivers','--notes','Cópias privadas preservadas a partir das fontes usadas pelo Guia de Impressoras. Assets são versionados por SHA-256 e não substituem a fonte oficial no site público.','--prerelease'], { stdio: 'inherit' });
  }
}
function existingAssets() {
  const out = execFileSync('gh', ['release','view',RELEASE_TAG,'--repo',REPO,'--json','assets','--jq','.assets[].name'], { encoding: 'utf8' });
  return new Set(out.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
}
function assetNameFor(item, originalName, sha) {
  const [stem, ext] = splitExt(originalName);
  const name = `${slug(item.brand)}--${slug(item.model)}--${slug(stem).slice(0,80)}--${sha.slice(0,12)}${ext.toLowerCase()}`;
  return name.slice(0, 240);
}
async function fetchWithRetry(url, previous) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
      const headers = { 'user-agent': UA, accept: '*/*' };
      if (previous?.etag) headers['if-none-match'] = previous.etag;
      if (previous?.lastModified) headers['if-modified-since'] = previous.lastModified;
      const res = await fetch(url, { headers, redirect: 'follow', signal: ctrl.signal });
      if (res.status === 304 && previous?.sha256) return { unchanged: true, status: 304, etag: previous.etag || null, lastModified: previous.lastModified || null };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      return {
        unchanged: false,
        status: res.status,
        bytes: Buffer.from(ab),
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        contentType: res.headers.get('content-type'),
      };
    } catch (err) {
      lastError = err?.name === 'AbortError' ? 'timeout' : String(err?.message || err);
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1500));
    } finally { clearTimeout(timer); }
  }
  throw new Error(lastError || 'falha desconhecida');
}

fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(CATALOG_DIR, { recursive: true });
const sources = collectSources();
const previousCatalog = loadPrevious();
const previousByUrl = new Map((previousCatalog.entries || []).map(e => [e.url, e]));
const knownBySha = new Map((previousCatalog.entries || []).filter(e => e.sha256 && e.assetName).map(e => [e.sha256, e.assetName]));
const runSeenBySha = new Map();
const pendingUploads = [];
const entries = [];
const now = new Date().toISOString();
console.log(`Fontes diretas encontradas: ${sources.length}`);

for (const [index, item] of sources.entries()) {
  const prev = previousByUrl.get(item.url);
  process.stdout.write(`[${index + 1}/${sources.length}] ${item.brand}/${item.model} ... `);
  try {
    const got = await fetchWithRetry(item.url, prev);
    if (got.unchanged) {
      entries.push({ ...prev, usedBy: item.usedBy, sourceKind: item.sourceKind, lastCheckedAt: now, lastHttpStatus: 304, lastError: null, status: 'preserved' });
      console.log('304 sem alteração');
      continue;
    }
    const sha256 = crypto.createHash('sha256').update(got.bytes).digest('hex');
    const originalName = basenameFromUrl(item.url);
    let assetName = knownBySha.get(sha256) || runSeenBySha.get(sha256);
    if (!assetName) {
      assetName = assetNameFor(item, originalName, sha256);
      const local = path.join(TMP, assetName);
      fs.writeFileSync(local, got.bytes);
      pendingUploads.push({ local, assetName, sha256 });
      runSeenBySha.set(sha256, assetName);
    }
    entries.push({
      url: item.url, sourceKind: item.sourceKind, usedBy: item.usedBy, originalName,
      assetName, sha256, size: got.bytes.length, etag: got.etag || null,
      lastModified: got.lastModified || null, contentType: got.contentType || null,
      firstSeenAt: prev?.firstSeenAt || now, firstArchivedAt: prev?.firstArchivedAt || now,
      lastCheckedAt: now, lastHttpStatus: got.status, lastError: null, status: 'preserved', releaseTag: RELEASE_TAG,
    });
    console.log(`${got.bytes.length} bytes ${sha256.slice(0,12)}`);
  } catch (err) {
    entries.push({
      ...(prev || {}), url: item.url, sourceKind: item.sourceKind, usedBy: item.usedBy,
      firstSeenAt: prev?.firstSeenAt || now, lastCheckedAt: now, lastError: String(err?.message || err),
      status: prev?.sha256 ? 'preserved-source-currently-unreachable' : 'not-yet-preserved',
    });
    console.log(`FALHA ${String(err?.message || err)}`);
  }
}

ensureRelease();
const assets = existingAssets();
let uploaded = 0;
for (const item of pendingUploads) {
  if (assets.has(item.assetName)) continue;
  execFileSync('gh', ['release','upload',RELEASE_TAG,item.local,'--repo',REPO], { stdio: 'inherit' });
  assets.add(item.assetName); uploaded++;
}

const summary = {
  schemaVersion: 1,
  generatedAt: now,
  sourceRepository: 'AlekseyMajeski/tutoriais',
  privateRepository: REPO,
  releaseTag: RELEASE_TAG,
  totals: {
    sourceUrls: sources.length,
    preserved: entries.filter(e => e.sha256).length,
    notYetPreserved: entries.filter(e => !e.sha256).length,
    newAssetsUploaded: uploaded,
    uniqueKnownAssets: new Set(entries.filter(e => e.assetName).map(e => e.assetName)).size,
  },
  entries,
};
fs.writeFileSync(CATALOG_JSON, JSON.stringify(summary, null, 2) + '\n');
const md = [
  '# Catálogo privado de drivers', '',
  `Gerado em: ${now}`, '',
  `- URLs diretas encontradas no site: ${summary.totals.sourceUrls}`,
  `- URLs com cópia preservada: ${summary.totals.preserved}`,
  `- Ainda não preservadas: ${summary.totals.notYetPreserved}`,
  `- Novos assets nesta execução: ${summary.totals.newAssetsUploaded}`,
  `- Assets únicos referenciados: ${summary.totals.uniqueKnownAssets}`, '',
  '## Pendências', '',
  ...entries.filter(e => !e.sha256 || e.status !== 'preserved').map(e => `- ${e.status} — ${e.url}${e.lastError ? ` — ${e.lastError}` : ''}`),
  '', '## Assets preservados', '',
  ...entries.filter(e => e.sha256).map(e => `- \`${e.assetName}\` — ${e.sha256} — ${e.url}`), ''
];
fs.writeFileSync(CATALOG_MD, md.join('\n'));
console.log(`Concluído: ${uploaded} novo(s) asset(s); ${summary.totals.preserved}/${summary.totals.sourceUrls} URLs preservadas.`);
