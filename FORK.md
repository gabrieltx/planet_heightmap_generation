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

Each phase must stand on its own and follow upstream's pillars and rules: looks first, mobile-friendly, and scale
invariance (physical units, never cell hops).

- **P0: Plumbing.** A `politics/` module that receives a finished world (the contract above) in Generate, with one
  `// fork:` hook. A "Political" tab in the layer bar that draws nothing yet. Political state saved in the planet
  code or link, and in planet files.
- **P1: Settlements.** Cities placed where the land could feed people, weighted toward river mouths, confluences,
  sheltered coasts and fords. They are sized by the people their surroundings could support. The cradles of states
  are the densest well-watered cores, after Madeline James Part 4 and Carneiro's circumscription. Upstream once
  built "Cradles" in its food layer and removed it to redo later. Ours is fork-owned, so there's no clash.
- **P2: States and borders.** Polities grow from the cradles by travel cost: mountains, deserts and open sea are
  expensive, while rivers and coasts are cheap. That makes borders follow natural barriers and rivers, not
  Voronoi lines. A political map view, with names and colours.
- **P3: Editing.** The player shapes the map: claim or cede a region, merge or split states, rename and recolour. This
  mirrors Generate's plate editing: Ctrl-click on desktop, edit mode on a phone.
- **P4: The game.** Turns, and a nation to play. Economy from food and ores, expansion and diplomacy, events,
  scenario goals. Scoped in detail once P1–P3 exist.
