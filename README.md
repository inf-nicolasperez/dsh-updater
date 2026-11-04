# dsh-updater

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) bundle that tells you when a newer dsh release exists and installs it for you â€” without leaving the Web UI.

dsh has no `dsh update` command, and the CLI is normally installed globally with npm/pnpm, so nothing keeps it current. This plugin does:

- **Settings â†’ General** â€” a `dsh updates` row: installed version, the published release, the channel and dist-tag it came from, *Check for updates*, and *Update to x.y.z*.
- **Sidebar foot** â€” a *Check for updates* button (icon-only in the collapsed rail) with an amber dot while a release is waiting.
- **Toasts** â€” a real UI toast from the frame-wide overlay layer:
  - no update â†’ *"No update available â€” dsh x.x.x-rc.x is the latest release."*
  - update â†’ *"dsh x.x.x-rc.x is available"* with **Update now** / **Not now**, so nothing installs without your click
  - installing â†’ *"Updating dsh to x.x.x-rc.xâ€¦"* (sticky), then the result
- **Agent tool** â€” `dsh_update` with `status` / `check` / `update`, calling the same Host methods as the buttons.

## Requirements

| | |
|---|---|
| dsh | `>= 0.2.1-rc.5` (declared as `engines.dsh`); tested on `0.2.1-rc.5` and `0.2.2-rc.1` |
| Deployment | the **Web** profile â€” the plugin registers HTTP routes on `webServer` behind `connection`'s trust fence. A headless/SDK profile leaves it inactive rather than failing. |
| Node | the same runtime dsh runs on; the plugin only *reads* `engines.node` of the release it considers |
| pnpm | **required by dsh's plugin manager**, not by this plugin â€” `install_bundle` shells out to `pnpm`, so a machine without it fails with `'pnpm' is not recognized`. Install once: `npm i -g pnpm` |

## Install

### From GitHub

Pin the release tag (`#v1.0.0`); omit it to track `main`:

```jsonc
// plugin_manager
{ "action": "install_bundle", "target": "git+https://github.com/inf-nicolasperez/dsh-updater.git#v1.0.0" }
```

In the UI: **Settings â†’ Plugins â†’ Add**, then paste the same string.

### From npm

```jsonc
// plugin_manager
{ "action": "install_bundle", "target": "@inf-nicolas/dsh-updater@1.0.0" }
```

A brand-new release can answer `404` for a few minutes while npm indexes it — if that happens, install from the git tag above and retry later.

### Through a plugin index (Discover tab)

Add this index URL where your build reads custom plugin indexes:

```
https://raw.githubusercontent.com/inf-nicolasperez/dsh-updater/main/market/index.json
```

The index pins an exact commit, so installing from it is reproducible. On 0.2.x the Discover tab comes from the experimental plugin-market bundle, which is off by default â€” enable it first if the tab is missing.

After installing, refresh the Web page if the new row does not appear immediately (`dsh-client-hmr` usually reloads it in place).

## Configuration

The bundle inserts one Host row whose `config` accepts these keys. Your profile's `cordis.patch.yml` survives dsh upgrades:

```yaml
- id: dsh-updater
  name: '@inf-nicolas/dsh-updater'
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

dsh publishes prereleases continuously: `alpha` â†’ `next` (release candidate) â†’ `latest` (promoted). `latest` often trails by weeks â€” following only `latest` reports "up to date" while an RC is already installable. That is why the default channel is `newest`.

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

### When the new release needs a newer Node

Global tools live per Node version, and version managers expose the active one through a symlink (nvm4w: `C:\nvm4w\nodejs`). After switching Node, reinstall what dsh delegates to under the new version â€” otherwise the failure looks unrelated to the upgrade:

```
nvm use 24.9.0
npm i -g @deepseek-ai/dsh@next pnpm
```

`pnpm` is the one people miss: the plugin manager shells out to it, so bundle installs and removals fail without it. Any MCP server configured with an absolute `command`/`args` under the version-manager path fails the same way (typically `ERR_MODULE_NOT_FOUND`); reinstall it under the new version or point its paths at the older version's tree.

## Removing

```jsonc
{ "action": "remove_bundle", "target": "@inf-nicolas/dsh-updater" }
```

## How it is built

Plain JavaScript, no build step and no dependencies: a Host half (`index.js`) with three authenticated routes (`/dsh-updater/state`, `/check`, `/update`) plus the `dsh_update` tool, and a Client half (`client.js`) registering three slots â€” `settings.general.item`, `sidebar.footer.action`, and `shell.overlay` for the toast. Styling uses only `--dsw-alias-*` theme tokens.

## License

MIT
