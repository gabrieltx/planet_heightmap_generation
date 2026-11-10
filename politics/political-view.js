// The fork's Political view (FORK.md S1–S4), a page layer on the shared planet view as Generate's Plates are
// (js/generate-plates.js). Two pictures of one world:
//   · CONTINENTS — each continent in one of the categorical eight (docs/style-guide/maps.md: which kind), its islands
//     with it; where a continent has two cultures, the eastern one's side paler. The continents and the waters named.
//   · COUNTRIES — each country in one of the same eight, no two neighbours alike (a political map's colouring: the hue
//     tells neighbours apart, the name says who), a dark line along every border, the one picked lit. The countries and
//     the waters named.
// The sea is quiet in both, a pale line where one ocean or sea meets the next. Before the names are made, the continents
// and waters are numbered, biggest first. Colours per cell of the page's mesh (the planet view paints them), names on the
// picture's equirectangular canvas. `pol`: the world's political state (politics.js politicsOf).

import { latLonOf } from './lands.js';
import { cultureName } from './names.js';

// ── the look's values, from tokens.css ──
let TOKENS = null;
function tokens() {
    if (TOKENS) return TOKENS;
    const css = getComputedStyle(document.documentElement), get = (name) => css.getPropertyValue(`--${name}`).trim();
    const rgb = (name) => { const h = get(name).replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const sea = rgb('map-sea'), paper = rgb('map-paper');
    return (TOKENS = { seaLine: sea.map((v, i) => Math.round(0.62 * v + 0.38 * paper[i])), cat: [1, 2, 3, 4, 5, 6, 7, 8].map(i => rgb(`cat-${i}`)), sea, paper, label: get('map-label'), halo: get('map-halo'),
        display: get('font-display'), ui: get('font-ui') });
}
/** A continent's colour (sRGB), for the panel's swatches. */
export const continentRgb = (id) => tokens().cat[id % 8];

export const million = (km2) => { const m = km2 / 1e6; return `${m >= 100 ? Math.round(m) : m >= 0.1 ? m.toFixed(1) : m.toFixed(2)} million km²`; };
const people = (p) => (p >= 1e6 ? `${(p / 1e6).toFixed(p >= 1e7 ? 0 : 1)} million` : `${Math.max(1, Math.round(p / 1e3))} thousand`);
/** A place's name: the one made or written, else numbered, biggest first. */
export const continentName = (pol, k) => pol.names?.continents[k.id] ?? `Continent ${k.id + 1}`;
export const seaName = (pol, s) => pol.names?.seas[s.id] ?? (s.kind === 'ocean' ? `Ocean ${s.id + 1}` : `Sea ${s.id + 1 - pol.F.seas.filter(x => x.kind === 'ocean').length}`);
export const countryName = (pol, k) => pol.names?.countries[k.id] ?? `Country ${k.id + 1}`;

/** Each cell's colour on the Political view (sRGB, 3 a cell) into `out`, shaded by the relief; true when it painted. */
export function politicalColors(mesh, pol, out, shade) {
    const { F, P } = pol, T = tokens(), { adjOffset, adjList } = mesh, n = mesh.numCells, byCountry = pol.show === 'countries' && P;
    const pale = (rgb) => rgb.map((v, i) => Math.round(0.62 * v + 0.38 * T.paper[i]));
    const picked = pol.picked?.kind === 'country' ? pol.picked.id : -1;
    for (let c = 0; c < n; c++) {
        let rgb, k;
        if (F.land[c]) {
            k = 0.5 + 0.5 * shade[c];
            const o = P ? P.countryOf[c] : -1;
            if (byCountry && o >= 0) {
                rgb = T.cat[P.countries[o].colour];
                if (o === picked) rgb = pale(rgb);
                // (the border: the cells on it darker, a line a cell wide on each side)
                for (let i = adjOffset[c]; i < adjOffset[c + 1]; i++) { const q = P.countryOf[adjList[i]]; if (q >= 0 && q !== o) { k *= 0.5; break; } }
            } else {
                rgb = F.continentOf[c] >= 0 ? T.cat[F.continentOf[c]] : T.paper;
                if (o >= 0 && pol.side?.get(o) === 1) rgb = pale(rgb);          // (a second culture's side)
            }
        } else {
            rgb = T.sea; k = 0.8 + 0.2 * shade[c];
            // (where one ocean or sea meets the next: a pale line, a cell wide on each side)
            const s = F.seaOf[c];
            if (s >= 0) for (let i = adjOffset[c]; i < adjOffset[c + 1]; i++) { const q = F.seaOf[adjList[i]]; if (q >= 0 && q !== s) { rgb = T.seaLine; k = 1; break; } }
        }
        for (let j = 0; j < 3; j++) out[3 * c + j] = Math.min(255, rgb[j] * k);
    }
    return true;
}

/** The names over the picture (W px wide, equirectangular): the waters', and the continents' or the countries'. */
export function drawPoliticalNames(ctx, W, mesh, pol, onGlobe = true) {
    const { F, P } = pol, T = tokens(), H = W >> 1, unit = W / 2048, kmPerPx = 40075 / W;
    const write = (text, cell, px, { italic = false, fitKm = 0 } = {}) => {
        const [lat, lon] = latLonOf(mesh, cell), x = (lon + 180) / 360 * W, y = (90 - lat) / 180 * H, cos = Math.max(0.05, Math.cos(lat * Math.PI / 180));
        // (on the globe a parallel is shorter toward the poles: the name drawn wider there, to read true)
        const stretch = onGlobe ? Math.min(2.5, 1 / cos) : 1;
        const font = (size) => `${italic ? 'italic ' : ''}600 ${Math.round(size * unit)}px ${size >= 20 ? T.display : T.ui}`;
        ctx.font = font(px);
        if (fitKm) {
            // (a country's name: as big as its land has room for across, or left to the readout)
            const room = fitKm / kmPerPx / (onGlobe ? 1 : cos), wide = ctx.measureText(text).width;
            if (wide > room) { px = Math.floor(px * room / wide); if (px < 11) return; ctx.font = font(px); }
        }
        const half = ctx.measureText(text).width * stretch / 2;
        for (const dx of [0, x - half < 0 ? W : null, x + half > W ? -W : null]) {
            if (dx === null) continue;
            ctx.save(); ctx.translate(x + dx, y); ctx.scale(stretch, 1);
            ctx.lineWidth = Math.max(2, px / 6) * unit; ctx.strokeStyle = T.halo; ctx.strokeText(text, 0, 0);
            ctx.fillStyle = T.label; ctx.fillText(text, 0, 0);
            ctx.restore();
        }
    };
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const s of F.seas) write(seaName(pol, s), s.peak, s.kind === 'ocean' ? 24 : 20, { italic: true });
    if (pol.show === 'countries' && P) for (const k of P.countries) write(countryName(pol, k), k.middle, 22, { fitKm: 1.1 * Math.sqrt(k.km2) });
    else for (const k of F.continents) write(continentName(pol, k), k.peak, 26);
    ctx.restore();
}

/** The view's legend. */
export function politicalLegendHTML(pol) {
    const { F, P } = pol, T = tokens(), oceans = F.seas.filter(s => s.kind === 'ocean').length, seas = F.seas.length - oceans;
    const count = (n, one, many) => `${n} ${n === 1 ? one : many}`, waters = `${count(oceans, 'ocean', 'oceans')}${seas ? ` and ${count(seas, 'sea', 'seas')}` : ''}`;
    const cultures = (k) => (pol.cultures[k.id] ?? []).filter(Boolean).map(cultureName).join(' and ');
    if (pol.show === 'countries' && P)
        return `<div class="evo-legend-head">Political: ${count(P.countries.length, 'country', 'countries')} on ${count(F.continents.length, 'continent', 'continents')}; neighbours in different colours, a dark line along each border</div><div class="evo-koppen">` +
            F.continents.map(k => `<span>${continentName(pol, k)}: ${P.countries.filter(c => c.continent === k.id).length}, ${cultures(k)}</span>`).join('') + '</div>';
    return `<div class="evo-legend-head">Political: ${count(F.continents.length, 'continent', 'continents')}, each with its islands; ${waters}, a pale line between them</div><div class="evo-koppen">` +
        F.continents.map(k => `<span><i style="background:rgb(${T.cat[k.id].join(',')})"></i>${continentName(pol, k)}${pol.names ? `: ${cultures(k)}` : ''}</span>`).join('') + '</div>';
}

/** What is at cell `c`: { kind: 'country' | 'continent' | 'sea', id } (or null). */
export function placeAt(pol, c) {
    const { F, P } = pol;
    if (F.land[c]) {
        if (pol.show === 'countries' && P && P.countryOf[c] >= 0) return { kind: 'country', id: P.countryOf[c] };
        return F.continentOf[c] >= 0 ? { kind: 'continent', id: F.continentOf[c] } : null;
    }
    return F.seaOf[c] >= 0 ? { kind: 'sea', id: F.seaOf[c] } : null;
}

/** The readout's lines for the place under the pointer (`c`: its cell). */
export function politicalReadout(pol, c) {
    const { F, P } = pol, lines = [];
    if (F.land[c]) {
        const o = P ? P.countryOf[c] : -1, k = F.continents[F.continentOf[c]];
        if (o >= 0) {
            const q = P.countries[o];
            lines.push(`<span class="hi-label">Country</span> ${countryName(pol, q)} · ${cultureName(pol.cultureOf(q))} · ${million(q.km2)}${pol.fed ? ` · its land could feed ${people(q.people)}` : ''}`);
        }
        if (k) lines.push(`<span class="hi-label">Continent</span> ${continentName(pol, k)}${F.mainland[c] ? '' : ' (an island of it)'} · ${million(k.km2 + k.islandsKm2)}`);
    } else {
        const s = F.seas[F.seaOf[c]];
        if (s) lines.push(`<span class="hi-label">${s.kind === 'ocean' ? 'Ocean' : 'Sea'}</span> ${seaName(pol, s)} · ${million(s.km2)}`);
    }
    return lines;
}
