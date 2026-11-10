// The fork's political layer on a page (FORK.md S0–S4): what the page's hooks call. A Political tab on the layer bar
// and a Political section in the side panel:
//   · the world's continents, oceans and seas (lands.js), found from its ground as soon as it appears;
//   · each continent's cultures — one or two of nine (names.js), set at random at first, the player's to change;
//   · its countries (countries.js), generated on the button once the world is finished (they are set where its land
//     could feed the most people: the finish's food) — as many as the slider asks;
//   · every name (names.js), in its culture's style, made with the countries; a place clicked on the map can be renamed,
//     and a name written by the player is kept when the others are made again.
// What the player chose is kept in the browser, by planet code: the cultures, the number of countries, the names
// written and how often the names were made again. Everything else is found again from the world, the same each time.
// The page keeps its own world and loop; each hook in an upstream file is marked `// fork:`.

import { findLands } from './lands.js';
import { makeCountries, divideContinent, peoplePerCell, peopleGuess, rngOf, COUNTRIES } from './countries.js';
import { CULTURES, makeNames } from './names.js';
import { politicalColors, drawPoliticalNames, politicalLegendHTML, politicalReadout, placeAt, continentRgb, continentName, seaName, countryName, million } from './political-view.js';

export const POLITICAL = 'political';
const TIP = 'The world’s continents, oceans and seas, the cultures of its continents and its countries. Set them up under Political in the side panel';
const KEY = 'orogen.fork.politics.';
const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(KEY + k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* (kept only where the browser allows) */ } } };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Each continent's cultures at first: one each, no two alike while there are cultures left, drawn by the world's seed. */
function firstCultures(F, seed) {
    const rng = rngOf(seed * 131 + 7), ids = CULTURES.map(c => c.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return F.continents.map((k, i) => [ids[i % ids.length], null]);
}

/**
 * The Political tab and section added to the page (after mountLayerBar and the planet view are made), and the layer's
 * parts for the page's hooks. `pv`: the page's PlanetView; `world()`: the page's world now ({ tMesh, heightKm, seed,
 * version, fin }); `code()`: its planet code; `repaint()`: asks the page to paint its picture again.
 */
export function mountPolitics({ pv, world = () => null, code = () => '', repaint = () => {} }) {
    const $ = (id) => document.getElementById(id);
    // ── the tab, on the bar and in the phone's list ──
    const tabs = $('mapTabs'), phone = $('mobileViewSwitch');
    if (tabs && !tabs.querySelector(`[data-layer="${POLITICAL}"]`)) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'map-tab'; b.dataset.layer = POLITICAL; b.textContent = 'Political'; b.title = TIP; b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => pv.setLayer(POLITICAL));
        tabs.append(b);
    }
    if (phone && !phone.querySelector(`option[value="${POLITICAL}"]`)) {
        const o = document.createElement('option');
        o.value = POLITICAL; o.textContent = 'Political';
        (phone.querySelector('option[value="plates"]') ?? phone.firstElementChild).after(o);
    }
    // (the names are drawn for the globe or for the map: painted again when the one becomes the other)
    $('viewMode')?.addEventListener('change', () => { if (pv.view.layer === POLITICAL) repaint(); });

    // ── a world's political state, kept on it: what is found from it, and what the player chose (saved by its code) ──
    function politicsOf(w) {
        if (w._pol) return w._pol;
        const F = findLands(w.tMesh, w.heightKm), saved = store.get(code()) ?? {};
        const cultures = F.continents.map((k, i) => { const s = saved.cultures?.[i]; return Array.isArray(s) && CULTURES.some(c => c.id === s[0]) ? [s[0], CULTURES.some(c => c.id === s[1]) && s[1] !== s[0] ? s[1] : null] : null; });
        const first = firstCultures(F, w.seed);
        const pol = { F, P: null, side: null, names: null, fed: false, show: 'continents', picked: null, version: 0,
            cultures: cultures.map((c, i) => c ?? first[i]), count: Math.min(COUNTRIES.max, Math.max(COUNTRIES.min, saved.count ?? COUNTRIES.default)),
            made: !!saved.made, salt: saved.salt ?? 0, fixed: saved.names ?? {}, key: code() };
        pol.cultureOf = (k) => { const [a, b] = pol.cultures[k.continent] ?? []; return b && pol.side?.get(k.id) === 1 ? b : a; };
        return (w._pol = pol);
    }
    const save = (pol) => store.set(pol.key, { v: 1, cultures: pol.cultures, count: pol.count, made: pol.made, salt: pol.salt, names: pol.fixed });
    const changed = (pol) => { pol.version++; repaint(); };

    /** The sides of the continents with two cultures, and every name, made again (the names written kept). */
    function rename(w, pol) {
        if (!pol.P) return;
        pol.side = new Map();
        pol.F.continents.forEach((k) => { if (pol.cultures[k.id]?.[1]) for (const [id, s] of divideContinent(w.tMesh, pol.F, pol.P, k.id)) pol.side.set(id, s); });
        pol.names = makeNames(w.tMesh, pol.F, pol.P, { seed: w.seed, salt: pol.salt, cultureOf: pol.cultureOf, continentCulture: (id) => pol.cultures[id][0], fixed: pol.fixed });
    }
    /** The world's countries generated, with their names. */
    function generate(w, pol) {
        const fed = w.fin ? peoplePerCell(w.tMesh, w.fin.raster) : null;
        pol.fed = !!fed;
        pol.P = makeCountries(w.tMesh, w.heightKm, pol.F, fed ?? peopleGuess(w.tMesh, w.heightKm), { count: pol.count, seed: w.seed });
        pol.made = true; pol.show = 'countries'; pol.picked = null;
        rename(w, pol);
        save(pol); changed(pol);
    }

    // ── the section in the side panel ──
    if (!document.querySelector('link[data-politics]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./politics.css', import.meta.url).href; l.dataset.politics = '1'; document.head.append(l); }
    const section = document.createElement('details');
    section.className = 'section is-plates'; section.id = 'politicalSection';
    section.innerHTML = `<summary>Political <span class="tip" data-tip="Turn the planet into a world of countries: give each continent one or two cultures, generate the countries, and rename anything. The cultures set the style of the names">?</span></summary>
        <div class="section-body" id="polBody"></div>`;
    ($('statsDetails') ?? $('exportBtn'))?.before(section);
    const body = section.querySelector('#polBody');
    section.addEventListener('toggle', () => { if (section.open && pv.view.layer !== POLITICAL) pv.setLayer(POLITICAL); });

    function render() {
        const w = world();
        if (!w) { body.innerHTML = '<div class="pol-hint">The planet is being built.</div>'; return; }
        const pol = politicsOf(w), { F } = pol, ready = !!w.fin || !!w.problem;
        const opts = (sel, none) => (none ? `<option value=""${sel ? '' : ' selected'}>No second culture</option>` : '') + CULTURES.map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
        const p = pol.picked, pickedName = !p ? '' : p.kind === 'country' ? countryName(pol, pol.P.countries[p.id]) : p.kind === 'continent' ? continentName(pol, F.continents[p.id]) : seaName(pol, F.seas[p.id]);
        const pickedWhat = !p ? '' : p.kind === 'country' ? `A country of ${continentName(pol, F.continents[pol.P.countries[p.id].continent])} · ${million(pol.P.countries[p.id].km2)}` : p.kind === 'continent' ? 'A continent' : F.seas[p.id].kind === 'ocean' ? 'An ocean' : 'A sea';
        body.innerHTML = `
            <div class="pol-seg"><div class="vs-seg" role="group" aria-label="What the Political view shows">
                <button type="button" data-show="continents" class="${pol.show === 'continents' ? 'active' : ''}" aria-pressed="${pol.show === 'continents'}">Continents</button>
                <button type="button" data-show="countries" class="${pol.show === 'countries' ? 'active' : ''}" aria-pressed="${pol.show === 'countries'}"${pol.P ? '' : ' disabled'}>Countries</button>
            </div></div>
            <div class="pol-hint">Each continent’s cultures, one or two. With two, the continent is divided along its hardest ground to cross: the first culture takes the west, the second the east.</div>
            ${F.continents.map(k => `<div class="pol-continent">
                <div class="pol-continent-name"><i class="pol-swatch" style="background:rgb(${continentRgb(k.id).join(',')})"></i>${esc(continentName(pol, k))}</div>
                <div class="pol-pair">
                    <select data-continent="${k.id}" data-slot="0" aria-label="${esc(continentName(pol, k))}: culture">${opts(pol.cultures[k.id][0], false)}</select>
                    <select data-continent="${k.id}" data-slot="1" aria-label="${esc(continentName(pol, k))}: second culture">${opts(pol.cultures[k.id][1], true)}</select>
                </div></div>`).join('')}
            <div class="cg">
                <label for="polCount">Countries <span class="v" id="polCountV">${pol.count}</span></label>
                <input type="range" id="polCount" min="${COUNTRIES.min}" max="${COUNTRIES.max}" step="1" value="${pol.count}">
                <div class="slider-hint"><span>Few, large</span><span>Many, small</span></div>
            </div>
            <div class="pol-actions">
                <button type="button" class="og-btn" id="polMake"${ready ? '' : ' disabled'}>${pol.P ? 'Generate countries again' : 'Generate countries'}</button>
                ${ready ? '' : '<div class="pol-hint">Ready once the planet is finished: the countries are set where its land could feed the most people.</div>'}
                <button type="button" class="og-btn og-btn--quiet" id="polNames"${pol.P ? '' : ' disabled'}>Make new names</button>
            </div>
            <div class="pol-picked">${p ? `<label for="polName">Name</label><input type="text" id="polName" maxlength="40" autocomplete="off" spellcheck="false" value="${esc(pickedName)}">
                <div class="pol-hint">${esc(pickedWhat)}. A name you write is kept when new names are made.</div>` : `<div class="pol-hint">${pol.P ? 'Click a country, a continent or a sea on the map to rename it.' : 'Once the countries are generated, click any place on the map to rename it.'}</div>`}</div>`;
    }
    body.addEventListener('click', (e) => {
        const w = world(), pol = w && politicsOf(w);
        if (!pol) return;
        const show = e.target.closest('[data-show]');
        if (show && !show.disabled) { pol.show = show.dataset.show; pol.picked = null; changed(pol); render(); return; }
        if (e.target.closest('#polMake') && !e.target.closest('#polMake').disabled) { generate(w, pol); if (pv.view.layer !== POLITICAL) pv.setLayer(POLITICAL); render(); return; }
        if (e.target.closest('#polNames') && pol.P) { pol.salt++; rename(w, pol); save(pol); changed(pol); render(); }
    });
    body.addEventListener('change', (e) => {
        const w = world(), pol = w && politicsOf(w), t = e.target;
        if (!pol) return;
        if (t.dataset.continent !== undefined) {
            const k = +t.dataset.continent, slot = +t.dataset.slot, pair = pol.cultures[k];
            pair[slot] = t.value || null;
            if (pair[1] === pair[0]) pair[1] = null;                        // (the same twice is one)
            if (pol.P) rename(w, pol);
            save(pol); changed(pol); render();
        } else if (t.id === 'polName' && pol.picked) {
            const p = pol.picked, key = p.kind === 'country' ? `country:${pol.P.countries[p.id].capital}` : `${p.kind}:${p.id}`, v = t.value.trim();
            if (v) pol.fixed[key] = v; else delete pol.fixed[key];           // (emptied: its made name again)
            if (pol.P) rename(w, pol);
            save(pol); changed(pol); render();
        }
    });
    body.addEventListener('input', (e) => {
        if (e.target.id !== 'polCount') return;
        const w = world(), pol = w && politicsOf(w);
        if (!pol) return;
        pol.count = +e.target.value; $('polCountV').textContent = pol.count; save(pol);
    });

    // ── a place clicked on the Political view: picked, to rename ──
    for (const el of [pv.ui.canvas, pv.ui.map]) {
        let down = null;
        el.addEventListener('pointerdown', (e) => { down = e.button === 0 && !e.ctrlKey && !e.metaKey && pv.view.layer === POLITICAL ? { x: e.clientX, y: e.clientY } : null; });
        el.addEventListener('pointerup', (e) => {
            const w = world();
            if (!down || !w || Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6) { down = null; return; }
            down = null;
            const p = pv.placeUnder(e), pol = politicsOf(w);
            if (!p || !pol.names) return;
            pol.picked = placeAt(pol, pv.cellUnder(w.tMesh, p));
            changed(pol); render();
            if (!section.open) section.open = true;
        });
    }
    body.innerHTML = '<div class="pol-hint">The planet is being built.</div>';   // (the page's world is not there to ask yet)

    return {
        /** The page's world is new, or its finish came: the section drawn again; the countries of a world set up before, made again. */
        worldChanged() {
            const w = world();
            if (w) { const pol = politicsOf(w); if (pol.made && !pol.P && (w.fin || w.problem)) generate(w, pol); }
            render();
        },
        /** The layer's colours per cell (true when the layer is this one). */
        cells: (layer, w, out, shade) => layer === POLITICAL && politicalColors(w.tMesh, politicsOf(w), out, shade),
        /** Its names over the picture. */
        lines: (ctx, W, view, w) => { if (view.layer === POLITICAL && w) drawPoliticalNames(ctx, W, w.tMesh, politicsOf(w), view.mode !== 'map'); },
        /** What its lines depend on (the page's overlay is drawn again when this changes). */
        linesKey: (view, w) => (view.layer === POLITICAL && w ? `political|${view.mode}|${politicsOf(w).version}|${politicsOf(w).show}` : ''),
        /** Its legend into `el` (true when the layer is this one). */
        legend: (layer, w, el) => { if (layer !== POLITICAL) return false; const pol = politicsOf(w), key = `political|${w.version}|${pol.version}|${pol.show}`; if (el.dataset.key !== key) { el.innerHTML = politicalLegendHTML(pol); el.dataset.key = key; } return true; },
        /** The readout's lines for cell `c`, on this layer (or none). */
        readout: (layer, w, c) => (layer === POLITICAL ? politicalReadout(politicsOf(w), c) : []),
    };
}
