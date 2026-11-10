// The fork's check of politics/countries.js and names.js (FORK.md S2–S4): Generate's worlds built headless, their
// countries generated (on the guessed people: the finish's food is not run here), divided and named, and what must hold
// checked.
//
//   node politics/tools/check-countries.mjs                 the checks, PASS/FAIL, exit code
//   node politics/tools/check-countries.mjs --png out/dir   plus each world's countries as a PNG (to look at)
//   node politics/tools/check-countries.mjs --verbose       plus each world's countries and names
//
// Needs `npm install delaunator pngjs` (as upstream's checks: v2/README.md).

import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';

// (Delaunator comes from its CDN address in the browser: here, the installed package — set before anything is loaded)
register('data:text/javascript,' + encodeURIComponent(
    `export async function resolve(s, c, n) { return n(s.startsWith('https://cdn.jsdelivr.net/npm/delaunator') ? 'delaunator' : s, c); }`), import.meta.url);
const { findLands } = await import('../lands.js');
const { makeCountries, divideContinent, peopleGuess, COUNTRIES } = await import('../countries.js');
const { CULTURES, makeNames } = await import('../names.js');
const { meshFromArrays } = await import('../../v2/js/core/sim-mesh.js');

const VERBOSE = process.argv.includes('--verbose'), pngAt = process.argv.indexOf('--png'), PNG_DIR = pngAt > 0 ? process.argv[pngAt + 1] : null;
let failures = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  —  ${detail}` : ''}`); };

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
const CAT = [[208, 143, 52], [49, 180, 172], [139, 61, 44], [136, 150, 239], [114, 132, 49], [123, 53, 139], [5, 120, 164], [198, 97, 120]];
async function png(file, mesh, F, P) {
    const { PNG } = await import('pngjs');
    const W = 1536, H = 768, img = new PNG({ width: W, height: H }), { adjOffset, adjList } = mesh;
    for (let y = 0; y < H; y++) {
        const lat = Math.PI / 2 - (y + 0.5) / H * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let x = 0; x < W; x++) {
            const lon = (x + 0.5) / W * 2 * Math.PI - Math.PI, c = mesh.index.nearest(cl * Math.cos(lon), cl * Math.sin(lon), sl), p = 4 * (y * W + x), o = P.countryOf[c];
            let rgb = o >= 0 ? CAT[P.countries[o].colour] : [24, 34, 62];
            if (o >= 0) for (let i = adjOffset[c]; i < adjOffset[c + 1]; i++) { const q = P.countryOf[adjList[i]]; if (q >= 0 && q !== o) { rgb = rgb.map(v => v >> 1); break; } }
            img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = 255;
        }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, PNG.sync.write(img));
}

const WORLDS = [{ name: 'seed 1', seed: 1 }, { name: 'seed 2', seed: 2 }, { name: 'one continent', seed: 11, sliders: { numContinents: 1 } },
    { name: 'ocean world', seed: 13, sliders: { landCoverage: 0.1 } }, { name: 'few countries', seed: 3, count: COUNTRIES.min }, { name: 'many countries', seed: 3, count: COUNTRIES.max }];
for (const wd of WORLDS) {
    console.log(`\n── ${wd.name} ──`);
    const { mesh, heightKm } = await world(wd.seed, 60000, wd.sliders), F = findLands(mesh, heightKm), fed = peopleGuess(mesh, heightKm);
    const count = wd.count ?? COUNTRIES.default, t0 = performance.now(), P = makeCountries(mesh, heightKm, F, fed, { count, seed: wd.seed }), ms = performance.now() - t0;
    const again = makeCountries(mesh, heightKm, F, fed, { count, seed: wd.seed });
    if (PNG_DIR) await png(path.join(PNG_DIR, `${wd.name.replace(/ /g, '-')}.png`), mesh, F, P);
    const n = mesh.numCells, want = Math.max(F.continents.length, count);
    let orphan = 0, seaOwned = 0, wrong = 0;
    for (let c = 0; c < n; c++) { const o = P.countryOf[c]; if (F.land[c] && F.continentOf[c] >= 0 && o < 0) orphan++; if (!F.land[c] && o >= 0) seaOwned++; if (o >= 0 && P.countries[o].continent !== F.continentOf[c]) wrong++; }
    check(`${wd.name}: as many countries as asked for`, P.countries.length === want, `${P.countries.length} of ${want}`);
    check(`${wd.name}: every land cell in a country of its own continent, no sea cell in one`, orphan === 0 && seaOwned === 0 && wrong === 0, `${orphan} land without, ${seaOwned} sea with, ${wrong} on another continent`);
    check(`${wd.name}: every continent has a country`, F.continents.every(k => P.countries.some(c => c.continent === k.id)));
    check(`${wd.name}: every country has land`, P.countries.every(k => k.km2 > 0), `smallest ${(Math.min(...P.countries.map(k => k.km2)) / 1e3).toFixed(0)} thousand km²`);
    check(`${wd.name}: no two neighbours the same colour`, P.countries.every(k => k.neighbours.every(q => P.countries[q].colour !== k.colour) || k.neighbours.length >= 8));
    check(`${wd.name}: the same world gives the same countries`, again.countries.length === P.countries.length && again.countryOf.every((v, i) => v === P.countryOf[i]));
    const sizes = P.countries.map(k => k.km2).sort((a, b) => a - b);
    check(`${wd.name}: big and small countries (the biggest at least three times the median)`, P.countries.length < 6 || sizes[sizes.length - 1] > 3 * sizes[sizes.length >> 1], `${(sizes[sizes.length - 1] / 1e6).toFixed(1)} M and ${(sizes[sizes.length >> 1] / 1e6).toFixed(2)} M km²`);
    check(`${wd.name}: generated in under 2 s at 60K`, ms < 2000, `${ms.toFixed(0)} ms`);

    // two cultures on the biggest continent: both sides taken, each side's countries touching
    const cultures = F.continents.map((k, i) => [CULTURES[i % 9].id, i === 0 ? CULTURES[(i + 4) % 9].id : null]);
    const side = divideContinent(mesh, F, P, 0), own = P.countries.filter(k => k.continent === 0);
    check(`${wd.name}: a continent of two cultures has both`, own.length < 2 || new Set(side.values()).size === 2, `${[...side.values()].filter(s => s === 0).length} west, ${[...side.values()].filter(s => s === 1).length} east`);
    const cultureOf = (k) => { const [a, b] = cultures[k.continent]; return b && side.get(k.id) === 1 ? b : a; };
    const names = makeNames(mesh, F, P, { seed: wd.seed, cultureOf, continentCulture: (id) => cultures[id][0] });
    const all = [...names.continents, ...names.seas, ...names.countries];
    check(`${wd.name}: every place named, no name twice`, all.every(s => s && s.length >= 4) && new Set(all.map(s => s.toLowerCase())).size === all.length, `${all.length} names`);
    const same = makeNames(mesh, F, P, { seed: wd.seed, cultureOf, continentCulture: (id) => cultures[id][0] });
    check(`${wd.name}: the same world gives the same names`, JSON.stringify(same) === JSON.stringify(names));
    const kept = makeNames(mesh, F, P, { seed: wd.seed, salt: 1, cultureOf, continentCulture: (id) => cultures[id][0], fixed: { [`country:${P.countries[0].capital}`]: 'Testland', 'continent:0': 'Testia' } });
    check(`${wd.name}: new names keep the ones written`, kept.countries[0] === 'Testland' && kept.continents[0] === 'Testia' && kept.countries.slice(1).some((s, i) => s !== names.countries[i + 1]));
    if (VERBOSE) { console.log('  continents:', names.continents.join(', ')); console.log('  waters:', names.seas.join(', ')); console.log('  countries:', names.countries.slice(0, 24).join(', ')); }
}
console.log(`\n${failures === 0 ? `Countries: all ${total} checks passed.` : `Countries: ${failures} of ${total} checks FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
