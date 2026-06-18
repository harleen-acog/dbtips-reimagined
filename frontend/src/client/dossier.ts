/* Client bundle for the dossier: registers web components, wires the sticky-TOC
   scroll-spy, builds Nightingale feature viewers, and lazy-loads PDBe Mol*. */

// wc-docs design system + components (register custom elements in the browser)
import '@aganitha/wc-theme/theme.css'
import '@aganitha/wc-theme/foundation'
// Only the wc-docs component packages whose tags the dossier templates emit.
// (Dropping wc-viz + wc-chem keeps Plotly/Cytoscape/smiles-drawer out of the build;
//  none of their viz-*/chem-* tags are used. wa-* comes from wc-theme/foundation.)
import '@aganitha/wc-data' // data-table
import '@aganitha/wc-bio'  // bio-gene, bio-protein, bio-sequence-viewer
import '@aganitha/wc-doc'  // doc-abstract, doc-finding

// External: EBI Nightingale protein feature viewer (auto-registers its elements)
import '@nightingale-elements/nightingale-manager'
import '@nightingale-elements/nightingale-navigation'
import '@nightingale-elements/nightingale-sequence'
import '@nightingale-elements/nightingale-track'

// ── sticky-TOC scroll-spy ───────────────────────────────────────────────────
function initScrollSpy() {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.toc a'))
  if (!links.length) return
  const byId = new Map(links.map((a) => [a.getAttribute('href')!.slice(1), a]))
  const obs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        links.forEach((l) => l.classList.remove('active'))
        byId.get((e.target as HTMLElement).id)?.classList.add('active')
      }
    },
    { rootMargin: '-40% 0px -55% 0px', threshold: 0 },
  )
  document.querySelectorAll('.section').forEach((s) => obs.observe(s))
}

// ── Nightingale feature viewers ─────────────────────────────────────────────
interface NtTrack { label: string; color?: string; features: any[] }
interface NtPayload { length: number; sequence: string; tracks: NtTrack[] }

function ntRow(label: string, el: HTMLElement): HTMLElement {
  const row = document.createElement('div')
  row.className = 'nt-row'
  const lab = document.createElement('div')
  lab.className = 'nt-label'
  lab.textContent = label
  row.append(lab, el)
  return row
}

function buildNightingale(viewer: HTMLElement) {
  const raw = viewer.querySelector('.nt-payload')?.textContent
  const mount = viewer.querySelector<HTMLElement>('.nt-mount')
  if (!raw || !mount) return
  let p: NtPayload
  try { p = JSON.parse(raw) } catch { return }
  const length = p.length
  const width = Math.max(360, viewer.clientWidth - 140)
  const attrs = (el: Element, o: Record<string, string | number>) =>
    Object.entries(o).forEach(([k, v]) => el.setAttribute(k, String(v)))
  const common = { length, 'display-start': 1, 'display-end': length, width }

  const manager = document.createElement('nightingale-manager')

  const nav = document.createElement('nightingale-navigation')
  attrs(nav, { ...common, height: 38 })
  manager.append(ntRow('Position', nav))

  if (p.sequence) {
    const seq = document.createElement('nightingale-sequence')
    attrs(seq, { ...common, height: 26, sequence: p.sequence, 'highlight-event': 'onmouseover' })
    manager.append(ntRow('Sequence', seq))
  }

  for (const t of p.tracks) {
    const track = document.createElement('nightingale-track') as any
    attrs(track, { ...common, height: 26, layout: 'non-overlapping', 'highlight-event': 'onmouseover' })
    manager.append(ntRow(t.label, track))
    // .data is a JS property, not an attribute — set after the element exists
    track.data = (t.features || []).map((f) => ({ color: t.color, ...f }))
  }

  mount.append(manager)
}

function initNightingale() {
  document.querySelectorAll<HTMLElement>('.nt-viewer').forEach(buildNightingale)
}

// ── PDBe Mol* (3D) — lazy-load from CDN only if used ────────────────────────
function initMolstar() {
  if (!document.querySelector('pdbe-molstar')) return
  const v = '3.3.0'
  const css = document.createElement('link')
  css.rel = 'stylesheet'
  css.href = `https://cdn.jsdelivr.net/npm/pdbe-molstar@${v}/build/pdbe-molstar-light.css`
  document.head.appendChild(css)
  const s = document.createElement('script')
  s.src = `https://cdn.jsdelivr.net/npm/pdbe-molstar@${v}/build/pdbe-molstar-component.js`
  s.async = true
  document.head.appendChild(s)
}

// modules are deferred → DOM is ready
initScrollSpy()
initNightingale()
initMolstar()
