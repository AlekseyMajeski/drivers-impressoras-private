import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';

const manifestPath = path.resolve('drivers/archive-manifest.json');
const outDir = path.resolve('drivers/audit');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
await fs.mkdir(outDir, { recursive: true });
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'driver-preservation-'));

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fsSync.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function licenseSignal(text) {
  const t = text.toLowerCase();
  const prohibited = ['may not redistribute','must not redistribute','redistribution is prohibited','redistribuição é proibida','não poderá redistribuir','não pode redistribuir'].some(s => t.includes(s));
  const allowed = ['redistribution is permitted','redistribution permitted','may redistribute','permission to redistribute','redistribuição permitida','pode redistribuir'].some(s => t.includes(s));
  if (prohibited) return 'prohibited-signal';
  if (allowed) return 'allowed-signal';
  return 'no-explicit-signal';
}

function scanArchive(file, ext) {
  const evidence = [];
  if (ext === '.zip') {
    const list = spawnSync('unzip', ['-Z1', file], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    if (list.status === 0) {
      const names = list.stdout.split(/\r?\n/).filter(Boolean);
      const likely = names.filter(n => /(^|\/)(license|licen[cs]a|eula|copying|copyright|readme|termo|termos)([^/]*)$/i.test(n)).slice(0, 20);
      for (const name of likely) {
        const res = spawnSync('unzip', ['-p', file, name], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
        if (res.status === 0 && res.stdout) {
          const text = res.stdout.slice(0, 120000);
          evidence.push({ source: name, signal: licenseSignal(text), excerpt: text.replace(/\s+/g, ' ').slice(0, 1000) });
        }
      }
    }
  }
  const strings = spawnSync('strings', ['-n', '8', file], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (strings.status === 0 && strings.stdout) {
    const lines = strings.stdout.split(/\r?\n/).filter(line => /(redistrib|distribution|license|licen[cs]a|copyright|eula)/i.test(line));
    if (lines.length) {
      const text = lines.slice(0, 80).join(' ');
      evidence.push({ source: 'binary-strings', signal: licenseSignal(text), excerpt: text.slice(0, 1000) });
    }
  }
  return evidence;
}

const results = [];
for (const item of [...manifest.candidates].sort((a, b) => a.priority - b.priority)) {
  const ext = path.extname(new URL(item.sourceUrl).pathname).toLowerCase() || '.bin';
  const filename = `${String(item.priority).padStart(2, '0')}-${item.id}${ext}`;
  const target = path.join(workDir, filename);
  const started = Date.now();
  try {
    const response = await fetch(item.sourceUrl, {
      redirect: 'follow',
      headers: { 'user-agent': 'Guia-de-Impressoras-driver-preservation-audit/2.0' },
      signal: AbortSignal.timeout(120000)
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), fsSync.createWriteStream(target));
    const stat = await fs.stat(target);
    const digest = await sha256(target);
    const evidence = scanArchive(target, ext);
    const signals = new Set(evidence.map(e => e.signal));
    let detectedRedistribution = 'unknown';
    if (signals.has('prohibited-signal')) detectedRedistribution = 'prohibited';
    else if (signals.has('allowed-signal')) detectedRedistribution = 'possible-allowed-needs-review';
    results.push({ ...item, audit: { ok: true, finalUrl: response.url, bytes: stat.size, sha256: digest, elapsedMs: Date.now() - started, detectedRedistribution, evidence } });
    console.log(`OK ${item.id} ${stat.size} bytes ${digest}`);
  } catch (error) {
    results.push({ ...item, audit: { ok: false, error: String(error), elapsedMs: Date.now() - started } });
    console.error(`FAIL ${item.id}: ${error}`);
  }
}

const generatedAt = new Date().toISOString();
const report = {
  schemaVersion: 2,
  generatedAt,
  rule: manifest.policy.publicMirror,
  results
};
await fs.writeFile(path.join(outDir, 'latest.json'), JSON.stringify(report, null, 2) + '\n');

const lines = [
  '# Auditoria de preservação de drivers', '',
  `Gerada em: ${generatedAt}`, '',
  '> Esta auditoria verifica origem, tamanho, SHA-256 e sinais de licença encontrados no pacote. Ausência de proibição não significa permissão de redistribuição.', '',
  '| Prioridade | Modelo | Fonte | Download | Tamanho | SHA-256 | Redistribuição detectada |',
  '|---:|---|---|---|---:|---|---|'
];
for (const r of results) {
  const a = r.audit;
  lines.push(`| ${r.priority} | ${r.manufacturer} ${r.model} | ${r.sourceKind} | ${a.ok ? 'OK' : 'FALHOU'} | ${a.ok ? a.bytes : '-'} | ${a.ok ? `\`${a.sha256}\`` : '-'} | ${a.ok ? a.detectedRedistribution : '-'} |`);
  if (a.ok && a.evidence?.length) {
    lines.push('', `### ${r.manufacturer} ${r.model}`, '');
    for (const e of a.evidence) lines.push(`- **${e.source}** — ${e.signal}: ${e.excerpt.replace(/\|/g, '\\|')}`);
  }
}
lines.push('', '## Regra de publicação', '', manifest.policy.publicMirror);
await fs.writeFile(path.join(outDir, 'latest.md'), lines.join('\n') + '\n');
