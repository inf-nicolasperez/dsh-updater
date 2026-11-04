# dsh-updater

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) bundle that tells you when a newer dsh release exists and installs it for you — without leaving the Web UI.

dsh has no `dsh update` command, and the CLI is normally installed globally with npm/pnpm, so nothing keeps it current. This plugin does:

- **Settings → General** — a `dsh updates` row: installed version, the published release, the channel and dist-tag it came from, *Check for updates*, and *Update to x.y.z*.
- **Sidebar foot** — a *Check for updates* button (icon-only in the collapsed rail) with an amber dot while a release is waiting.
- **Toasts** — a real UI toast from the frame-wide overlay layer:
  - no update → *"No update available — dsh 0.2.1-rc.5 is the latest release."*
  - update → *"dsh 0.2.2-rc.1 is available"* with **Update now** / **Not now**, so nothing installs without your click
  - installing → *"Updating dsh to 0.2.2-rc.1…"* (sticky), then the result
- **Agent tool** — `dsh_update` with `status` / `check` / `update`, calling the same Host methods as the buttons.

## Requirements

| | |
|---|---|
| dsh | `>= 0.2.1-rc.5` (declared as `engines.dsh`); tested on `0.2.1-rc.5` |
| Deployment | the **Web** profile — the plugin registers HTTP routes on `webServer` behind `connection`'s trust fence |
| Runtime | nothing beyond what dsh already needs; it shells out to the npm that owns the install |

## Install

### From GitHub (works today, no npm publish needed)

Ask your agent, or call the plugin manager directly:

```jsonc
// plugin_manager
{ "action": "install_bundle", "target": "git+https://github.com/inf-nicolasperez/dsh-updater.git" }
```

In the UI: **Settings → Plugins → Add**, then paste `git+https://github.com/inf-nicolasperez/dsh-updater.git`.

### From npm

```jsonc
// plugin_manager
{ "action": "install_bundle", "target": "@inf-nicolasperez/dsh-updater@1.0.0" }
```

### Through a plugin index (Discover tab)

Add this index URL where your build reads custom plugin indexes:

```
https://raw.githubusercontent.com/inf-nicolasperez/dsh-updater/main/market/index.json
```

The index pins an exact commit, so installing from it is reproducible.

After installing, refresh the Web page if the new row does not appear immediately (`dsh-client-hmr` usually reloads it in place).

## Configuration

The bundle inserts one Host row whose `config` accepts these keys. Your profile's `cordis.patch.yml` survives dsh upgrades:

```yaml
- id: dsh-updater
  name: '@inf-nicolasperez/dsh-updater'
  config:
    channel: next            # 'newest' | latest | next | alpha   (default 'newest')
    autoInstall: false       # install without a click            (default false)
    checkIntervalMinutes: 60 # automatic check interval           (default 360)
    allowUnsupportedNode: false
```

| Key | Default | Meaning |
|---|---|---|
| `channel` | `newest` | `newest` compares against the highest version across **every** npm dist-tag, so `next`/`alpha` prereleases are seen. A tag name (`latest`, `next`, `alpha`) pins one channel. |
| `registry` | `https://registry.npmjs.org` | Registry base URL. |
| `autoCheck` | `true` | Check ~3 s after start and on the interval. |
| `checkIntervalMinutes` | `360` | Interval between automatic checks (min 5). |
| `autoInstall` | `false` | Install a newer release unattended. **Writes your global npm tree**, hence opt-in. |
| `allowUpdate` | `true` | Master switch for the install action. |
| `allowUnsupportedNode` | `false` | Install even when the release needs a newer Node than the running one. |

## Releases, channels, and the Node gate

dsh publishes prereleases continuously: `alpha` → `next` (release candidate) → `latest` (promoted). `latest` often trails by weeks — following only `latest` reports "up to date" while an RC is already installable. That is why the default channel is `newest`.

The plugin also reads the target release's `engines.node` and **refuses to install one this Node cannot run**:

```
Blocked: 0.2.2-rc.1 requires Node >=24.9.0; this process runs 22.20.0.
```

Installing anyway would leave you with a CLI that refuses to start on the next launch. Upgrade Node, restart dsh, then update.

`engines.node` ranges this plugin can evaluate: comparators (`>=`, `>`, `<=`, `<`, `=`) joined with spaces or `||`, plus `^` and `~`. Anything else is reported as unverified rather than blocked.

## Updating dsh itself

The install runs your npm's own global install for the exact published version:

```
npm install --global @deepseek-ai/dsh@<version> --prefix <the npm prefix owning this install>
```

using the same Node that runs dsh and its `npm-cli.js` (no shell, no PATH guessing). dsh must be restarted afterwards; the plugin says so instead of pretending it is done.

## Removing

```jsonc
{ "action": "remove_bundle", "target": "@inf-nicolasperez/dsh-updater" }
```

## How it is built

Plain JavaScript, no build step and no dependencies: a Host half (`index.js`) with three authenticated routes (`/dsh-updater/state`, `/check`, `/update`) plus the `dsh_update` tool, and a Client half (`client.js`) registering three slots — `settings.general.item`, `sidebar.footer.action`, and `shell.overlay` for the toast. Styling uses only `--dsw-alias-*` theme tokens.

## License

MIT
