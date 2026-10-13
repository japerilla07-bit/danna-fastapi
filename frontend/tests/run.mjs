// Ejecutor de pruebas de la bitácora: sin dependencias nuevas (esbuild ya está en el proyecto + node:test de Node ≥ 18).
// Uso (desde la carpeta frontend):  node tests/run.mjs
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const raiz = path.resolve('tests');
const buscar = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? buscar(p) : p.endsWith('.test.ts') ? [p] : []; });
const entradas = buscar(raiz);
if (!entradas.length) { console.error('No hay pruebas en tests/'); process.exit(1); }
const out = mkdtempSync(path.join(tmpdir(), 'danna-tests-'));
const archivos = [];
for (const e of entradas) {
  const o = path.join(out, path.basename(e).replace(/\.ts$/, '.mjs'));
  await build({ entryPoints: [e], outfile: o, bundle: true, platform: 'node', format: 'esm', logLevel: 'error', tsconfig: 'tsconfig.json' });
  archivos.push(o);
}
const r = spawnSync(process.execPath, ['--test', ...archivos], { stdio: 'inherit' });
process.exit(r.status ?? 1);
