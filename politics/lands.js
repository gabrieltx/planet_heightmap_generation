// The fork's political layer, step S1 (FORK.md): a world's continents and its oceans, from its ground alone — each cell
// of the mesh its height (km) against the sea's level. Pure functions, no page: the Political view (political-view.js)
// draws what this finds, and a check runs it headless (politics/tools/check-lands.mjs).
//
// Both the land and the sea are divided the same way, at their NECKS. A body's "depth" at a cell is the distance (km) to
// the nearest cell outside the body: the open ocean's middle is deep, a strait shallow; a continent's heart is deep, an
// isthmus shallow. Taking the cells deepest first, bodies grow down from their deepest points and meet at the saddles
// between them. Two bodies that meet stay apart only where the saddle is a real neck: much shallower than the smaller
// body's own depth (LANDS.*.neck). Otherwise they are one. Everything is in km and km², so the same world is divided the
// same way at every Detail.
//
//   · CONTINENTS: the land's bodies of LANDS.land.minKm2 and more, at most LANDS.maxContinents (the eight colours a map
//     can hold: docs/style-guide/maps.md), biggest first. Smaller land — islands, and a ninth body — belongs to the
//     continent nearest it over the sea.
//   · OCEANS and SEAS: the sea's bodies of LANDS.sea.minKm2 and more; an ocean from LANDS.oceanKm2, a sea below. A sea
//     behind a real neck (a strait) is its own. The open ocean has no such necks — its passages are wide — so a body
//     much bigger than an ocean is shared out among its deepest basins instead: one for every LANDS.sea.basinKm2 of it,
//     the basins that stand out most (a basin's standing: its depth above the passage that joins it to a deeper one),
//     divided at the passages between them. Smaller water joins the body it shares the most shore with; water shut in
//     by land with no such neighbour is left unnamed.

import { spreadKm } from '../v2/js/core/min-heap.js';

const R_KM = 6371, SPHERE_KM2 = 4 * Math.PI * R_KM * R_KM;

export const LANDS = {
    maxContinents: 8,
    land: {
        minKm2: 3.0e6,          // a continent: bigger than Greenland (2.2 million km²), smaller than Australia (7.7)
        neck: 0.30,             // two lands are two continents where the neck between them is under this share of the
                                // smaller one's depth (Panama, Suez: a few tens of km against ~1000)
    },
    sea: {
        minKm2: 1.5e6,          // a sea worth a name: the Gulf of Mexico (1.6 million km²) and up
        neck: 0.30,             // a sea behind a strait is its own, as a land behind an isthmus
        basinKm2: 90e6,         // the open ocean: one ocean for about every this much of it (the Earth's 335 million km² of
                                // open ocean: four)…
        maxBasins: 6,           // …at most this many…
        basinDepthKm: 800,      // …each a basin this far from land at its middle, and standing this far above the passage
        basinStandKm: 250,      // to a deeper one
    },
    oceanKm2: 12e6,             // an ocean from here (the Arctic: 14 million km²); below, a sea
};

/**
 * A set of cells divided at its necks. `inSet`: 1 where a cell is in the set; `cellKm2`: a cell's area. With `seeds` (a
 * Set of cells): divided among the bodies that grow from those cells instead, whatever the necks — the others join
 * the first of them they meet.
 * @returns {{ label: Int32Array, bodies: Array<{ id: number, cells: number, km2: number, peak: number, depthKm: number }> }}
 *   label per cell (−1 outside the set), and each body: its size, its deepest cell (`peak`: the farthest from any edge)
 *   and that cell's depth.
 */
export function divideAtNecks(mesh, inSet, { neck, minKm2, cellKm2, seeds = null }) {
    const { adjOffset, adjList } = mesh, n = mesh.numCells;
    // each cell's depth: km to the nearest cell outside the set (half an edge at the set's own rim)
    const depth = new Float32Array(n).fill(Infinity);
    let any = false;
    for (let c = 0; c < n; c++) {
        if (inSet[c]) continue;
        depth[c] = 0; any = true;
    }
    if (!any) depth.fill(R_KM * Math.PI);                               // (a world all land, or all sea: one body)
    else spreadKm(mesh, depth);
    const order = [];
    for (let c = 0; c < n; c++) if (inSet[c]) order.push(c);
    order.sort((a, b) => depth[b] - depth[a]);

    // union-find over the bodies; each root keeps its peak and the roots it has met at a real neck
    const parent = new Int32Array(n).fill(-1), peak = new Int32Array(n), apart = new Map(), anchored = new Uint8Array(n), joins = [];
    const find = (c) => { let r = c; while (parent[r] !== r) r = parent[r]; while (parent[c] !== r) { const nx = parent[c]; parent[c] = r; c = nx; } return r; };
    const isApart = (a, b) => apart.get(a)?.has(b) ?? false;
    const setApart = (a, b) => { for (const [x, y] of [[a, b], [b, a]]) { if (!apart.has(x)) apart.set(x, new Set()); apart.get(x).add(y); } };
    const merge = (a, b) => {                                           // (b into a: a's peak the deeper)
        if (depth[peak[b]] > depth[peak[a]]) [a, b] = [b, a];
        parent[b] = a; anchored[a] |= anchored[b];
        const sb = apart.get(b);
        if (sb) { for (const x of sb) { apart.get(x).delete(b); if (x !== a) setApart(a, x); } apart.delete(b); }
        return a;
    };
    for (const c of order) {
        const d = depth[c];
        let roots = null;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (parent[nb] < 0) continue;
            const r = find(nb);
            if (!roots) roots = [r]; else if (!roots.includes(r)) roots.push(r);
        }
        if (!roots) { parent[c] = c; peak[c] = c; anchored[c] = seeds?.has(c) ? 1 : 0; continue; }
        // the bodies this cell joins: the deepest takes it; the others join that one unless the saddle here is a neck
        roots.sort((a, b) => depth[peak[b]] - depth[peak[a]]);
        let home = roots[0];
        for (let i = 1; i < roots.length; i++) {
            const other = find(roots[i]);
            home = find(home);
            if (other === home || isApart(home, other)) continue;
            if (seeds ? anchored[home] && anchored[other] : d < neck * Math.min(depth[peak[home]], depth[peak[other]])) setApart(home, other);
            else {
                // (the shallower one joins: its peak, and how far it stood above this passage)
                const lo = depth[peak[other]] > depth[peak[home]] ? home : other;
                joins.push({ peak: peak[lo], depthKm: depth[peak[lo]], standKm: depth[peak[lo]] - d });
                home = merge(home, other);
            }
        }
        parent[c] = find(home);
    }

    // the bodies, biggest first; the small ones join the neighbour they share the most edge with, smallest first
    const label = new Int32Array(n).fill(-1), cellsOf = new Map();
    for (const c of order) { const r = find(c); label[c] = r; if (!cellsOf.has(r)) cellsOf.set(r, []); cellsOf.get(r).push(c); }
    const size = new Map([...cellsOf].map(([r, list]) => [r, list.length]));
    const minCells = minKm2 / cellKm2;
    const queue = [...size.keys()].filter(r => size.get(r) < minCells).sort((a, b) => size.get(a) - size.get(b));
    for (let qi = 0; qi < queue.length; qi++) {
        const small = queue[qi];
        if (!size.has(small) || size.get(small) >= minCells) continue;
        const cells = cellsOf.get(small), shared = new Map();
        for (const c of cells) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const l = label[adjList[k]]; if (l >= 0 && l !== small) shared.set(l, (shared.get(l) ?? 0) + 1); }
        let into = -1;
        for (const [l, s] of shared) if (into < 0 || s > shared.get(into)) into = l;
        size.delete(small); cellsOf.delete(small);
        if (into < 0) { for (const c of cells) label[c] = -2; continue; }   // (alone: set aside)
        for (const c of cells) label[c] = into;
        const list = cellsOf.get(into);
        for (const c of cells) list.push(c);
        size.set(into, list.length);
        if (depth[peak[small]] > depth[peak[into]]) peak[into] = peak[small];
        if (list.length < minCells) queue.push(into);                      // (still small: its turn again)
    }
    const roots = [...size.keys()].sort((a, b) => size.get(b) - size.get(a)), idOf = new Map(roots.map((r, i) => [r, i]));
    const alone = [];
    for (const c of order) { if (label[c] === -2) alone.push(c); else label[c] = idOf.get(label[c]); }
    return { label, alone, depth, joins, bodies: roots.map((r, id) => ({ id, cells: size.get(r), km2: size.get(r) * cellKm2, peak: peak[r], depthKm: depth[peak[r]] })) };
}

/**
 * A world's continents and oceans. `mesh`: its cells ({ numCells, xyz, adjOffset, adjList }); `heightKm` per cell.
 * @returns {{
 *   land: Uint8Array,                 1 where a cell is land
 *   continentOf: Int16Array,          per cell: its continent (land: the body it is part of, or the nearest continent's for an
 *                                     island; sea: −1)
 *   mainland: Uint8Array,             1 where a land cell is part of its continent's own body (0: an island of it)
 *   seaOf: Int16Array,                per cell: its ocean or sea (land, and unnamed water: −1)
 *   continents: Array<{ id, km2, islandsKm2, peak, depthKm }>,     biggest first; `peak`: the cell farthest from its coasts
 *   seas: Array<{ id, kind: 'ocean' | 'sea', km2, peak, depthKm }>,  biggest first
 *   landKm2: number, seaKm2: number }}
 */
export function findLands(mesh, heightKm, { seaLevelKm = 0, C = LANDS } = {}) {
    const n = mesh.numCells, cellKm2 = SPHERE_KM2 / n;
    const land = new Uint8Array(n), sea = new Uint8Array(n);
    let landCells = 0;
    for (let c = 0; c < n; c++) { if (heightKm[c] > seaLevelKm) { land[c] = 1; landCells++; } else sea[c] = 1; }

    // ── the land: its bodies, the continents among them, the islands to the nearest continent ──
    // (a body under a continent's size joins the continent it hangs from; one alone in the sea is an island)
    let L = divideAtNecks(mesh, land, { neck: C.land.neck, minKm2: C.land.minKm2, cellKm2 });
    if (!L.bodies.length && landCells) { L = divideAtNecks(mesh, land, { neck: 0, minKm2: 0, cellKm2 }); L.bodies.length = 1; }   // (a world of islands: its biggest is its continent)
    const big = L.bodies.slice(0, C.maxContinents);
    const contId = new Map(big.map((b, i) => [b.id, i]));
    const continentOf = new Int16Array(n).fill(-1), mainland = new Uint8Array(n);
    const reach = new Float32Array(n).fill(Infinity);
    for (let c = 0; c < n; c++) {
        const i = land[c] ? contId.get(L.label[c]) : undefined;
        if (i !== undefined) { continentOf[c] = i; mainland[c] = 1; reach[c] = 0; }
    }
    // (every other cell: the continent nearest it, over land and sea alike — kept for the land only)
    const nearest = new Int16Array(continentOf);
    if (big.length) spreadKm(mesh, reach, { onReach: (from, to) => { nearest[to] = nearest[from]; } });
    const continents = big.map((b, id) => ({ id, km2: b.km2, islandsKm2: 0, peak: b.peak, depthKm: b.depthKm }));
    for (let c = 0; c < n; c++) {
        if (!land[c] || mainland[c]) continue;
        continentOf[c] = nearest[c];
        if (nearest[c] >= 0) continents[nearest[c]].islandsKm2 += cellKm2;
    }

    // ── the sea: its bodies; an ocean or a sea by its size ──
    // (first by its straits; then each body much bigger than an ocean among its basins that stand out most)
    const S0 = divideAtNecks(mesh, sea, { neck: C.sea.neck, minKm2: 0, cellKm2 });
    const seeds = new Set(S0.bodies.map(b => b.peak)), room = S0.bodies.map(b => Math.min(C.sea.maxBasins, Math.max(1, Math.round(b.km2 / C.sea.basinKm2))) - 1);
    for (const j of S0.joins.filter(j => j.depthKm >= C.sea.basinDepthKm && j.standKm >= C.sea.basinStandKm).sort((a, b) => b.standKm - a.standKm)) {
        const body = S0.label[j.peak];
        if (body >= 0 && room[body] > 0) { room[body]--; seeds.add(j.peak); }
    }
    const S = divideAtNecks(mesh, sea, { neck: C.sea.neck, minKm2: C.sea.minKm2, cellKm2, seeds });
    const seaOf = new Int16Array(n).fill(-1);
    for (let c = 0; c < n; c++) if (sea[c] && S.label[c] >= 0) seaOf[c] = S.label[c];
    const seas = S.bodies.map(b => ({ id: b.id, kind: b.km2 >= C.oceanKm2 ? 'ocean' : 'sea', km2: b.km2, peak: b.peak, depthKm: b.depthKm }));

    return { land, continentOf, mainland, seaOf, continents, seas, landKm2: landCells * cellKm2, seaKm2: (n - landCells) * cellKm2 };
}

/** A cell's latitude and longitude (degrees) on a mesh whose z is north. */
export function latLonOf(mesh, c) {
    const x = mesh.xyz[3 * c], y = mesh.xyz[3 * c + 1], z = mesh.xyz[3 * c + 2];
    return [Math.asin(Math.max(-1, Math.min(1, z))) * 180 / Math.PI, Math.atan2(y, x) * 180 / Math.PI];
}
