// The fork's political layer on a page (FORK.md): what the page's hooks call. Today (S0, S1): a Political tab on the
// layer bar, showing the world's continents and oceans (political-view.js, from lands.js). The page keeps its own world
// and loop; this adds a layer to them, as Generate's Plates are one. Each hook in an upstream file is marked `// fork:`.

import { politicalColors, drawPoliticalNames, politicalLegendHTML, politicalReadout } from './political-view.js';

export const POLITICAL = 'political';
const TIP = 'The world’s continents, each with its islands, and its oceans and seas. Numbered for now, biggest first: their names, the countries and their borders come next';

/**
 * The Political tab added to the layer bar (after mountLayerBar and the planet view are made), and the layer's parts for
 * the page's hooks. `pv`: the page's PlanetView; `repaint()`: asks the page to paint its picture again.
 */
export function mountPolitics({ pv, repaint = () => {} }) {
    const tabs = document.getElementById('mapTabs'), phone = document.getElementById('mobileViewSwitch');
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
    document.getElementById('viewMode')?.addEventListener('change', () => { if (pv.view.layer === POLITICAL) repaint(); });
    return {
        /** The layer's colours per cell (true when the layer is this one). */
        cells: (layer, w, out, shade) => layer === POLITICAL && politicalColors(w, out, shade),
        /** Its names over the picture. */
        lines: (ctx, W, view, w) => { if (view.layer === POLITICAL && w) drawPoliticalNames(ctx, W, w, view.mode !== 'map'); },
        /** What its lines depend on (the page's overlay is drawn again when this changes). */
        linesKey: (view) => (view.layer === POLITICAL ? `political|${view.mode}` : ''),
        /** Its legend into `el` (true when the layer is this one). */
        legend: (layer, w, el) => { if (layer !== POLITICAL) return false; if (el.dataset.key !== `political|${w.version}`) { el.innerHTML = politicalLegendHTML(w); el.dataset.key = `political|${w.version}`; } return true; },
        /** The readout's line for cell `c`, on this layer (or null). */
        readout: (layer, w, c) => (layer === POLITICAL ? politicalReadout(w, c) : null),
    };
}
