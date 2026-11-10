// The fork's Political view (FORK.md S1), a page layer on the shared planet view as Generate's Plates are
// (js/generate-plates.js): each continent in one of the categorical eight (docs/style-guide/maps.md: which kind), its
// islands with it; the sea quiet, a pale line where one ocean or sea meets the next; every continent, ocean and sea
// named at its middle. Until the names are made (S4) they are numbered, biggest first. Colours per cell of the page's
// mesh (the planet view paints them), names on the picture's equirectangular canvas.

import { findLands, latLonOf } from './lands.js';

/** A world's continents and oceans, found once and kept on it (`w`: the page's world: { tMesh, heightKm }). */
export function landsOf(w, seaLevelKm = 0) { return (w._lands ??= findLands(w.tMesh, w.heightKm, { seaLevelKm })); }

// ── the look's values, from tokens.css ──
let TOKENS = null;
function tokens() {
    if (TOKENS) return TOKENS;
    const css = getComputedStyle(document.documentElement), get = (name) => css.getPropertyValue(`--${name}`).trim();
    const rgb = (name) => { const h = get(name).replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const sea = rgb('map-sea'), paper = rgb('map-paper');
    return (TOKENS = { seaLine: sea.map((v, i) => Math.round(0.62 * v + 0.38 * paper[i])), cat: [1, 2, 3, 4, 5, 6, 7, 8].map(i => rgb(`cat-${i}`)), sea: rgb('map-sea'), paper: rgb('map-paper'), label: get('map-label'), halo: get('map-halo'), font: get('font-display') });
}

const million = (km2) => { const m = km2 / 1e6; return `${m >= 100 ? Math.round(m) : m.toFixed(1)} million km²`; };
/** A place's name: numbered, biggest first, until the names are made (FORK.md S4). */
export const continentName = (k) => `Continent ${k.id + 1}`;
export const seaName = (s, F) => (s.kind === 'ocean' ? `Ocean ${s.id + 1}` : `Sea ${s.id + 1 - F.seas.filter(x => x.kind === 'ocean').length}`);

/** Each cell's colour on the Political view (sRGB, 3 a cell) into `out`, shaded by the relief; true when it painted. */
export function politicalColors(w, out, shade) {
    const F = landsOf(w), T = tokens(), { adjOffset, adjList } = w.tMesh, n = w.tMesh.numCells;
    for (let c = 0; c < n; c++) {
        let rgb, k;
        if (F.land[c]) { rgb = F.continentOf[c] >= 0 ? T.cat[F.continentOf[c]] : T.paper; k = 0.5 + 0.5 * shade[c]; }
        else {
            rgb = T.sea; k = 0.8 + 0.2 * shade[c];
            // (where one ocean or sea meets the next: a pale line, a cell wide on each side)
            const s = F.seaOf[c];
            if (s >= 0) for (let i = adjOffset[c]; i < adjOffset[c + 1]; i++) { const q = F.seaOf[adjList[i]]; if (q >= 0 && q !== s) { rgb = T.seaLine; k = 1; break; } }
        }
        for (let j = 0; j < 3; j++) out[3 * c + j] = Math.min(255, rgb[j] * k);
    }
    return true;
}

/** The names over the picture (W px wide, equirectangular): each continent's, ocean's and sea's at its middle. */
export function drawPoliticalNames(ctx, W, w, onGlobe = true) {
    const F = landsOf(w), T = tokens(), H = W >> 1, unit = W / 2048;
    const write = (text, cell, px, italic) => {
        const [lat, lon] = latLonOf(w.tMesh, cell), x = (lon + 180) / 360 * W, y = (90 - lat) / 180 * H;
        // (on the globe a parallel is shorter toward the poles: the name drawn wider there, to read true)
        const stretch = onGlobe ? Math.min(2.5, 1 / Math.max(0.05, Math.cos(lat * Math.PI / 180))) : 1;
        ctx.font = `${italic ? 'italic ' : ''}600 ${Math.round(px * unit)}px ${T.font}`;
        const half = ctx.measureText(text).width * stretch / 2;
        for (const dx of [0, x - half < 0 ? W : null, x + half > W ? -W : null]) {
            if (dx === null) continue;
            ctx.save(); ctx.translate(x + dx, y); ctx.scale(stretch, 1);
            ctx.lineWidth = 4 * unit; ctx.strokeStyle = T.halo; ctx.strokeText(text, 0, 0);
            ctx.fillStyle = T.label; ctx.fillText(text, 0, 0);
            ctx.restore();
        }
    };
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const s of F.seas) write(seaName(s, F), s.peak, s.kind === 'ocean' ? 24 : 20, true);
    for (const k of F.continents) write(continentName(k), k.peak, 26, false);
    ctx.restore();
}

/** The view's legend: a row a continent (at most eight), the oceans and seas in words. */
export function politicalLegendHTML(w) {
    const F = landsOf(w), T = tokens(), oceans = F.seas.filter(s => s.kind === 'ocean').length, seas = F.seas.length - oceans;
    const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    return `<div class="evo-legend-head">Political: ${count(F.continents.length, 'continent', 'continents')}, each with its islands; ${count(oceans, 'ocean', 'oceans')}${seas ? ` and ${count(seas, 'sea', 'seas')}` : ''}, a pale line between them</div><div class="evo-koppen">` +
        F.continents.map(k => `<span><i style="background:rgb(${T.cat[k.id].join(',')})"></i>${continentName(k)}</span>`).join('') + '</div>';
}

/** The readout's line for the place under the pointer (`c`: its cell). */
export function politicalReadout(w, c) {
    const F = landsOf(w);
    if (F.land[c]) {
        const k = F.continents[F.continentOf[c]];
        return k ? `<span class="hi-label">Continent</span> ${continentName(k)}${F.mainland[c] ? '' : ' (an island of it)'} · ${million(k.km2 + k.islandsKm2)}` : null;
    }
    const s = F.seas[F.seaOf[c]];
    return s ? `<span class="hi-label">${s.kind === 'ocean' ? 'Ocean' : 'Sea'}</span> ${seaName(s, F)} · ${million(s.km2)}` : null;
}
