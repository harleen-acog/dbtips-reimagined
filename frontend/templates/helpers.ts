/**
 * helpers.ts — Handlebars helpers that transform a section's JSON slice into the
 * exact data shape each wc-docs component expects. Templates stay declarative;
 * all data wrangling lives here.
 */

const humanize = (k: string): string =>
  String(k).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

const renderable = (v: unknown): boolean => {
  if (v == null) return false
  if (typeof v === 'string') return v.trim() !== '' && v.trim().toUpperCase() !== 'N/A'
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return true
}

/** Stringify for <script type="application/json"> (script-safe). */
export function json(v: unknown): string {
  return JSON.stringify(v ?? null).replace(/</g, '\\u003c')
}

export function eq(a: unknown, b: unknown): boolean {
  return a === b
}

/** Flatten any value to a readable cell string (for generic tables). */
function cell(v: unknown): string | number {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return v as string | number
}

// ── Target description (protein) ────────────────────────────────────────────
export function funcText(details: any): string {
  return details?.summary_and_characteristics?.function_descriptions ?? ''
}
export function synonyms(details: any): string[] {
  const s = details?.summary_and_characteristics?.synonyms ?? {}
  return [...(s.ncbi ?? []), ...(s.ai_added ?? [])]
}
export function idChips(details: any): { label: string; value: string }[] {
  const td = details?.target_details ?? {}
  const intro = details?.introduction ?? {}
  const out: { label: string; value: string }[] = []
  if (intro.accession) out.push({ label: 'UniProt', value: intro.accession })
  if (td.uniprot_id && td.uniprot_id !== intro.accession) out.push({ label: 'UniProt', value: td.uniprot_id })
  if (td.ensembl_id) out.push({ label: 'Ensembl', value: td.ensembl_id })
  if (td.hgnc_id) out.push({ label: 'HGNC', value: td.hgnc_id })
  return out
}
export function taxonomyTable(details: any): { columns: any[]; rows: any[] } {
  const t = details?.taxonomy ?? {}
  return {
    columns: [
      { key: 'field', label: 'Field' },
      { key: 'value', label: 'Value' },
    ],
    rows: [
      { field: 'Taxonomic Identifier', value: cell(t.taxonomic_identifier) },
      { field: 'Organism', value: cell(t.organism) },
      { field: 'Taxonomic Lineage', value: (t.taxonomic_lineage ?? []).join(' > ') },
    ].filter((r) => renderable(r.value)),
  }
}

// ── Target description (identity card) ───────────────────────────────────────
export function proteinCard(details: any): { name: string; gene: string; uniprot: string; organism: string } {
  const i = details?.introduction ?? {}
  const td = details?.target_details ?? {}
  return {
    name: i.protein ?? humanize(details?.summary_and_characteristics?.target_id ?? 'Target'),
    gene: i.gene ?? td.gene ?? '',
    uniprot: i.accession ?? td.uniprot_id ?? '',
    organism: i.organism ?? details?.taxonomy?.organism ?? '',
  }
}

// ── GO Annotations — three aspect groups (BP / MF / CC) ──────────────────────
const GO_ASPECTS: { aspect: string; description: string }[] = [
  { aspect: 'Biological Process', description: 'Broader pathways or objectives the gene product supports (e.g., immune response, cell cycle regulation).' },
  { aspect: 'Molecular Function', description: 'Specific biochemical activities (e.g., kinase activity, DNA binding).' },
  { aspect: 'Cellular Component', description: 'Where the gene product is active (e.g., nucleus, cytoplasm).' },
]
const goRow = (r: any) => ({
  go_id: r.go_id,
  name: r.name,
  evidence: [...new Set(Array.isArray(r.evidence) ? r.evidence : [r.evidence])].join(', '),
  refs: Array.isArray(r.source) ? r.source.length : 1,
})
const GO_COLUMNS = [
  { key: 'go_id', label: 'GO ID', sortable: true },
  { key: 'name', label: 'Name', sortable: true },
  { key: 'evidence', label: 'Evidence', sortable: true },
  { key: 'refs', label: 'Refs', type: 'number', sortable: true },
]
export function goGroups(ont: any): { aspect: string; description: string; count: number; table: { columns: any[]; rows: any[] } }[] {
  const all = ont?.ontology ?? []
  return GO_ASPECTS.map(({ aspect, description }) => {
    const rows = all.filter((r: any) => r.aspect === aspect).map(goRow)
    return { aspect, description, count: rows.length, table: { columns: GO_COLUMNS, rows } }
  }).filter((g) => g.count > 0)
}

// ── RNA / Protein expression ─────────────────────────────────────────────────
const LEVEL_LABELS: Record<number, string> = {
  [-1]: '—', [0]: 'None', [1]: 'Low', [2]: 'Medium', [3]: 'High', [4]: 'Very high',
}
export function levelLabel(level: number): string {
  return LEVEL_LABELS[level] ?? '—'
}

/**
 * Compute all data the expression bar template needs.
 * All UI labels come from this helper — the template has zero hardcoded strings,
 * making bar.hbs reusable for any two-series horizontal-bar section on any site.
 * To use bar.hbs elsewhere: write a helper that returns the same shape with your
 * own labels, group key, and series values.
 */
export function expressionData(expr: any): {
  switchLabel: string; allLabel: string
  series0Label: string; series1Label: string
  groupKey: string
  maxLevel: number
  groups: {
    label: string; hint: string
    s0Level: number; s0Pct: number
    s1Level: number; s1Pct: number
    items: { label: string; s0Level: number; s0Pct: number; s0Detail: string; s1Level: number; s1Pct: number }[]
  }[]
} {
  const list: any[] = Array.isArray(expr) ? expr : []
  const maxLevel = Math.max(1, ...list.flatMap((o: any) => (o.tissues ?? []).map((t: any) => num(t.rna_level))))
  const maxProt  = Math.max(1, ...list.flatMap((o: any) => (o.tissues ?? []).map((t: any) => num(t.protein_level))))
  const pct = (v: number, max: number) => Math.round(Math.max(0, v) / max * 100)
  const groups = list.map((o: any) => {
    const tissues: any[] = o.tissues ?? []
    const byRna = [...tissues].sort((a: any, b: any) => num(b.rna_level) - num(a.rna_level))
    const s0Level = byRna.length ? num(byRna[0].rna_level) : -1
    const s1Level = tissues.length ? Math.max(...tissues.map((t: any) => num(t.protein_level))) : -1
    return {
      label: o.organ,
      hint: byRna[0]?.tissue ?? '',
      s0Level, s0Pct: pct(s0Level, maxLevel),
      s1Level, s1Pct: pct(s1Level, maxProt),
      items: tissues.map((t: any) => ({
        label: t.tissue,
        s0Level: num(t.rna_level),
        s0Pct: pct(num(t.rna_level), maxLevel),
        s0Detail: `${t.rna_value ?? ''} ${t.unit && t.unit !== 'N/A' ? t.unit : 'TPM'}`.trim(),
        s1Level: num(t.protein_level),
        s1Pct: pct(num(t.protein_level), maxProt),
      })),
    }
  }).sort((a, b) => b.s0Level - a.s0Level)
  return {
    switchLabel: 'Show organ:', allLabel: 'All organs',
    series0Label: 'RNA level', series1Label: 'Protein level',
    groupKey: 'organ',
    maxLevel, groups,
  }
}

export function expressionSeries(expr: any): any[] {
  const list = Array.isArray(expr) ? expr : []
  const organs: string[] = []
  const rna: number[] = []
  const protein: number[] = []
  for (const o of list) {
    const tissues = o.tissues ?? []
    const rnaMax = Math.max(0, ...tissues.map((t: any) => num(t.rna_level)))
    const protMax = Math.max(0, ...tissues.map((t: any) => Math.max(0, num(t.protein_level)))) // -1 → 0
    organs.push(o.organ)
    rna.push(rnaMax)
    protein.push(protMax)
  }
  return [
    { name: 'RNA level', x: organs, y: rna },
    { name: 'Protein level', x: organs, y: protein },
  ]
}
export function topTissues(expr: any, n = 3): { organ: string; tissue: string; level: number }[] {
  const list = Array.isArray(expr) ? expr : []
  return list
    .map((o: any) => {
      const t = o.tissues ?? []
      const best = [...t].sort((a: any, b: any) => num(b.rna_level) - num(a.rna_level))[0] ?? {}
      return { organ: o.organ, tissue: best.tissue ?? '', level: Math.max(0, ...t.map((x: any) => num(x.rna_level))) }
    })
    .sort((a, b) => b.level - a.level)
    .slice(0, n)
}

// ── Subcellular localization ─────────────────────────────────────────────────
export function subcellularHeader(sub: any): string {
  const locs = sub?.subcellular_locations ?? []
  const parts: string[] = []
  for (const l of locs) {
    if (l?.location?.value) parts.push(l.location.value)
    if (l?.topology?.value) parts.push(l.topology.value)
  }
  return parts.join(' · ')
}
export function subcellularTable(sub: any): { columns: any[]; rows: any[] } {
  const rows = (sub?.subcellular ?? []).map((r: any) => ({
    type: r.type,
    positions: r.positions,
    description: r.description,
    blast: r.blast_link ?? '',
  }))
  return {
    columns: [
      { key: 'type', label: 'Type', sortable: true },
      { key: 'positions', label: 'Positions', sortable: true },
      { key: 'description', label: 'Description', sortable: true },
      { key: 'blast', label: 'BLAST' },
    ],
    rows,
  }
}

// ── UniProt annotations ──────────────────────────────────────────────────────
export function seqLength(ps: any): number {
  return num(ps?.sequence?.length)
}
export function seqString(ps: any): string {
  return ps?.sequence?.sequence ?? ''
}
export function domainMapData(ps: any): any[] {
  const feats = ps?.features ?? []
  return feats
    .filter((f: any) => ['TOPOLOGY', 'DOMAINS_AND_SITES'].includes(f.category))
    .map((f: any) => ({ name: f.description && f.description !== 'N/A' ? f.description : f.type, start: num(f.begin), end: num(f.end) }))
    .filter((d: any) => d.start > 0 && d.end >= d.start)
}
export function pdbTable(ps: any): { columns: any[]; rows: any[] } {
  const rows = (ps?.db_references ?? [])
    .filter((r: any) => r.type === 'PDB')
    .map((r: any) => ({
      pdb: r.id,
      method: r.properties?.method ?? '',
      resolution: r.properties?.resolution ?? '',
      chains: r.properties?.chains ?? '',
    }))
  return {
    columns: [
      { key: 'pdb', label: 'PDB ID', sortable: true },
      { key: 'method', label: 'Method', sortable: true },
      { key: 'resolution', label: 'Resolution', sortable: true },
      { key: 'chains', label: 'Chains' },
    ],
    rows,
  }
}
export function topPdbId(ps: any): string {
  const pdb = (ps?.db_references ?? []).find((r: any) => r.type === 'PDB')
  return (pdb?.id ?? '').toLowerCase()
}

// Nightingale payload: sequence + feature tracks grouped by category.
const FEATURE_COLORS: Record<string, string> = {
  TOPOLOGY: '#1e6fd9',
  DOMAINS_AND_SITES: '#7c3aed',
  PTM: '#db2777',
  VARIANTS: '#dc2626',
  MUTAGENESIS: '#ea580c',
  MOLECULE_PROCESSING: '#0891b2',
  SEQUENCE_INFORMATION: '#64748b',
  STRUCTURAL: '#16a34a',
}
export function nightingaleData(ps: any): { length: number; sequence: string; tracks: any[] } {
  const length = num(ps?.sequence?.length)
  const sequence = ps?.sequence?.sequence ?? ''
  const groups: Record<string, any[]> = {}
  for (const f of ps?.features ?? []) {
    const s = num(f.begin), e = num(f.end)
    if (!(s > 0 && e >= s)) continue
    ;(groups[f.category] ??= []).push({ accession: f.ft_id || f.type, start: s, end: e, tooltipContent: f.description })
  }
  const tracks = Object.entries(groups).map(([cat, features]) => ({
    label: humanize(cat).replace(/\bAnd\b/, '&'),
    color: FEATURE_COLORS[cat] ?? '#1e6fd9',
    features,
  }))
  return { length, sequence, tracks }
}

// ── miRNA details ────────────────────────────────────────────────────────────
export function mirnaSeq(details: any): string {
  return (details?.sequence ?? '').toUpperCase()
}
export function mirnaLinks(details: any): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = []
  if (details?.mirbase_url) out.push({ label: 'miRBase', url: details.mirbase_url })
  if (details?.rnacentral_url) out.push({ label: 'RNAcentral', url: details.rnacentral_url })
  return out
}
export function mirnaStructure(details: any): string {
  return details?.structure ?? ''
}

// ── Generic fallbacks ────────────────────────────────────────────────────────
/** Find every array-of-objects leaf in a nested object → titled tables. */
export function listLeaves(value: any): { title: string; table: { columns: any[]; rows: any[] } }[] {
  const out: { title: string; table: any }[] = []
  const walk = (v: any, path: string) => {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
      out.push({ title: humanize(path.split('.').at(-1) ?? path), table: genericTable(v) })
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, child] of Object.entries(v)) walk(child, path ? `${path}.${k}` : k)
    }
  }
  walk(value, '')
  return out
}

/** Any array/object → a {columns, rows} table, capped for page weight. */
export function genericTable(value: any, cap = 500): { columns: any[]; rows: any[]; capped?: number } {
  let arr: any[] = []
  if (Array.isArray(value)) arr = value
  else if (value && typeof value === 'object') {
    const firstList = Object.values(value).find((v) => Array.isArray(v))
    arr = (firstList as any[]) ?? [value]
  }
  const total = arr.length
  const slice = arr.slice(0, cap)
  const keys = slice.length && typeof slice[0] === 'object' ? Object.keys(slice[0]) : ['value']
  const columns = keys.map((k) => ({ key: k, label: humanize(k), sortable: true }))
  const rows = slice.map((r) =>
    typeof r === 'object' && r !== null
      ? Object.fromEntries(keys.map((k) => [k, cell(r[k])]))
      : { value: cell(r) },
  )
  return total > cap ? { columns, rows, capped: total } : { columns, rows }
}

/** Flat object → key/value table. */
export function kvTable(value: any): { columns: any[]; rows: any[] } {
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : { value }
  const rows = Object.entries(obj)
    .filter(([, v]) => renderable(v))
    .map(([k, v]) => ({ field: humanize(k), value: cell(v) }))
  return {
    columns: [
      { key: 'field', label: 'Field' },
      { key: 'value', label: 'Value' },
    ],
    rows,
  }
}

export function proseText(value: any): string {
  return typeof value === 'string' ? value : json(value)
}
