# This fork

This repository is a fork of [raguilar011095/planet_heightmap_generation](https://github.com/raguilar011095/planet_heightmap_generation)
(World Orogen, GPL-3.0). Upstream builds the **ground**: plates and their history, the land, its climate, its water and
ice, its rocks and what the land could feed. This fork's goal is to turn it into a **gamified world builder**: upstream's
geology, plus a **political layer** of settlements, states and borders that the player builds and plays with.

`VISION.md` is upstream's vision and stays upstream's. This file is the fork's. Where they disagree, the fork's
political and game layers follow this file, and everything upstream ships follows `VISION.md`.

## Strategy: follow upstream for the ground, own the layers above it

Decided on 2026-11-10, after comparing the fork (then frozen at upstream's 3 March 2026 commit, `721d9b1`, ~v0.3.5)
with upstream v3.0.1:

- **The fork tracks upstream `main` for all geo work.** It was rebased (fast-forwarded) onto v3.0.1. Upstream ships
  about weekly, with a deep, tested geo stack: Generate, Import, Evolution, rivers, ice, geology, food. Re-implementing
  or hand-porting that would cost far more than it gives.
- **The fork owns the political and game layers.** Upstream deliberately stops at "what the land allows, not what its
  people are" (`VISION.md`, Scope), and names a downstream tool that "takes the farmland and simulates who settles it"
  as a use of its layers. That downstream tool is this fork.
- **No cherry-picking of upstream's history.** Upstream's v1 PRs all rewrite the same files (`js/elevation.js` in
  almost every one), so picking pieces means hand-ports and conflicts. Following `main` whole is cheaper and gets every
  fix.

### Why not keep the old v1 code (the measurements)

Headless Node runs of the generation pipeline. Default sliders, seeds 1–3, 204K cells (the default Detail), this
session's container:

| | Fork (`721d9b1`) | Upstream after #44 (Apr) | Upstream end of v1 (#54, Jul) |
|---|---|---|---|
| Total (terrain + climate) | 6.7 s | 10.5 s | 11.1 s |
| Wind: the ITCZ step | 0.09 s | 1.99 s | 1.97 s |
| Peak memory | 304 MB | 437 MB | 367 MB |
| Köppen classes present | 22–27 | 26–29 | 30–31 |

- Upstream's v1 line was slower at every stage, with no stage faster, but it looked better: a varied ocean floor
  without the web of plate seams, and a richer climate. Hand-porting its looks onto the old code would have been the
  "fast fork" option.
- The v3 Generate replaced all of that. Upstream's own audit (`plans/audits/PERFORMANCE_AUDIT.md`, on a fast desktop)
  measures the first picture at 4.8 s at 204K. The full finish (climate, rivers, satellite, geology, food) follows in
  the background, about 10 s later. On that basis the old code's 6.7 s holds no clear speed advantage worth a fork that
  can't take upstream's work.

## Keeping in sync with upstream

```bash
git remote add upstream https://github.com/raguilar011095/planet_heightmap_generation.git   # once
git fetch upstream main
git merge upstream/main          # never rebase published history
```

To keep merges trivial:

- **Fork code lives in its own files.** Political and game code goes under `politics/`, its own folder at the root,
  never inside `js/` or `v2/`.
- **Upstream files are touched only at hook points**: registering a layer, a view, a tab, a save-file field. Each touch
  carries a `// fork:` comment, so a conflict is easy to find and re-apply.
- **Read upstream's data, never change it.** The political layer is a pure consumer of a finished world (see the
  contract below). If it needs something upstream doesn't expose, add a small exported accessor at a hook point rather
  than editing upstream's algorithms.
- **Never commit `CNAME` changes.** Keep the fork's GitHub Pages and release flow off unless the fork gets its own domain.
  The upstream `CNAME` points at `orogen.studio`, and `.github/workflows/deploy.yml` deploys on a published release.

## The layer contract (what the political layer reads)

Once a world is finished, upstream's finish provides, per cell or per pixel:

- **Ground**: elevation, sea and coast, slope.
- **Water**: rivers (with discharge) and lakes. Used for navigation, borders and city sites.
- **Climate**: the twelve months, and Köppen zones.
- **Food** (`v2/js/farming/`):
  - farmland, soil, growing season and staple crop (`farming.js`)
  - pre-industrial people per km² (`people.js`)
  - way of life: farming, herding or gathering (`living.js`)
- **Geology** (`v2/js/geology/`): rocks, ores and gems (deposits). Used for strategic resources.

## Roadmap for the political and game layers

**Existing work to bring in:** `orogen-map-editor.html` already does border drawing and area naming. It is a standalone
editor that works on World Orogen PNG exports (heightmap, land mask, satellite, climate) of the planet with seed
`0budfia1fa0sgsdyq7`, and sits in the owner's claude.ai "World Building" project with a locations reference PDF. It
has never been in git. Once it's added to the repo, P0–P3 below should start from it instead of from scratch.

Scoped with the owner on 2026-11-10. The political layer starts as the game's **setup phase**: the "new game" flow
that turns a generated planet into a named, bordered world with the player's country chosen. What the game is after
setup (turns with economy and expansion, or a sandbox) is still open and is decided before S6.

Each step must stand on its own and follow upstream's pillars and rules: looks first, mobile-friendly, and scale
invariance (physical units such as km and km², never cell hops).

### The setup flow

1. **Generate the world.** Upstream's Generate, unchanged.
2. **Detect continents and oceans.** Outlines only, no names yet.
3. **Assign cultures.** Each continent gets one or two cultures from the list below. Not every culture has to be used.
4. **Generate borders** across all land, automatically.
5. **Generate all names at once**: continents, oceans and countries, each in the style of its culture.
6. **Adjust borders** by hand.
7. **Pick one country** as the player's.

Names come after cultures on purpose, so nothing is named twice.

### Rules

- **Continents**: connected land above a size threshold in km². Smaller islands attach to the nearest continent and
  inherit its culture.
- **Oceans**: the sea is one connected body, so it is split into basins at its narrowest points between continents.
- **Cultures** (nine): West European, East European, East Asian, South Asian, African, North American, Latin American,
  Oceania, Middle Eastern. Minimum one and maximum two per continent.
- **Culture drives names only, for now.** Keep each country's culture stored on the country, so later features
  (government, economy) can read it.
- **Two cultures on one continent**: the continent is split geographically along its strongest natural barrier, and each
  country takes the culture of its side.
- **Borders**: countries grow outward from seed points placed where the land feeds the most people (upstream's food
  layer). Mountains, deserts and sea are expensive to cross, so borders follow ranges and rivers. One slider sets
  roughly how many countries. Uninhabitable land (ice caps, deep desert) is absorbed into the nearest country.
- **Border editing**: a country is a set of map cells. Editing brushes cells from one country to a neighbour, plus merge
  and split. Ctrl-click on desktop, edit mode on a phone, like Generate's plate editing.
- **Names**: invented from each culture's sound patterns, never copied from real places. Every name is editable, and an
  edited name is locked so it survives a regenerate.

### Build order

- **S0: Plumbing.** Done (2026-11-10). `politics/` receives Generate's world through hooks in `js/main.js` marked
  `// fork:`, and adds a Political tab to the layer bar. Nothing is saved yet, because nothing is chosen yet: what S1
  shows is found again from the ground each time. Saving starts with S2, the first step with choices to keep.
- **S1: Continents and oceans.** Done (2026-11-10). `politics/lands.js` (how it divides them: `docs/generate.md`, "The
  Political view"), checked by `node politics/tools/check-lands.mjs`. Known limits: the Political view is on Generate
  only (not Import or Evolution); it reads the first picture's ground, not the finished world's lakes; on a world that
  is mostly land, the number of shut-in seas can differ between Details.
- **S2: Cultures.** The per-continent picker (one or two of nine) and the two-culture geographic split.
- **S3: Borders.** Seeds from the food layer, growth by travel cost, the country-count slider, the political map view.
- **S4: Names.** Nine name generators, generate-all, edit and lock.
- **S5: Border editing and picking the player's country.** Starts from `orogen-map-editor.html` once it is in the repo.
- **S6: The game after setup.** Not scoped yet.
