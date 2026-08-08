import type { CAC } from 'cac'
import { run, service } from '../context'

export interface SurfaceOptions {
  /**
   * Location of the built SPA, resolved by the CLI ENTRY (src/cli/index.ts).
   * Resolved there and not here: after bundling, a shared module's
   * `import.meta.url` points at a chunk — only the entry has a stable output path.
   */
  webDistDir: string
  /** Desktop app sources (apps/desktop), also resolved by the entry. */
  desktopDir: string
}

/** Long-lived surfaces: web board, desktop overlay, MCP server. */
export function registerSurfaceCommands(cli: CAC, opts: SurfaceOptions): void {
  cli.command('init [name]', 'Initialize a backlog in the current repo').action(
    run(async (name?: string) => {
      const config = await service().init(name ?? 'Backlog')
      console.log(`Backlog "${config.name}" ready — ${config.columns.length} columns.`)
    }),
  )

  cli
    .command('board', 'Run the live web board (single process)')
    .option('--port <port>', 'HTTP port')
    .action(
      run(async (options) => {
        const { startServer } = await import('../../server/index')
        const handle = await startServer(process.env.SUIVRE_ROOT ?? process.cwd(), {
          distDir: opts.webDistDir,
          port: options.port ? Number(options.port) : undefined,
        })
        console.log(`\n  suivre.md — board on ${handle.url}\n  Ctrl+C to stop.\n`)
      }),
    )

  cli
    .command('show [view]', 'Reveal the desktop overlay on a view/item (macOS app)')
    .option('--target <name>', 'Project or link name (default: active target)')
    .action(
      run(async (view: string | undefined, options) => {
        if (process.platform !== 'darwin') {
          console.log('show: the desktop overlay is macOS-only — nothing to reveal here.')
          return
        }
        const params = new URLSearchParams()
        if (view) params.set('view', view)
        if (options.target) params.set('target', options.target)
        const query = params.toString()
        const url = `suivre://show${query ? `?${query}` : ''}`
        const { spawn } = await import('node:child_process')
        const child = spawn('open', [url], { stdio: 'ignore', detached: true })
        child.on('error', () => {})
        child.unref()
        console.log(`overlay -> ${url}`)
      }),
    )

  cli.command('mcp', 'Run the MCP server (stdio) for agents').action(
    run(async () => {
      const { runMcpServer } = await import('../../mcp/server')
      await runMcpServer()
    }),
  )

  // The overlay is strictly opt-in: never installed by a setup, always via this
  // explicit command. Local build (no downloaded binary: an ad-hoc, non-notarized
  // app would be blocked by Gatekeeper — a local build is not).
  cli
    .command('overlay install', 'Build and install the macOS desktop overlay (double-⌘ summon)')
    .action(
      run(async () => {
        if (process.platform !== 'darwin') {
          throw new Error('the desktop overlay is macOS-only')
        }
        const { existsSync } = await import('node:fs')
        const { join } = await import('node:path')
        const script = join(opts.desktopDir, 'install.sh')
        if (!existsSync(script)) {
          throw new Error(`desktop sources not found at ${opts.desktopDir}`)
        }
        const { spawnSync } = await import('node:child_process')
        if (spawnSync('xcrun', ['--find', 'swiftc'], { stdio: 'ignore' }).status !== 0) {
          throw new Error(
            'Swift toolchain not found — install the Xcode Command Line Tools first: `xcode-select --install`',
          )
        }
        console.log('Building the overlay (release)…')
        const result = spawnSync('bash', [script], { stdio: 'inherit' })
        if (result.status !== 0) {
          throw new Error('overlay build/install failed (see output above)')
        }
        console.log(
          '\nFirst launch: allow Input Monitoring (System Settings → Privacy & Security)\n' +
            'for the double-⌘ summon. Re-running this command rebuilds and re-signs the\n' +
            'app — if ⌘⌘ goes quiet after an update, re-grant Input Monitoring.',
        )
      }),
    )
}
