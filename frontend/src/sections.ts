/**
 * sections.ts — the single "brain".
 *
 * Walks a target JSON's tab → sub-tab hierarchy and renders each section into
 * wc-docs HTML using a Handlebars template chosen by render-type. Everything
 * structural (which sections exist, order, target kind) is derived from the
 * data; only the small REGISTRY supplies polished titles/types that the raw
 * JSON does not contain.
 */
import Handlebars from 'handlebars'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import * as helpers from '../templates/helpers'

// Resolve from the Astro project root (cwd = frontend/) so paths stay valid
// in both `astro dev` and after bundling into dist/ during `astro build`.
const ROOT = process.cwd()
const TPL_DIR = path.resolve(ROOT, 'templates')
const DATA_DIR = path.resolve(ROOT, '../backend/data/demo_normalized_json/target')

// ── Handlebars engine (helpers registered once) ────────────────────────────
const hbs = Handlebars.create()
for (const [name, fn] of Object.entries(helpers)) {
  if (typeof fn === 'function') hbs.registerHelper(name, fn as Handlebars.HelperDelegate)
}

const DEV = !!import.meta.env?.DEV
const tplCache = new Map<string, Handlebars.TemplateDelegate>()
function template(type: string): Handlebars.TemplateDelegate {
  // In dev, always recompile so .hbs edits reflect without a restart.
  if (!DEV) {
    const cached = tplCache.get(type)
    if (cached) return cached
  }
  const src = readFileSync(path.join(TPL_DIR, `${type}.hbs`), 'utf8')
  const t = hbs.compile(src, { noEscape: false })
  tplCache.set(type, t)
  return t
}

// ── Data access ────────────────────────────────────────────────────────────
export function listTargets(): string[] {
  return readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
}
export function loadTarget(id: string): Record<string, any> {
  return JSON.parse(readFileSync(path.join(DATA_DIR, `${id}.json`), 'utf8'))
}

// ── Registry (titles/types the JSON lacks; per-kind where shape differs) ─────
type Kind = 'protein' | 'mirna' | 'unknown'
type TypeSpec = string | Partial<Record<Kind, string>>

const REGISTRY: Record<string, { title: string; type: TypeSpec }> = {
  'target_profile.details':                { title: 'Target description',       type: { protein: 'description', mirna: 'mirna-details' } },
  'target_profile.ontology':               { title: 'GO Annotations',           type: 'go' },
  'target_profile.protein_expressions':    { title: 'RNA/Protein expressions',  type: 'bar' },
  'target_profile.subcellular':            { title: 'Subcellular localization', type: 'subcellular' },
  'target_profile.protein_structure':      { title: 'UniProt Annotations',      type: 'uniprot' },
  'target_profile.mir_target_predictions': { title: 'miRNA Target Predictions', type: 'nested-table' },
}

// Canonical nav order — JSON key order is inconsistent across targets.
const TAB_ORDER = ['target_profile', 'market_intelligence', 'target_assessment', 'evidence', 'genomics']
const TAB_LABELS: Record<string, string> = {
  target_profile: 'Target Overview',
  market_intelligence: 'Market Intelligence',
  target_assessment: 'Target Assessment',
  evidence: 'Evidence',
  genomics: 'Genomics',
}
const SECTION_ORDER: Record<string, string[]> = {
  target_profile: ['details', 'ontology', 'protein_expressions', 'subcellular', 'protein_structure', 'mir_target_predictions'],
}

// ── Derivations from the data ───────────────────────────────────────────────
export const humanize = (k: string): string =>
  k.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** Target kind from inner shape (NOT _meta.type, which is always "target"). */
export function targetKind(data: any): Kind {
  const tp = data?.target_profile ?? {}
  const det = tp.details
  if ('mir_target_predictions' in tp || (det && typeof det === 'object' && 'mirbase_url' in det)) return 'mirna'
  if (det && typeof det === 'object' && 'target_details' in det) return 'protein'
  return 'unknown'
}

/** Skip junk so nothing renders blank or crashes: null, '', 'N/A', empty array/object. */
export function isRenderable(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'string') return v.trim() !== '' && v.trim().toUpperCase() !== 'N/A'
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return true
}

function inferType(v: unknown): string {
  if (typeof v === 'string') return 'prose'
  if (Array.isArray(v)) return 'table'
  if (v && typeof v === 'object') {
    const vals = Object.values(v as object)
    if (vals.some(Array.isArray)) return 'table'                            // {ontology:[…]}
    if (vals.every((x) => x && typeof x === 'object')) return 'nested-table' // object of objects/lists
    return 'kv'
  }
  return 'kv'
}

function resolveType(spec: TypeSpec, kind: Kind): string {
  if (typeof spec === 'string') return spec
  return spec[kind] ?? spec.protein ?? (Object.values(spec)[0] as string)
}

/** Title + render-type for any section, known or new, kind-aware. */
export function describe(path: string, value: unknown, kind: Kind): { title: string; type: string } {
  const reg = REGISTRY[path]
  if (reg) return { title: reg.title, type: resolveType(reg.type, kind) }
  return { title: humanize(path.split('.').at(-1)!), type: inferType(value) }
}

function ordered(tabKey: string, keys: string[]): string[] {
  const pref = SECTION_ORDER[tabKey] ?? []
  return [...keys].sort((a, b) => {
    const ia = pref.indexOf(a), ib = pref.indexOf(b)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    return a.localeCompare(b)
  })
}

export function orderedTabs(data: Record<string, any>): { key: string; label: string }[] {
  const keys = Object.keys(data).filter((k) => k !== '_meta' && isRenderable(data[k]))
  return keys
    .sort((a, b) => {
      const ia = TAB_ORDER.indexOf(a), ib = TAB_ORDER.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
    })
    .map((key) => ({ key, label: TAB_LABELS[key] ?? humanize(key) }))
}

// ── Hero model (identity + at-a-glance KPIs), derived from whatever exists ──
export interface HeroModel {
  kind: string
  symbol: string
  name: string
  gene: string
  organism: string
  chips: { label: string; value: string; href?: string }[]
  stats: { label: string; value: string | number; unit?: string }[]
}

const KIND_LABEL: Record<Kind, string> = { protein: 'Protein', mirna: 'microRNA', unknown: 'Target' }
const len = (v: unknown): number | undefined => (Array.isArray(v) ? v.length : undefined)

export function heroModel(data: Record<string, any>): HeroModel {
  const kind = targetKind(data)
  const tp = data.target_profile ?? {}
  const det = tp.details ?? {}
  const intro = det.introduction ?? {}
  const td = det.target_details ?? {}
  const symbol = String(data._meta?.id ?? '').toUpperCase()

  const chips: HeroModel['chips'] = []
  const acc = intro.accession ?? td.uniprot_id
  if (acc) chips.push({ label: 'UniProt', value: acc, href: `https://www.uniprot.org/uniprotkb/${acc}` })
  const ens = td.ensembl_id ?? det.ensembl_id
  if (ens) chips.push({ label: 'Ensembl', value: ens, href: `https://www.ensembl.org/id/${ens}` })
  const hgnc = td.hgnc_id ?? det.hgnc_id
  if (hgnc) chips.push({ label: 'HGNC', value: hgnc, href: `https://www.genenames.org/tools/search/#!/?query=${hgnc}` })
  if (det.mirbase_url) chips.push({ label: 'miRBase', value: 'entry', href: det.mirbase_url })

  const stats: HeroModel['stats'] = []
  const push = (label: string, value: unknown, unit?: string) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'N/A') stats.push({ label, value: value as any, unit })
  }
  push('Annotation score', intro.annotation_score)
  if (kind === 'mirna') push('Length', det.sequence?.length, 'nt')
  else push('Length', tp.protein_structure?.sequence?.length, 'aa')
  push('GO terms', len(tp.ontology?.ontology))
  const pdb = Array.isArray(tp.protein_structure?.db_references)
    ? tp.protein_structure.db_references.filter((r: any) => r.type === 'PDB').length
    : undefined
  push('PDB structures', pdb)
  push('Tissues', len(tp.protein_expressions))
  push('Pipeline drugs', len(data.market_intelligence?.target_pipeline?.target_pipeline))

  return {
    kind: KIND_LABEL[kind],
    symbol,
    name: intro.protein ?? '',
    gene: intro.gene ?? td.gene ?? '',
    organism: intro.organism ?? det.taxonomy?.organism ?? '',
    chips,
    stats,
  }
}

// Font Awesome icon per known section (cosmetic; humanized default otherwise).
const SECTION_ICONS: Record<string, string> = {
  details: 'circle-info',
  ontology: 'tags',
  protein_expressions: 'chart-column',
  subcellular: 'location-dot',
  protein_structure: 'dna',
  mir_target_predictions: 'crosshairs',
}
export const sectionIcon = (id: string): string => SECTION_ICONS[id] ?? 'angle-right'

export interface RenderedSection { id: string; title: string; html: string; icon: string }

// Sections intentionally hidden from the UI even when present in the data.
const HIDDEN_SECTIONS = new Set(['anatomical_system'])

/** Walk one tab's sub-tabs and render each renderable section. */
export function renderTab(data: Record<string, any>, tabKey: string): RenderedSection[] {
  const kind = targetKind(data)
  const tab = data[tabKey] ?? {}
  const out: RenderedSection[] = []
  for (const subKey of ordered(tabKey, Object.keys(tab))) {
    if (HIDDEN_SECTIONS.has(subKey)) continue
    const slice = tab[subKey]
    if (!isRenderable(slice)) continue
    const { title, type } = describe(`${tabKey}.${subKey}`, slice, kind)
    const ctx = { target: data, data: slice, title, kind }
    let html: string
    try {
      html = template(type)(ctx)
    } catch {
      html = template('table')(ctx) // last-resort safety net
    }
    out.push({ id: subKey, title, html, icon: sectionIcon(subKey) })
  }
  return out
}
