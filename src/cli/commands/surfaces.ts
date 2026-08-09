import type { CAC } from 'cac'
import { commandRoot, initRoot, printJson, run, service } from '../context'

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

/** Port 0 is a legitimate request ("pick a free one"), so absence is the only default. */
function portNumber(value: string): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`--port ${value} — expected a port number between 0 and 65535`)
  }
  return port
}

/** Long-lived surfaces: web board, desktop overlay, MCP server. */
export function registerSurfaceCommands(cli: CAC, opts: SurfaceOptions): void {
  cli
    .command('init [name]', 'Initialize a backlog in the current repo')
    .option('--force', 'Initialize here even when an ancestor already has a backlog')
    .option('--json', 'JSON output')
    .action(
      run(async (name: string | undefined, options) => {
        const config = await service(initRoot(Boolean(options.force))).init(name || 'Backlog')
        if (options.json) printJson(config)
        else console.log(`Backlog "${config.name}" ready — ${config.columns.length} columns.`)
      }),
    )

  cli
    .command('board', 'Run the live web board (single process)')
    .option('--port <port>', 'HTTP port')
    .action(
      run(async (options) => {
        const { startServer } = await import('../../server/index')
        const handle = await startServer(commandRoot(), {
          distDir: opts.webDistDir,
          port: options.port === undefined ? undefined : portNumber(options.port),
        })
        console.log(`\n  suivre.md — board on ${handle.url}\n  Ctrl+C to stop.\n`)
      }),
    )

  cli
    .command('show [view]', 'Reveal the desktop overlay on a view/item (macOS app)')
    .option('--target <name>', 'Project or link name (default: active target)')
    .option('--json', 'JSON output')
    .action(
      run(async (view: string | undefined, options) => {
        const params = new URLSearchParams()
        if (view) params.set('view', view)
        if (options.target) params.set('target', options.target)
        const query = params.toString()
        const url = `suivre://show${query ? `?${query}` : ''}`
        if (process.platform !== 'darwin') {
          const reason = 'the desktop overlay is macOS-only — nothing to reveal here'
          if (options.json) printJson({ url, revealed: false, reason })
          else console.log(`show: ${reason}.`)
          return
        }
        // Synchronous: `open` returns as soon as LaunchServices has dispatched,
        // and its exit code is the only signal that the overlay is installed.
        const { spawnSync } = await import('node:child_process')
        const result = spawnSync('open', [url], { encoding: 'utf8' })
        if (result.status === 0 && !result.error) {
          if (options.json) printJson({ url, revealed: true })
          else console.log(`overlay -> ${url}`)
          return
        }
        // Revealing is best-effort by design: the agent contract prescribes
        // `suivre show` after publishing or triaging, and a missing optional app
        // must not fail the step that just succeeded. Say so, exit 0.
        const detail = result.error?.message ?? result.stderr.trim() ?? ''
        const reason = `overlay not reachable${detail ? `: ${detail}` : ''} — install it with \`suivre overlay install\``
        if (options.json) printJson({ url, revealed: false, reason })
        else console.log(`show: ${reason}`)
      }),
    )

  cli.command('mcp', 'Run the MCP server (stdio) for agents').action(
    run(async () => {
      const { runMcpServer } = await import('../../mcp/server')
      await runMcpServer(commandRoot())
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
