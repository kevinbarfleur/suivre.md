import { startServer } from './index'

// The Vite dev server (vite.config.ts: port 45189) proxies `/api` and forwards
// the page's own Origin, so without this allowance every write from
// `npm run dev` would be refused as cross-origin.
const WEB_PORT = 45189

const root = process.env.SUIVRE_ROOT ?? process.cwd()
const handle = await startServer(root, {
  allowedOrigins: [`http://localhost:${WEB_PORT}`, `http://127.0.0.1:${WEB_PORT}`],
})
console.log(`suivre.md — board at ${handle.url}`)
