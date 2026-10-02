// Bundle one src module with esbuild (as the build does) so the unit tests can import its exports in Node.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const SHIM = `export const defineExtension = (d) => d;
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) { if (v == null || v === false) continue; if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v); else el.setAttribute(k, v === true ? '' : String(v)); }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(typeof c === 'object' ? c : document.createTextNode(String(c)));
  return el;
}`;
const SDK = { name: 'sdk', setup(b) { b.onResolve({ filter: /^@muclient\/sdk$/ }, () => ({ path: 'sdk', namespace: 'sdk' })); b.onLoad({ filter: /.*/, namespace: 'sdk' }, () => ({ contents: SHIM, loader: 'js' })); } };
export async function load(rel) {
  const r = await build({ entryPoints: [join(ROOT, rel)], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent', plugins: [SDK] });
  const dir = join(ROOT, 'node_modules', '.cache', 'ext-activity-test');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${rel.replace(/\W+/g, '_')}-${process.pid}-${++n}.mjs`);
  writeFileSync(out, r.outputFiles[0].contents);
  return import(pathToFileURL(out).href);
}

/** A fake game for the store: records what was asked, answers when told. */
export function fakeIO() {
  const asked = [], sent = [];
  let changes = 0;
  const got = [];
  const io = {
    asked, sent, got,
    get changes() { return changes; },
    request(op, data) { return new Promise((ok, fail) => asked.push({ op, data, ok, fail })); },
    send: async (op, data) => { sent.push({ op, data }); return true; },
    changed() { changes++; },
    applied: (evs) => got.push(...evs),
    /** Answer the oldest open request for `op`. */
    answer(op, value) { const i = asked.findIndex((a) => a.op === op && !a.done); if (i < 0) throw new Error(`no ${op} asked`); asked[i].done = true; asked[i].ok(value); },
    reject(op, err) { const i = asked.findIndex((a) => a.op === op && !a.done); asked[i].done = true; asked[i].fail(new Error(err)); },
    open(op) { return asked.filter((a) => a.op === op && !a.done); },
  };
  return io;
}
export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** A DOM for the panel tests (happy-dom), installed as globals the way a browser has them. */
export async function dom() {
  const { Window } = await import('happy-dom');
  const w = new Window({ url: 'http://localhost/' });
  for (const k of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'WheelEvent', 'InputEvent']) globalThis[k] = k === 'window' ? w : w[k];
  return w;
}
