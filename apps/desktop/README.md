# suivre desktop

*A summonable overlay and server control-plane for the suivre.md board. macOS.*

## Why this exists

This one is personal.

The board lives in a browser tab, and a tab is a place you have to *go to* — find
the window, find the tab, switch to the right Space. I wanted the opposite: the
board should come to **me**, wherever I am, whatever's full-screen, the instant I
ask — and get out of the way just as fast.

So this is a tiny native agent built for exactly one person. Double-tap ⌘ and the
dashboard drops in over whatever you're doing, on whatever virtual desktop you're
on. Tap again and it's gone. No tab, no dock icon, no window juggling.

Then it grew two more jobs, because they were the same itch:

- It **starts the board's server** for me in one click when my coding agent forgot
  to — or adopts the one that's already running.
- It's a **hook my agents can pull** to *show* me something: a task, a sprint, a
  decision, the roadmap — the overlay pops open on exactly that view.

Nothing here is generalized or configurable beyond what I actually needed. That's
the point. If you're reading this and you're not me: hi. It'll still work, but it
was cut to fit one hand.

## What it does

- **Overlay** — a borderless panel on any Space, above full-screen apps, hosting a
  live `WKWebView` of the active target (a project's local dashboard, or any URL).
- **Control-plane** — a menu-bar list of registered projects with server status
  and one-click start/stop, plus arbitrary URL targets and an overlay-size toggle.
- **Agent hook** — a `suivre://show` URL scheme (+ CLI + MCP tool) so agents can
  reveal a specific view/item on demand.

## How it works

### The summon

The overlay is an `NSPanel` (borderless, non-activating) with
`collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]`. That pair is the
whole trick: it makes one window appear on **every** virtual desktop and float over
another app's full-screen space. It's the same mechanism Raycast/Alfred use under
the hood.

Showing it is `orderFrontRegardless()` **then** `NSApp.activate()`, in that order.
Activating first lets macOS go looking for the app's windows and switch Spaces to
find them — that's how a summon landed on the wrong desktop. Ordered in first, the
panel is already on the Space you're on, so activation has nowhere else to go.
`orderFrontRegardless` also sidesteps the macOS 14+ limits on an inactive
accessory app raising a window.

The trigger is a **double-tap of ⌘**. You can't detect a lone-modifier double-tap
with the Carbon hot-key API (it wants a real key+modifier combo), so it's a
listen-only `CGEventTap` watching `flagsChanged`/`keyDown`. A "tap" is ⌘ down then
up, held under 500 ms, with no other key or modifier in between; a second tap
pressed within 450 ms of the first one's release fires the summon. Timing to the
**press** matters: measuring release-to-release made "tap, then tap-and-hold" —
which is how you naturally summon something you're about to look at — miss. The
`keyDown` watch is what lets it reject ⌘C and friends. Using a tap (not an
`NSEvent` monitor) keeps the permission coherent: `CGRequestListenEventAccess`
governs exactly this mechanism, so the one-time **Input Monitoring** grant is the
right — and only — permission involved. If the grant isn't there yet, tap creation
is retried on a bounded timer and re-attempted whenever you open the menu, so it
starts working the moment you allow it, no relaunch. The tap is also re-armed on
wake and on session unlock, which the system disables it across without telling
anyone.

The panel centers on whichever screen the cursor is on, so it lands where you're
looking. `Esc`, a second ⌘⌘, or clicking away hides it.

### The control-plane

Registered projects and URL targets live in `~/.config/suivre/desktop.json`. Each
project is a folder with a `.suivre/` board, pinned to a port (from 45188 up).

Servers are launched one per project by running `node node_modules/.bin/tsx
src/cli/index.ts board --port <p>` **directly** — no shell in between. A
double-clicked app inherits launchd's minimal PATH, and a login shell doesn't fix
it: `zsh -lc` is non-interactive, so it skips `.zshrc`, which is where nvm lives.
So `node` is resolved by hand (`NodeLocator`): nvm's `default` alias first, then
the newest installed nvm version, then Homebrew and the system prefixes. If none
is found, the reason is written to the project's server log.

The important rule: **health is the source of truth.** Before spawning, the app
checks `/api/health` on the port. If something already answers — your agent started
it, or you did by hand — it's **adopted**, not duplicated. And only servers the app
itself spawned are stopped on quit; it never kills a server it didn't start. Status
in the menu is that same health check, run only when the menu opens (never in the
background — see below).

### The overlay web view

One `WKWebView`, reused for every target — navigating it, never spawning a second
one (that would leak a WebContent process per target). It uses the **default,
persistent** website data store, so cookies and sign-ins survive between summons,
across relaunches, and across the idle unload below. `window.open`/`_blank`
navigations are loaded in place so OAuth-style login popups actually work, and
back/forward swipe is on for external pages.

Deep-links ride the URL fragment: revealing `board/task-013` loads
`localhost:<port>/#board/task-013`, which the SPA reads on load. A reveal always
reloads (so the requested view is shown); a plain summon of the target you're
already on keeps the live view untouched (instant, keeps your scroll).

### The agent hook

The app registers a `suivre://` URL scheme. `suivre://show?view=<deep-link>&target=<name>`
resolves the target (by name, or the active one), makes sure its server is up, and
reveals the view. Three ways in, all the same mechanism:

```
open "suivre://show?view=sprints/sprint-001&target=relay"   # any shell
suivre show sprints/sprint-001 --target relay               # CLI wrapper
reveal_overlay { view, target }                             # MCP tool
```

`target` is optional (defaults to the active target). `view` is a dashboard
deep-link without the hash — `board`, `board/task-013`, `sprints/sprint-001`,
`docs/doc-003`, `decisions/decision-001`, `overview`, `archive`, …

## Built to stay open for days

The whole point is to leave it running. So it's built to sit idle cheaply and never
grow:

- **No background polling.** Health is checked only when you open the menu (updated
  live while it's open) plus once at launch — there is no periodic timer, so when
  nothing's happening the app is genuinely idle and macOS can App-Nap it.
- **The web view is torn down after 10 minutes hidden.** Idle, before you've
  summoned anything, the app is ~28 MB physical footprint with **zero** WebKit
  processes. Summon it and a WebContent process spins up; leave it hidden for ten
  minutes and the page is unloaded — its SSE connection closes and the app drops
  back to ~24 MB. WebKit itself then keeps an empty WebContent shell cached for up
  to ~30 minutes (system behavior, reclaimable under memory pressure) before the
  processes exit. Sessions survive because they're on disk, so the next summon
  just reloads.
- **One web view, reused** — no per-target accumulation.
- **Bounded retries** — the hotkey's permission retry stops after a minute instead
  of waking up forever.
- **No leaks.** `leaks` on the running process reports `0 leaks for 0 total leaked
  bytes` after exercising the overlay.

Measured (macOS 26): ~24–28 MB physical footprint idle, ~121 MB peak with the
dashboard loaded (plus WebContent ~37 MB / GPU ~19 MB / Networking ~16 MB while
the page is live), 0.0% CPU and <1 s of cumulative CPU time between summons,
0 leaks.

## Install

```
cd apps/desktop
./install.sh          # build (release) + copy to /Applications + relaunch
```

Now Spotlight, Raycast, Launchpad and Finder can launch `suivre` like any app. To
build without installing: `./make-app.sh` → `build/suivre.app`.

## First launch — one permission

The double-⌘ hotkey needs **Input Monitoring**. On first launch macOS prompts for
it; grant it under **System Settings → Privacy & Security → Input Monitoring**
(enable `suivre`). It starts working immediately — no relaunch. Until then, the
menu-bar item opens the overlay.

> Rebuilding re-signs the binary, which can reset the grant. Build once, grant once.
> For always-on, add `suivre.app` to Login Items.

## Use

- **Double-tap ⌘** → overlay for the active target. ⌘⌘ / `Esc` / click-away → hide.
- **Menu bar → PROJECTS** → status dot + Open overlay · Start/Stop server ·
  Reveal logs · Remove.
- **Menu bar → LINKS** → any URL you added.
- **Add project… / Add URL…** → register a `.suivre/` folder, or any page.
- **Overlay size** → Small / Medium / Large (proportional to the current screen).

## Dev modes

```
swift run suivre-desktop            # run from source (menu-bar agent)
swift run suivre-desktop --show     # also open the overlay on launch
swift run suivre-desktop --selftest # headless: summon timings + spawn a server, check health, quit
swift run suivre-desktop --snapshot out.png   # headless render of the dashboard
```

## Config

`~/.config/suivre/desktop.json` — `suivreRepoPath`, `projects` (name/path/port),
`links` (name/url), `activeTargetID`, `overlaySize`. Server output goes to
`~/.config/suivre/logs/server-<port>.log`; reveals are traced in `overlay.log`.

## Trade-offs I chose

- **Switching between targets is menu-bar-driven** — no in-overlay switcher bar yet.
- **Ad-hoc signed, not notarized** — fine for a local, personal build.
- **Login-item registration is manual** — add it once if you want it always on.
- **macOS only** — it leans on AppKit, event taps and Spaces behavior throughout.
