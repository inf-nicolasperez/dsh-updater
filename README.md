# dsh-updater

Check for and install [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) releases from the Web UI. dsh has no `dsh update` command, and a globally installed CLI never updates itself.

## What you get

- **Settings → General** — a `dsh updates` row: installed version, newest published release, its dist-tag, *Check for updates*, and *Update*.
- **Sidebar foot** — a compact *Check for updates* button; an amber dot marks a pending release.
- **Toasts** — *"No update available — dsh x.y.z is the latest release."*, or *"dsh x.y.z is available"* with **Update now** / **Not now**, so nothing installs without a click. Installing shows a sticky progress toast, then the result.
- **Agent tool** — `dsh_update` (`status` / `check` / `update`) over the same Host methods.

## Install

```jsonc
// plugin_manager
{ "action": "install_bundle", "target": "@inf-nicolas/dsh-updater@1.0.0" }
```

In the UI: **Settings → Plugins → Add**, paste the same target. Other sources:

- **Git** — `git+https://github.com/inf-nicolasperez/dsh-updater.git#v1.0.0`
- **Discover tab** — add `https://raw.githubusercontent.com/inf-nicolasperez/dsh-updater/main/market/index.json` as a custom plugin index (requires the experimental plugin-index bundle).

A brand-new release can answer `404` for a few minutes while npm indexes it.

## Requirements

- dsh `>= 0.2.1-rc.5`, tested on `0.2.1-rc.5` and `0.2.2-rc.1`. **Web** profile — a headless or SDK profile leaves the plugin inactive rather than failing.
- `pnpm` on PATH — dsh's plugin manager shells out to it (`npm i -g pnpm`).

## Configuration

One Host row. Your profile's `cordis.patch.yml` survives dsh upgrades.

```yaml
- id: dsh-updater
  name: '@inf-nicolas/dsh-updater'
  config:
    channel: newest
    autoInstall: false
```

| Key | Default | Meaning |
|---|---|---|
| `channel` | `newest` | Highest version across **all** dist-tags, so `next`/`alpha` prereleases are seen. A tag name (`latest`, `next`, `alpha`) pins one channel. |
| `registry` | `https://registry.npmjs.org` | Registry base URL. |
| `autoCheck` | `true` | Check ~3 s after start, then every `checkIntervalMinutes`. |
| `autoInstall` | `false` | Install unattended — writes your global npm tree. |
| `allowUpdate` | `true` | Master switch for installing. |
| `allowUnsupportedNode` | `false` | Install even when the release needs a newer Node than this runtime. |

## Behaviour worth knowing

- `latest` often trails `next` by weeks; that is why the default channel is `newest`.
- The target release's `engines.node` is read first. A release this runtime cannot start is **reported and refused**, never half-installed — moving to dsh 0.2.2 needs Node >= 24.9.0.
- The install runs `npm install --global @deepseek-ai/dsh@<version> --prefix <owner of this install>` with the running Node's own npm. dsh must be restarted afterwards.
- `autoInstall` never bypasses the Node check.

## License

MIT
