# DBTIPS — Disease & Target Dossier

DBTIPS generates **publication-style dossiers** for biological drug targets (proteins and
microRNAs) from normalized JSON data. Every target page — identity, GO annotations,
expression, subcellular localization, UniProt features, miRNA predictions — is produced by
**one generic codebase** that derives its structure from the data, rather than a
hand-built page per target.

The site is a static Astro build: data in, HTML out. There is no runtime server or
database.

---

## How it works

```
backend/data/demo_normalized_json/target/*.json      ← source of truth (one file per target)
            │
            ▼
frontend/src/sections.ts   ← the "brain": reads a target's JSON, walks its
            │                 tab → section hierarchy, picks a render type, and
            │                 fills a Handlebars template for each section
            ▼
frontend/templates/*.hbs   ← presentation: emit wc-docs custom-element markup
            │                 (data-table, bio-protein, doc-abstract, …)
            ▼
Astro pages → static HTML in dist/   ← one /target/<id> page per JSON file
            │
            ▼
Browser    ← wc-docs / WebAwesome / Nightingale / PDBe Mol* components hydrate client-side
```

- **Structure is derived from the data.** Which sections exist, their order, and whether a
  target is a protein or a microRNA are all inferred in
  [`frontend/src/sections.ts`](frontend/src/sections.ts). A small `REGISTRY` in that file
  only supplies polished titles/render-types the raw JSON lacks.
- **Presentation is in Handlebars templates** under [`frontend/templates/`](frontend/templates/)
  (`table`, `prose`, `kv`, `go`, `bar`, `subcellular`, `uniprot`, `nested-table`, …). Each
  template emits design-system custom elements.
- **Components** come from `@aganitha/wc-*` (wc-docs design system), `@awesome.me/webawesome`
  (the `wa-*` UI primitives, via `@aganitha/wc-theme`), EBI **Nightingale** (protein feature
  viewer), and **PDBe Mol\*** (3D structure, lazy-loaded from CDN). Client wiring lives in
  [`frontend/src/client/dossier.ts`](frontend/src/client/dossier.ts).

---

## Project structure

```
dbtips-reimagined/
├── backend/
│   └── data/demo_normalized_json/
│       ├── target/           # per-target dossier data (adrb2, adrb3, fxr, gipr, mir33a)
│       ├── disease/          # disease records
│       └── target-disease/   # target↔disease association records
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── index.astro            # landing gallery of target cards
    │   │   └── target/[id].astro      # one dossier page per target JSON
    │   ├── sections.ts                # data → sections engine
    │   ├── layouts/Dossier.astro      # dossier shell (hero, sticky TOC, sections)
    │   ├── client/dossier.ts          # browser: scroll-spy, Nightingale, Mol*
    │   └── styles/dossier.css
    ├── templates/*.hbs                # render-type templates + helpers.ts
    └── astro.config.mjs
```

> Note: only the data under `backend/data/` is consumed by the frontend at build time.
> The currently rendered dossier tab is **Target Overview** (`target_profile`), assembled
> by `renderTab(data, 'target_profile')` in `target/[id].astro`.

---

## Prerequisites

- **[Bun](https://bun.sh)** (package manager + runner; a `bun.lock` is committed).
- Node.js 18+ is sufficient if you prefer `npm`/`pnpm`, but the commands below use Bun.

---

## Running the app

All commands run from the `frontend/` directory:

```bash
cd frontend
bun install        # install dependencies (first time only)

bun run dev        # local dev server with hot reload  → http://localhost:4321
bun run build      # production build → static site in frontend/dist/
bun run preview    # serve the built dist/ locally to verify the production output
```

---

## Using the dossiers

1. Start the app (`bun run dev`) and open the printed URL.
2. The **landing page** (`/`) shows a card for every target found in
   `backend/data/demo_normalized_json/target/`. Each card shows the kind (Protein /
   microRNA), symbol, name, and gene.
3. Click a card to open its **dossier** at `/target/<id>` (e.g. `/target/adrb2`,
   `/target/mir33a`). A dossier contains:
   - a **hero** with identity (UniProt/Ensembl/HGNC/miRBase links) and at-a-glance KPIs,
   - a **sticky table of contents** with scroll-spy,
   - **sections** rendered from the data: target description, GO annotations, RNA/protein
     expression, subcellular localization, UniProt annotations (with the Nightingale
     feature viewer and PDBe Mol\* 3D structure), and — for miRNAs — target predictions.

---

## Adding or updating a target

No code changes are required for a new target:

1. Drop a normalized JSON file into `backend/data/demo_normalized_json/target/`, named
   `<id>.json` (the `<id>` becomes the URL slug and card symbol).
2. Match the shape of an existing file (e.g. `target/adrb2.json` for a protein,
   `target/mir33a.json` for a microRNA). `sections.ts` infers the target kind and sections
   from the JSON shape.
3. Re-run `bun run dev` (or `bun run build`). The landing card and `/target/<id>` page
   appear automatically.

---

## Customization

- **Section titles & render types** — edit the `REGISTRY` in
  [`frontend/src/sections.ts`](frontend/src/sections.ts). Unregistered sections fall back to
  a humanized title and an inferred render type.
- **Hiding a section from the UI** — add its key to the `HIDDEN_SECTIONS` set in
  `sections.ts` (this is how `anatomical_system` is suppressed) without touching the data.
- **Section order / icons** — `SECTION_ORDER`, `TAB_ORDER`, and `SECTION_ICONS` in
  `sections.ts`.
- **Look of a render type** — edit the corresponding `frontend/templates/<type>.hbs`. In
  dev mode templates recompile on save.

---

## Notes on the frontend bundle

The dossier only imports the wc-docs packages whose components it actually renders —
`@aganitha/wc-data`, `@aganitha/wc-bio`, `@aganitha/wc-doc` (see
[`frontend/src/client/dossier.ts`](frontend/src/client/dossier.ts)). The heavier
visualization packages (`wc-viz`, `wc-chem`, which pull in Plotly/Cytoscape) are
intentionally **not** imported, keeping the build lean. A few remaining large chunks
(mermaid/katex from `wc-doc`) are dynamically imported and never fetched at runtime by the
dossier; the Vite chunk-size warning limit is raised in `astro.config.mjs` accordingly.
