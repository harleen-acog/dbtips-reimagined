import { defineConfig } from 'astro/config'

// Static site generation. wc-docs components are framework-neutral custom
// elements registered client-side, so no UI-framework integration is needed.
export default defineConfig({
  output: 'static',
  vite: {
    // handlebars is CommonJS — keep it external so Node loads it via require()
    // instead of Vite inlining it into the ESM SSR graph (where require is undefined).
    ssr: { external: ['handlebars'] },
    // The largest chunks (mermaid/katex/cytoscape via @aganitha/wc-doc's unused
    // doc-diagram/doc-equation) are dynamically imported and never fetched at runtime
    // by the dossier, so the >500 kB warning is build-time noise. Raise the limit.
    build: { chunkSizeWarningLimit: 800 },
  },
})
