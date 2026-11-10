// The fork's political layer, step S3 (FORK.md): a world's countries, generated. Each continent gets its share of the
// countries asked for (by its land and by the people its land could feed); their first places are set where the land
// feeds the most people, kept apart from each other; each country then grows outward over the land, and the going is
// costly over high ground and over land that feeds no one, so borders settle on mountain ranges and in deserts. Land a
// country cannot walk to — islands — goes to the country nearest over the sea. Rivers shape the growth too: stepping onto
// or off a river costs a toll that grows with the river's flow, so a country stops at a big river and the next one stops
// on the other bank — borders fall along rivers; and moving along a big river is cheaper, so a river valley holds together
// in one country. A slow, two-scale wobble in the going keeps the shapes from all being the same round blob. Pure
// functions, in km and km²: the same at every Detail. Also here: a continent of two cultures divided along its costliest
// ground (S2), and the countries' colours (no two neighbours alike).

import { MinHeap } from '../v2/js/core/min-heap.js';
import { SimplexNoise } from '../js/simplex-noise.js';
import { farmPlace, harvestsAt, hasHarvests, CROPS } from '../v2/js/farming/farming.js';
import { peopleAt } from '../v2/js/farming/people.js';
import { KOPPEN_ID } from '../v2/js/climate/koppen.js';

const R_KM = 6371, SPHERE_KM2 = 4 * Math.PI * R_KM * R_KM;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const COUNTRIES = {
    min: 4, max: 160, default: 48,
    shareByPeople: 0.5,         // a continent's share of the countries: half by its land, half by the people it could feed
    highKm: [0.8, 3.0],         // the going gets costly over ground from … to this high (km)…
    highCost: 3.0,              // …up to this many times the flat's
    emptyPeople: 4,             // land that feeds under this many people a km² is costly too (deserts, ice, tundra)…
    emptyCost: 1.5,             // …up to this much more
    strength: [0.55, 2.0],      // each country's push as it grows (drawn per country, evenly in the log): big and small countries
    elongation: { share: 0.65, range: [0.3, 1.4] },   // the share of countries that stretch along one axis, and how much (1.4: across costs
                                // four times along; 0.3: hardly at all). The rest grow round
    river: {
        minQ: 500,              // a river counts from this flow (m³/s: the Earth's major rivers; the finish keeps streams of 8 and up)…
        fullQ: 8000,            // …and counts fully from this (the Danube's 6,500; the Rhine's 2,300; the Amazon's 200,000)
        crossKm: 900,           // the toll to step onto or off a full river, in km of going (a river at the least: a fifth of it)
        valley: 0.1,            // the going along a full river is this much cheaper
        seedBonus: 0.6,         // a first place on a full river is worth this much more
    },
    wobble: { amp: 0.5, wavelengthsKm: [1300, 480] },   // the going's slow wobble: how much, and at what scales
    seedRoom: 0.5,              // how much the land's people count against distance when first places are set (0: evenly
                                // spread; 1: crowded into the best land)
    techniques: { flood: true, canal: true, terrace: true, raised: true },   // the people the land could feed: with these
};

/** A small seeded generator (mulberry32): its draws the same on every machine. */
export function rngOf(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The people each cell's land could feed (a km², pre-industrial), from a finished world's food picture (`fin`: the page's
 * finished world — its raster's farming, and the land's climate in fin.climate.raster, as the Food view reads them),
 * averaged per cell of `mesh` — or null where the picture has no food.
 */
export function peoplePerCell(mesh, fin, C = COUNTRIES) {
    const F = fin?.raster?.farming, L = fin?.climate?.raster;
    if (!F?.soil || !L?.koppen) return null;
    const n = mesh.numCells, sum = new Float32Array(n), cnt = new Uint16Array(n);
    const kef = KOPPEN_ID.EF, p = {}, e = new Float64Array(2 * CROPS.length), r = {}, kept = hasHarvests(F), tech = C.techniques;
    // (read at about two and a half samples a cell — a stride of the picture's pixels, never finer than the picture)
    const stride = Math.max(1, Math.round(F.w / (2 * Math.sqrt(n))));
    for (let y = 0; y < F.h; y += stride) {
        const lat = Math.PI / 2 - (y + 0.5) / F.h * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let x = 0; x < F.w; x += stride) {
            const i = y * F.w + x;
            if (!L.koppen[i]) continue;
            const lon = (x + 0.5) / F.w * 2 * Math.PI - Math.PI, c = mesh.index.nearest(cl * Math.cos(lon), cl * Math.sin(lon), sl);
            if (cnt[c] === 65535) continue;
            cnt[c]++;
            if (L.koppen[i] === kef) continue;
            p.soil = F.soil[i] / 255; p.warm = F.warm[i] / 20; p.flood = F.flood[i] / 255; p.canal = F.canal[i] / 255; p.slope = 2 * F.slope[i]; p.wetland = F.wetland[i] / 255;
            if (kept) harvestsAt(F.crops, i, e); else e.fill(0);
            farmPlace(p, e, F.pasture[i] / 255, tech, r);
            sum[c] += peopleAt(r, p, tech);
        }
    }
    const out = new Float32Array(n);
    for (let c = 0; c < n; c++) out[c] = cnt[c] ? sum[c] / cnt[c] : 0;
    return out;
}

/**
 * The rivers of a finished world painted onto the cells of `mesh`: each cell's biggest flow (m³/s), 0 where none. `R`: the
 * finish's rivers ({ start, lat, lon, q }: polylines, a point a cell along them) — read segment by segment so that a river
 * is one unbroken line of cells at every Detail.
 */
export function riverFlow(mesh, R) {
    const n = mesh.numCells, q = new Float32Array(n);
    if (!R?.q?.length) return q;
    const rad = Math.PI / 180, P = R.lat.length, starts = R.start, step = 0.5 * mesh.edgeKm / R_KM;
    const nearest = (v) => mesh.index.nearest(v[0], v[1], v[2]);
    const at = (i) => { const la = R.lat[i] * rad, lo = R.lon[i] * rad, cl = Math.cos(la); return [cl * Math.cos(lo), cl * Math.sin(lo), Math.sin(la)]; };
    for (let s = 0; s < starts.length; s++) {
        const a = starts[s], b = s + 1 < starts.length ? starts[s + 1] : P;
        let prev = at(a), c = nearest(prev);
        if (R.q[a] > q[c]) q[c] = R.q[a];
        for (let i = a + 1; i < b; i++) {
            const cur = at(i), d = Math.acos(Math.max(-1, Math.min(1, prev[0] * cur[0] + prev[1] * cur[1] + prev[2] * cur[2])));
            const m = d > 0.3 ? 1 : Math.max(1, Math.ceil(d / step));          // (a jump that long is not a river's bend: one sample)
            for (let k = 1; k <= m; k++) {
                const f = k / m, v = [prev[0] + (cur[0] - prev[0]) * f, prev[1] + (cur[1] - prev[1]) * f, prev[2] + (cur[2] - prev[2]) * f], l = Math.hypot(v[0], v[1], v[2]) || 1;
                c = nearest([v[0] / l, v[1] / l, v[2] / l]);
                if (R.q[i] > q[c]) q[c] = R.q[i];
            }
            prev = cur;
        }
    }
    return q;
}

/** How much of a river each cell has (0: none … 1: a full river), from its flow (riverFlow): a river counts from `minQ`, by the log of its flow. */
export function riverness(flow, C = COUNTRIES) {
    const { minQ, fullQ } = C.river, n = flow.length, r = new Float32Array(n), lo = Math.log10(minQ), span = Math.log10(fullQ) - lo;
    for (let c = 0; c < n; c++) if (flow[c] >= minQ) r[c] = 0.2 + 0.8 * Math.min(1, (Math.log10(flow[c]) - lo) / span);
    return r;
}

/** The people a cell could feed, guessed from its latitude and height alone: for a world not finished (and the check). */
export function peopleGuess(mesh, heightKm) {
    const out = new Float32Array(mesh.numCells);
    for (let c = 0; c < out.length; c++) {
        if (heightKm[c] <= 0) continue;
        const lat = Math.abs(Math.asin(Math.max(-1, Math.min(1, mesh.xyz[3 * c + 2])))) * 180 / Math.PI;
        // (the dry belts near 25°, the cold past 55°, the heights)
        out[c] = 30 * (1 - smooth(52, 72, lat)) * (1 - 0.75 * smooth(14, 24, lat) * (1 - smooth(26, 36, lat))) * (1 - smooth(1.2, 3.5, heightKm[c]));
    }
    return out;
}

const arcKm = (xyz, a, b) => R_KM * Math.acos(Math.max(-1, Math.min(1, xyz[3 * a] * xyz[3 * b] + xyz[3 * a + 1] * xyz[3 * b + 1] + xyz[3 * a + 2] * xyz[3 * b + 2])));

/**
 * How costly each cell is to cross (1: flat, peopled land), from its height and the people it could feed, the going's
 * wobble (`mesh`, `seed`: a slow noise over the sphere, at the scales in C.wobble) and, along a river (`river`: riverness
 * per cell or null), cheaper by C.river.valley.
 */
export function crossingCost(mesh, heightKm, people, { river = null, seed = 1, C = COUNTRIES } = {}) {
    const n = heightKm.length, cost = new Float32Array(n), noise = new SimplexNoise((seed * 40503 + 17) >>> 0), { amp, wavelengthsKm } = C.wobble, xyz = mesh.xyz;
    const scales = wavelengthsKm.map(w => R_KM / w);
    for (let c = 0; c < n; c++) {
        let w = 0;
        for (const s of scales) w += noise.noise3D(xyz[3 * c] * s, xyz[3 * c + 1] * s, xyz[3 * c + 2] * s);
        w /= scales.length;
        let v = 1 + (C.highCost - 1) * smooth(C.highKm[0], C.highKm[1], heightKm[c]) + C.emptyCost * (1 - Math.min(1, people[c] / C.emptyPeople));
        if (river) v *= 1 - C.river.valley * river[c];
        cost[c] = Math.max(0.3, v * (1 + amp * w));
    }
    return cost;
}

/**
 * The cost to reach every land cell from `sources` ([{ cell, label, strength }]) over the land `canEnter(cell)` allows:
 * each cell goes to the source that reaches it cheapest; with `river` (riverness per cell), stepping onto or off a river costs
 * `crossKm` × the change in riverness; a source with an `axis` (a unit vector) and `elong` goes more easily along it than across.
 * @returns {{ dist: Float64Array, owner: Int32Array }} (−1: unreached)
 */
function grow(mesh, cost, sources, canEnter, river = null, crossKm = 0) {
    const { adjOffset, adjList, xyz } = mesh, n = mesh.numCells;
    // (distances in doubles: in a Float32Array a distance rounded up would look improvable for ever, and be queued again and again)
    const dist = new Float64Array(n).fill(Infinity), owner = new Int32Array(n).fill(-1), push = new Float32Array(sources.length), heap = new MinHeap(4096);
    const ax = new Float32Array(3 * sources.length), el = new Float32Array(sources.length);
    sources.forEach((s, i) => { dist[s.cell] = 0; owner[s.cell] = i; push[i] = s.strength ?? 1; if (s.axis && s.elong) { ax.set(s.axis, 3 * i); el[i] = s.elong; } heap.push(0, s.cell); });
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > dist[c]) continue;
        const o = owner[c];
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (!canEnter(nb)) continue;
            let m = 1;
            if (el[o]) {
                // (along the country's axis cheaper, across it dearer: 1 − 0.4·elong·(2cos²θ − 1))
                const sx = xyz[3 * nb] - xyz[3 * c], sy = xyz[3 * nb + 1] - xyz[3 * c + 1], sz = xyz[3 * nb + 2] - xyz[3 * c + 2];
                const cs = (sx * ax[3 * o] + sy * ax[3 * o + 1] + sz * ax[3 * o + 2]) / (Math.hypot(sx, sy, sz) || 1);
                m = 1 - 0.4 * el[o] * (2 * cs * cs - 1);
            }
            const d = dc + (arcKm(xyz, c, nb) * 0.5 * (cost[c] + cost[nb]) * m + (river ? crossKm * Math.abs(river[c] - river[nb]) : 0)) / push[o];
            if (d >= dist[nb]) continue;
            dist[nb] = d; owner[nb] = o;
            heap.push(dist[nb], nb);
        }
    }
    for (let c = 0; c < n; c++) if (owner[c] >= 0) owner[c] = sources[owner[c]].label;
    return { dist, owner };
}

/**
 * A world's countries. `F`: its lands (lands.js findLands); `people`: per cell (peoplePerCell, or peopleGuess);
 * `count`: how many are asked for (each continent gets at least one); `seed`: the world's; `flow`: the rivers' flow per
 * cell (riverFlow) or null — the borders then fall along them.
 * @returns {{
 *   countryOf: Int32Array,        per cell: its country (sea: −1)
 *   countries: Array<{ id, continent, capital, middle, km2, people, neighbours: number[], colour }>,
 *     `capital`: the cell it grew from; `middle`: the cell farthest from its borders and coasts (its name's place);
 *     `people`: those its land could feed; `colour`: 0…7, no neighbour's the same
 *   cost: Float32Array,           each cell's crossing cost (kept for dividing a continent)
 *   river: Float32Array | null }} each cell's riverness (0…1), if there were rivers
 */
export function makeCountries(mesh, heightKm, F, people, { count = COUNTRIES.default, seed = 1, flow = null, C = COUNTRIES } = {}) {
    const n = mesh.numCells, cellKm2 = SPHERE_KM2 / n, { adjOffset, adjList, xyz } = mesh, rng = rngOf(seed * 2654435761 + 97);
    const K = F.continents.length, river = flow ? riverness(flow, C) : null, cost = crossingCost(mesh, heightKm, people, { river, seed, C });

    // ── each continent's share ──
    const land = new Float64Array(K), fed = new Float64Array(K), cellsOf = Array.from({ length: K }, () => []);
    for (let c = 0; c < n; c++) { const k = F.continentOf[c]; if (k < 0) continue; land[k] += 1; fed[k] += people[c]; cellsOf[k].push(c); }
    const landAll = land.reduce((a, b) => a + b, 0) || 1, fedAll = fed.reduce((a, b) => a + b, 0) || 1;
    const want = Math.max(K, Math.min(C.max, Math.round(count)));
    const share = Array.from(land, (l, k) => (1 - C.shareByPeople) * l / landAll + C.shareByPeople * fed[k] / fedAll);
    const each = share.map(s => Math.max(1, Math.floor(s * want)));
    // (the rest to the biggest remainders)
    const order = share.map((s, k) => [s * want - Math.floor(s * want), k]).sort((a, b) => b[0] - a[0]);
    for (let i = 0, left = want - each.reduce((a, b) => a + b, 0); left > 0 && order.length; i = (i + 1) % order.length, left--) each[order[i][1]]++;

    // ── the first places: where the land feeds the most, kept apart ──
    const sources = [];
    for (let k = 0; k < K; k++) {
        const cells = cellsOf[k], m = cells.length, near = new Float32Array(m).fill(Infinity);
        if (!m) continue;
        let top = 1e-6;
        for (const c of cells) if (people[c] > top) top = people[c];
        // (a place's worth: the people its land could feed, a little noise so that ties fall the same way every time)
        const worth = Float32Array.from(cells, c => Math.pow(0.05 + people[c] / top, C.seedRoom) * (0.9 + 0.2 * rng()) * (1 + (river ? C.river.seedBonus * river[c] : 0)));
        const take = Math.min(each[k], m);
        for (let s = 0; s < take; s++) {
            let best = -1, bestV = -1;
            for (let i = 0; i < m; i++) { const v = s === 0 ? worth[i] : (near[i] === 0 ? -1 : near[i] * worth[i]); if (v > bestV) { bestV = v; best = i; } }
            if (best < 0) break;
            const cell = cells[best];
            // (its push, evenly in the log; and whether it stretches along an axis — one lying along the ground at its first place)
            const lo = Math.log(C.strength[0]), hi = Math.log(C.strength[1]), strength = Math.exp(lo + (hi - lo) * rng());
            let axis = null, elong = 0;
            if (rng() < C.elongation.share) {
                const px = xyz[3 * cell], py = xyz[3 * cell + 1], pz = xyz[3 * cell + 2], g = [rng() - 0.5, rng() - 0.5, rng() - 0.5], d = g[0] * px + g[1] * py + g[2] * pz;
                const v = [g[0] - d * px, g[1] - d * py, g[2] - d * pz], l = Math.hypot(v[0], v[1], v[2]) || 1;
                axis = [v[0] / l, v[1] / l, v[2] / l]; elong = C.elongation.range[0] + (C.elongation.range[1] - C.elongation.range[0]) * rng();
            }
            sources.push({ cell, label: sources.length, continent: k, strength, axis, elong });
            for (let i = 0; i < m; i++) { const d = arcKm(xyz, cell, cells[i]); if (d < near[i]) near[i] = d; }
            near[best] = 0;
        }
    }

    // ── each grows over its own continent's land; what none can walk to goes to the nearest over the sea ──
    const seedCont = sources.map(s => s.continent);
    const G = grow(mesh, cost, sources, (c) => F.continentOf[c] >= 0, river, C.river.crossKm);
    const countryOf = G.owner;
    // (a country never holds another continent's ground: there the nearest country of that continent takes it)
    for (let c = 0; c < n; c++) if (countryOf[c] >= 0 && seedCont[countryOf[c]] !== F.continentOf[c]) countryOf[c] = -1;
    const left = [];
    for (let c = 0; c < n; c++) if (F.continentOf[c] >= 0 && countryOf[c] < 0) left.push(c);
    if (left.length) {
        // over land and sea alike, from every cell that has a country, by continent
        const dist = new Float64Array(n).fill(Infinity), from = new Int32Array(countryOf), heap = new MinHeap(4096);
        for (let c = 0; c < n; c++) if (countryOf[c] >= 0) { dist[c] = 0; heap.push(0, c); }
        while (heap.size) {
            const c = heap.pop(), dc = heap.lastKey;
            if (dc > dist[c]) continue;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k], d = dc + arcKm(xyz, c, nb);
                // (through the sea and through its own continent's land only)
                if (d >= dist[nb] || (F.continentOf[nb] >= 0 && F.continentOf[nb] !== seedCont[from[c]])) continue;
                dist[nb] = d; from[nb] = from[c]; heap.push(d, nb);
            }
        }
        for (const c of left) countryOf[c] = from[c];
        // (land still without one — hemmed in by another continent's land: its own continent's country whose first place
        // is nearest, as the crow flies)
        for (const c of left) {
            if (countryOf[c] >= 0) continue;
            let best = -1, bd = Infinity;
            for (const s of sources) { if (s.continent !== F.continentOf[c]) continue; const d = arcKm(xyz, c, s.cell); if (d < bd) { bd = d; best = s.label; } }
            countryOf[c] = best;
        }
    }

    // ── what each is: its size, its people, its neighbours, its middle ──
    const countries = sources.map((s, id) => ({ id, continent: s.continent, capital: s.cell, middle: s.cell, km2: 0, people: 0, neighbours: new Set(), colour: 0 }));
    const edge = new Float64Array(n).fill(Infinity), heap = new MinHeap(4096);
    for (let c = 0; c < n; c++) {
        const o = countryOf[c];
        if (o < 0) continue;
        countries[o].km2 += cellKm2; countries[o].people += people[c] * cellKm2;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const q = countryOf[adjList[k]];
            if (q === o) continue;
            if (q >= 0) countries[o].neighbours.add(q);
            if (edge[c] > 0) { edge[c] = 0; heap.push(0, c); }
        }
    }
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > edge[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (countryOf[nb] !== countryOf[c]) continue; const d = dc + arcKm(xyz, c, nb); if (d < edge[nb]) { edge[nb] = d; heap.push(d, nb); } }
    }
    const deep = new Float32Array(countries.length).fill(-1);
    for (let c = 0; c < n; c++) { const o = countryOf[c]; if (o >= 0 && edge[c] < Infinity && edge[c] > deep[o]) { deep[o] = edge[c]; countries[o].middle = c; } }

    // ── colours: the most hemmed-in first, each the first of the eight no neighbour has ──
    const byDegree = countries.map(k => k.id).sort((a, b) => countries[b].neighbours.size - countries[a].neighbours.size || a - b), done = new Uint8Array(countries.length);
    for (const id of byDegree) {
        const used = new Set();
        for (const q of countries[id].neighbours) if (done[q]) used.add(countries[q].colour);
        let col = (id * 5 + 3) % 8;                                    // (where it starts looking: the hues spread over the map)
        for (let t = 0; t < 8 && used.has(col); t++) col = (col + 1) % 8;
        countries[id].colour = col; done[id] = 1;
    }
    for (const k of countries) k.neighbours = [...k.neighbours].sort((a, b) => a - b);
    return { countryOf, countries, cost, river };
}

/**
 * A continent of two cultures, divided: two places as far apart as the going allows, and each country of the continent
 * to the one its capital reaches cheaper — the line between them falls on the costliest ground. `P`: makeCountries'.
 * @returns {Map<number, 0 | 1>} each of the continent's countries: 0 the western side, 1 the eastern
 */
export function divideContinent(mesh, F, P, continent) {
    const own = P.countries.filter(k => k.continent === continent);
    const sides = new Map(own.map(k => [k.id, 0]));
    if (own.length < 2) return sides;
    const inside = (c) => F.continentOf[c] === continent, start = F.continents[continent].peak;
    const far = (from) => { const d = grow(mesh, P.cost, [{ cell: from, label: 0 }], inside).dist; let best = from, bv = -1; for (const k of own) if (d[k.capital] < Infinity && d[k.capital] > bv) { bv = d[k.capital]; best = k.capital; } return { cell: best, dist: d }; };
    const a = far(start), b = far(a.cell), da = b.dist, db = grow(mesh, P.cost, [{ cell: b.cell, label: 0 }], inside).dist;
    const lonOf = (c) => Math.atan2(mesh.xyz[3 * c + 1], mesh.xyz[3 * c]);
    // (which of the two is the western one: by the shorter way round)
    let dl = lonOf(b.cell) - lonOf(a.cell); if (dl > Math.PI) dl -= 2 * Math.PI; if (dl < -Math.PI) dl += 2 * Math.PI;
    const aWest = dl >= 0;
    for (const k of own) {
        let ta = da[k.capital], tb = db[k.capital];
        if (!(ta < Infinity) || !(tb < Infinity)) { ta = arcKm(mesh.xyz, k.capital, a.cell); tb = arcKm(mesh.xyz, k.capital, b.cell); }   // (an island: as the crow flies)
        const nearA = ta <= tb;
        sides.set(k.id, nearA === aWest ? 0 : 1);
    }
    // (never all on one side)
    if (new Set(sides.values()).size < 2) sides.set(own[own.length - 1].id, 1 - sides.get(own[0].id));
    return sides;
}
