// The finish (Evolution's: v2/js/finish/finish.js) run in this thread on a Generate world, as the page's finish worker
// runs it (v2/js/finish/finish-worker.js) — for the checks that need its rivers and its food. Import this only after the
// Delaunator redirect is registered (see check-countries.mjs).

import { finishPlanet, finishRaster } from '../../v2/js/finish/finish.js';
import { FINISH } from '../../v2/js/finish/finish-config.js';
import { terrainConfig } from '../../v2/js/terrain/terrain-config.js';
import { meshFromArrays } from '../../v2/js/core/sim-mesh.js';

/** `shared`: the worker's message's `shared` (mesh, finish job). @returns {{ fin: object, ms: number }} as the page's world holds it (fin.raster, fin.climate, fin.rivers). */
export async function finishWorld(shared, width = 1024) {
    const job = shared.finish, sim = meshFromArrays(job.simMesh), mesh = meshFromArrays(shared.mesh), t0 = performance.now();
    const quiet = console.log; console.log = () => {};
    let out;
    try {
        out = await finishPlanet({ frame: job.frame, simMesh: sim, seed: job.seed, cells: mesh.numCells, mesh, surface: () => job.surface,
            cfg: terrainConfig(job.terrain), F: { ...FINISH, ...job.finish } });
    } finally { console.log = quiet; }
    const raster = finishRaster(out.mesh, out.z, out.ocean, width, null, out.lake, out.lakeLevel, out.climate.cell, out.geology, out.farming);
    const climate = { ...out.climate.page, raster: raster.climate };
    delete raster.climate;
    return { fin: { cells: mesh.numCells, raster, rivers: out.rivers, climate, stats: out.stats }, ms: performance.now() - t0 };
}
