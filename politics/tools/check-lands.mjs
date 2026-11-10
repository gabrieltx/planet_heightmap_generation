// The fork's check of politics/lands.js (FORK.md S1): Generate's worlds built headless (its worker, as the page runs
// it), their continents and oceans found, and what must hold checked: every land cell has a continent, the sizes add up,
// and the same world is divided the same way at two Details (scale invariance).
//
//   node politics/tools/check-lands.mjs                 the checks, PASS/FAIL, exit code
//   node politics/tools/check-lands.mjs --png out/dir   plus each world's Political map as a PNG (to look at)
//   node politics/tools/check-lands.mjs --verbose       plus each world's continents and seas
//
// Needs `npm install delaunator pngjs` (as upstream's checks: v2/README.md).

import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { findLands, latLonOf, LANDS } from '../lands.js';
import { meshFromArrays } from '../../v2/js/core/sim-mesh.js';

// (the worker imports Delaunator from its CDN address, as in the browser: here, the installed package)
register('data:text/javascript,' + encodeURIComponent(
    `export async function resolve(s, c, n) { return n(s.startsWith('https://cdn.jsdelivr.net/npm/delaunator') ? 'delaunator' : s, c); }`), import.meta.url);

const VERBOSE = process.argv.includes('--verbose'), pngAt = process.argv.indexOf('--png'), PNG_DIR = pngAt > 0 ? process.argv[pngAt + 1] : null;
let failures = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  —  ${detail}` : ''}`); };

// ── Generate's worker, run in this thread ──
let last = null;
globalThis.self = { postMessage: (m) => { if (m.type === 'done' || m.type === 'error') last = m; } };
await import('../../js/planet-worker.js');
const DEFAULTS = { P: 80, jitter: 0.75, nMag: 0.40, numContinents: 4, terrainWarp: 0.75, smoothing: 0.10, glacialErosion: 0.50, hydraulicErosion: 0.50,
    thermalErosion: 0.10, ridgeSharpening: 0.50, continentSizeVariety: 0.35, landCoverage: 0.3, greenhouse: 0, precipitationOffset: 0 };
async function world(seed, N, sliders = {}) {
    last = null;
    const quiet = console.log; console.log = () => {};
    self.onmessage({ data: { cmd: 'generate', ...DEFAULTS, ...sliders, N, seed, toggledIndices: [], next: true, shared: true } });
    while (!last) await new Promise(r => setTimeout(r, 5));
    console.log = quiet;
    if (last.type === 'error') throw new Error(last.message);
    return { mesh: meshFromArrays(last.shared.mesh), heightKm: last.shared.heightKm };
}

const M = (km2) => `${(km2 / 1e6).toFixed(1)} M km²`;
const CAT = [[208, 143, 52], [49, 180, 172], [139, 61, 44], [136, 150, 239], [114, 132, 49], [123, 53, 139], [5, 120, 164], [198, 97, 120]];   // (tokens.css cat-1 … cat-8)
async function png(file, mesh, F) {
    const { PNG } = await import('pngjs');
    const W = 1024, H = 512, img = new PNG({ width: W, height: H });
    const seaShade = (id) => (id < 0 ? [60, 60, 70] : [14 + (id * 13) % 40, 30 + (id * 29) % 60, 70 + (id * 47) % 130]);   // (to tell the seas apart here; the page draws lines)
    for (let y = 0; y < H; y++) {
        const lat = Math.PI / 2 - (y + 0.5) / H * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let x = 0; x < W; x++) {
            const lon = (x + 0.5) / W * 2 * Math.PI - Math.PI, c = mesh.index.nearest(cl * Math.cos(lon), cl * Math.sin(lon), sl), p = 4 * (y * W + x);
            let rgb = F.land[c] ? (F.continentOf[c] >= 0 ? CAT[F.continentOf[c]] : [200, 200, 200]) : seaShade(F.seaOf[c]);
            if (F.land[c] && !F.mainland[c]) rgb = rgb.map(v => Math.round(v * 0.6 + 100));
            img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = 255;
        }
    }
    const mark = (c, rgb) => { const [la, lo] = latLonOf(mesh, c), px = Math.round((lo + 180) / 360 * W), py = Math.round((90 - la) / 180 * H);
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const q = 4 * (Math.min(H - 1, Math.max(0, py + dy)) * W + ((px + dx + W) % W)); img.data[q] = rgb[0]; img.data[q + 1] = rgb[1]; img.data[q + 2] = rgb[2]; } };
    for (const k of F.continents) mark(k.peak, [255, 255, 255]);
    for (const s of F.seas) mark(s.peak, s.kind === 'ocean' ? [255, 230, 120] : [150, 220, 255]);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, PNG.sync.write(img));
}

const WORLDS = [
    { name: 'seed 1', seed: 1 }, { name: 'seed 2', seed: 2 }, { name: 'seed 3', seed: 3 }, { name: 'seed 7', seed: 7 },
    { name: 'one continent', seed: 11, sliders: { numContinents: 1 } }, { name: 'ten continents', seed: 12, sliders: { numContinents: 10 } },
    { name: 'ocean world', seed: 13, sliders: { landCoverage: 0.1 } }, { name: 'land world', seed: 14, sliders: { landCoverage: 0.7 } },
];
const LO = 30000, HI = 120000;
for (const wd of WORLDS) {
    console.log(`\n── ${wd.name} ──`);
    const a = await world(wd.seed, LO, wd.sliders), t0 = performance.now(), A = findLands(a.mesh, a.heightKm), ms = performance.now() - t0;
    const b = await world(wd.seed, HI, wd.sliders), B = findLands(b.mesh, b.heightKm);
    if (VERBOSE) for (const [F, N] of [[A, LO], [B, HI]]) {
        console.log(`  at ${N}: land ${M(F.landKm2)}`);
        for (const k of F.continents) console.log(`    continent ${k.id + 1}: ${M(k.km2)} + islands ${M(k.islandsKm2)}, heart ${Math.round(k.depthKm)} km from the sea at ${latLonOf(F === A ? a.mesh : b.mesh, k.peak).map(v => v.toFixed(0)).join(', ')}`);
        for (const s of F.seas) console.log(`    ${s.kind} ${s.id + 1}: ${M(s.km2)}, ${Math.round(s.depthKm)} km from land`);
    }
    if (PNG_DIR) { await png(path.join(PNG_DIR, `${wd.name.replace(/ /g, '-')}-${LO}.png`), a.mesh, A); await png(path.join(PNG_DIR, `${wd.name.replace(/ /g, '-')}-${HI}.png`), b.mesh, B); }

    for (const [F, m, N] of [[A, a.mesh, LO], [B, b.mesh, HI]]) {
        let orphan = 0, seaWithContinent = 0, mainKm2 = 0;
        const cellKm2 = 4 * Math.PI * 6371 ** 2 / m.numCells;
        for (let c = 0; c < m.numCells; c++) { if (F.land[c] && F.continentOf[c] < 0) orphan++; if (!F.land[c] && F.continentOf[c] >= 0) seaWithContinent++; if (F.mainland[c]) mainKm2 += cellKm2; }
        check(`${wd.name} at ${N}: every land cell has a continent, no sea cell has`, orphan === 0 && seaWithContinent === 0, `${orphan} land without, ${seaWithContinent} sea with`);
        check(`${wd.name} at ${N}: 1 to ${LANDS.maxContinents} continents, biggest first`, F.continents.length >= 1 && F.continents.length <= LANDS.maxContinents && F.continents.every((k, i) => i === 0 || k.km2 <= F.continents[i - 1].km2), `${F.continents.length}`);
        const sum = F.continents.reduce((s, k) => s + k.km2, 0), all = F.continents.reduce((s, k) => s + k.km2 + k.islandsKm2, 0);
        check(`${wd.name} at ${N}: the continents' sizes add up to the land`, Math.abs(sum - mainKm2) < 1 && Math.abs(all - F.landKm2) < 1e-6 * F.landKm2 + 1, `${M(all)} of ${M(F.landKm2)}`);
        check(`${wd.name} at ${N}: at least one ocean or sea, each of a nameable size`, F.seas.length >= 1 && F.seas.every(s => s.km2 >= LANDS.sea.minKm2 * 0.999), `${F.seas.length}`);
        const named = F.seas.reduce((s, x) => s + x.km2, 0);
        check(`${wd.name} at ${N}: nearly all the sea is in a named body`, named > 0.97 * F.seaKm2, `${(100 * named / F.seaKm2).toFixed(1)} %`);
    }
    // scale invariance: the same bodies at both Details (a body right at a threshold may differ by one)
    check(`${wd.name}: as many continents at ${LO} as at ${HI}`, Math.abs(A.continents.length - B.continents.length) <= 1, `${A.continents.length} and ${B.continents.length}`);
    // (a world mostly land has many shut-in seas near the size that earns a name: their count is told, not checked)
    if (wd.sliders?.landCoverage > 0.5) console.log(`NOTE  ${wd.name}: ${A.seas.length} oceans and seas at ${LO}, ${B.seas.length} at ${HI}`);
    else check(`${wd.name}: as many oceans and seas at both`, Math.abs(A.seas.length - B.seas.length) <= 1, `${A.seas.length} and ${B.seas.length}`);
    const ka = A.continents[0], kb = B.continents[0];
    check(`${wd.name}: the biggest continent the same size at both (within 15 %)`, Math.abs(ka.km2 - kb.km2) < 0.15 * kb.km2, `${M(ka.km2)} and ${M(kb.km2)}`);
    check(`${wd.name}: found in under 1.5 s at ${LO}`, ms < 1500, `${ms.toFixed(0)} ms`);
}
console.log(`\n${failures === 0 ? `Lands: all ${total} checks passed.` : `Lands: ${failures} of ${total} checks FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
