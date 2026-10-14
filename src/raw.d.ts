/**
 * `?raw` imports, as Vite serves them.
 *
 * This project has no `vite/client` in its `types`, so the one shape it uses needs declaring:
 * `src/course/featureGraph.ts` imports the two coverage documents this way rather than keeping a
 * copy of their rows.
 */
declare module '*.md?raw' {
  const content: string
  export default content
}
