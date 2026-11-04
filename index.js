/**
 * Host half of the dsh updater.
 *
 * Reads the installed `@deepseek-ai/dsh` version next to the running entry
 * point, asks the npm registry for the newest published release (or the one
 * behind a named dist-tag), reads that release's `engines.node` requirement,
 * and — on an explicit Update request — runs the npm global install that
 * upgrades this installation.
 *
 * A release this Node runtime cannot run is reported and refused: dsh 0.2.2
 * requires Node >= 24.9.0, so installing it under an older runtime would leave
 * a CLI that refuses to start.
 *
 * Routes live on the composition's `webServer` behind `connection`'s
 * Host/Origin fence and browser authentication, the same way shipped browser
 * routes (open-in-app) are guarded. Nothing here mutates installation state
 * unless a caller posts to the update route.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** Cordis function-plugin name. */
export const name = 'dsh-updater'

/** The route carrier and the trust fence guarding every route. */
export const inject = ['webServer', 'connection']

const PACKAGE_NAME = '@deepseek-ai/dsh'
const STATE_PATH = '/dsh-updater/state'
const CHECK_PATH = '/dsh-updater/check'
const UPDATE_PATH = '/dsh-updater/update'
const REGISTRY_TIMEOUT_MS = 15_000
const UPDATE_TIMEOUT_MS = 300_000
const OUTPUT_TAIL = 6_000

const DEFAULTS = {
  channel: 'newest',
  registry: 'https://registry.npmjs.org',
  autoCheck: true,
  autoInstall: false,
  checkIntervalMinutes: 360,
  allowUpdate: true,
  allowUnsupportedNode: false,
}

/** Format an unknown failure as one short line. */
function errorText(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Read the configured channel/registry/interval with defensive defaults. */
function normalizeSettings(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const channel =
    typeof source.channel === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(source.channel)
      ? source.channel
      : DEFAULTS.channel
  const registry =
    typeof source.registry === 'string' && /^https?:\/\/\S+$/.test(source.registry)
      ? source.registry.replace(/\/+$/, '')
      : DEFAULTS.registry
  const minutes = Number(source.checkIntervalMinutes)
  return {
    channel,
    registry,
    autoCheck: source.autoCheck !== false,
    autoInstall: source.autoInstall === true,
    checkIntervalMinutes:
      Number.isFinite(minutes) && minutes >= 5
        ? Math.min(minutes, 24 * 60 * 7)
        : DEFAULTS.checkIntervalMinutes,
    allowUpdate: source.allowUpdate !== false,
    allowUnsupportedNode: source.allowUnsupportedNode === true,
  }
}

/**
 * The directory of the `@deepseek-ai/dsh` package this process is running from.
 * `process.argv[1]` names the entry script inside that package; the fallback
 * reads the global root of the running Node installation.
 */
function resolveInstallDir() {
  const entry = process.argv[1] ?? ''
  const parts = entry.split(/[\\/]/)
  const marker = parts.lastIndexOf('@deepseek-ai')
  if (marker >= 0 && parts[marker + 1] === 'dsh') return parts.slice(0, marker + 2).join(process.platform === 'win32' ? '\\' : '/')
  return join(dirname(process.execPath), 'node_modules', '@deepseek-ai', 'dsh')
}

/** Parse `major.minor.patch[-prerelease]`; null when the text is not a version. */
function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    String(text ?? '').trim(),
  )
  if (match === null) return null
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] === undefined ? [] : match[4].split('.'),
  }
}

/**
 * Semver precedence between two versions: -1, 0, or 1.
 * Returns null when either side is not a version this plugin can order.
 */
function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === null || b === null) return null
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] < b.core[index] ? -1 : 1
  }
  if (a.pre.length === 0 || b.pre.length === 0) {
    if (a.pre.length === b.pre.length) return 0
    return a.pre.length === 0 ? 1 : -1
  }
  const length = Math.max(a.pre.length, b.pre.length)
  for (let index = 0; index < length; index += 1) {
    const x = a.pre[index]
    const y = b.pre[index]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) return Number(x) < Number(y) ? -1 : 1
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

/** Compare two numeric triplets: -1, 0, or 1. */
function compareTriplets(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1
  }
  return 0
}

/**
 * Evaluate the subset of npm's `engines.node` grammar that published dsh
 * manifests use: `||` groups of space-separated comparators, with `^` and `~`.
 * @param range - the manifest's `engines.node` text.
 * @param current - the running Node version.
 * @returns true or false, or null when the range uses syntax this check omits.
 */
function satisfiesNodeRange(range, current) {
  const running = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(current ?? '').trim())
  if (running === null) return null
  const now = [Number(running[1]), Number(running[2]), Number(running[3])]
  for (const group of String(range).split('||')) {
    const comparators = group.trim().split(/\s+/).filter((part) => part.length > 0)
    if (comparators.length === 0) continue
    let groupHolds = true
    for (const raw of comparators) {
      const match = /^(\^|~|>=|<=|>|<|=)?\s*v?(\d+\.\d+\.\d+)$/.exec(raw)
      if (match === null) return null
      const target = match[2].split('.').map(Number)
      const order = compareTriplets(now, target)
      const operator = match[1] ?? '='
      let holds
      if (operator === '>=') holds = order >= 0
      else if (operator === '>') holds = order > 0
      else if (operator === '<=') holds = order <= 0
      else if (operator === '<') holds = order < 0
      else if (operator === '^') holds = order >= 0 && now[0] === target[0]
      else if (operator === '~') holds = order >= 0 && now[0] === target[0] && now[1] === target[1]
      else holds = order === 0
      if (holds === false) {
        groupHolds = false
        break
      }
    }
    if (groupHolds) return true
  }
  return false
}

/** Answer one route with JSON; the handler owns the whole response. */
function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(text)
}

/** Match the transport's supported accept header or fail with 405. */
function requireMethod(req, res, method) {
  if (req.method === method) return true
  res.setHeader('allow', method)
  sendJson(res, 405, { error: `use ${method}` })
  return false
}

/** Host export: routes, the optional agent tool, and the automatic check. */
export function apply(ctx, config) {
  const settings = normalizeSettings(config)
  const installDir = resolveInstallDir()

  let installed = { version: null, dir: installDir, error: null }
  /**
   * Resolved published release: the version, every dist-tag carrying it, its
   * prerelease flag, and whether this Node runtime satisfies its engines range.
   */
  let latest = {
    channel: settings.channel,
    version: null,
    tags: [],
    prerelease: null,
    engines: { node: null },
    compatible: null,
    checkedAt: null,
    error: null,
  }
  let status = 'unknown'
  let error = null
  let checking = false
  let inflight = null
  /** Last authenticated browser request for the current observation. */
  let lastRequestAt = null
  let update = {
    phase: 'idle',
    fromVersion: null,
    toVersion: null,
    message: null,
    restartRequired: false,
    startedAt: null,
    finishedAt: null,
    outputTail: null,
  }

  /** Everything the Client renders in one snapshot. */
  const snapshot = () => ({
    installed,
    latest,
    status,
    error,
    busy: { checking, updating: update.phase === 'running' },
    update,
    client: { lastRequestAt },
    runtime: { node: process.versions.node },
    settings: {
      channel: settings.channel,
      registry: settings.registry,
      autoCheck: settings.autoCheck,
      autoInstall: settings.autoInstall,
      checkIntervalMinutes: settings.checkIntervalMinutes,
      allowUpdate: settings.allowUpdate,
      allowUnsupportedNode: settings.allowUnsupportedNode,
    },
  })

  /** Read the on-disk package manifest; the disk is the installed-version truth. */
  async function refreshInstalled() {
    try {
      const pkg = JSON.parse(await readFile(join(installDir, 'package.json'), 'utf8'))
      installed = {
        version: typeof pkg.version === 'string' ? pkg.version : null,
        dir: installDir,
        error: null,
      }
    } catch (failure) {
      installed = { version: null, dir: installDir, error: errorText(failure) }
    }
    return installed
  }

  /** Read the dist-tags document for the installed package. */
  async function fetchDistTags() {
    const url = `${settings.registry}/-/package/${encodeURIComponent(PACKAGE_NAME)}/dist-tags`
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`npm registry answered ${response.status} ${response.statusText}`.trim())
    const body = await response.json()
    if (body === null || typeof body !== 'object') throw new Error('npm registry returned no dist-tags')
    return body
  }

  /** Read one published version's manifest, for its `engines.node` requirement. */
  async function fetchManifest(version) {
    const url = `${settings.registry}/${encodeURIComponent(PACKAGE_NAME)}/${encodeURIComponent(version)}`
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
      })
      if (!response.ok) return null
      const body = await response.json()
      return body !== null && typeof body === 'object' ? body : null
    } catch {
      // An unreadable manifest leaves compatibility unknown rather than blocking.
      return null
    }
  }

  /**
   * Pick the release this check compares against: the newest version across all
   * dist-tags for `newest`, otherwise the named tag's version.
   * @param tags - the registry's dist-tag document.
   * @returns the version with every tag carrying it, or null when unavailable.
   */
  function selectTarget(tags) {
    const entries = Object.entries(tags).filter(([, version]) => typeof version === 'string')
    if (entries.length === 0) return null
    if (settings.channel !== 'newest') {
      const named = entries.find(([tag]) => tag === settings.channel)
      return named === undefined ? null : { version: named[1], tags: [named[0]] }
    }
    let best = null
    for (const [tag, version] of entries) {
      if (best === null) {
        best = { version, tags: [tag] }
        continue
      }
      const order = compareVersions(version, best.version)
      if (order !== null && order > 0) best = { version, tags: [tag] }
      else if (order === 0 && !best.tags.includes(tag)) best.tags.push(tag)
    }
    return best
  }

  /** Ask the registry for the newest release and compare it with the install. */
  function check() {
    if (inflight !== null) return inflight
    inflight = (async () => {
      checking = true
      error = null
      try {
        const tags = await fetchDistTags()
        const target = selectTarget(tags)
        if (target === null) {
          throw new Error(
            settings.channel === 'newest'
              ? 'the registry published no dist-tags'
              : `the registry published no "${settings.channel}" tag`,
          )
        }
        await refreshInstalled()
        const order = compareVersions(target.version, installed.version)
        // The requirement only matters when the release is actually installable
        // as an upgrade, so ask for the manifest only then.
        let engines = { node: null }
        let compatible = null
        if (order !== null && order > 0) {
          const manifest = await fetchManifest(target.version)
          const range = manifest === null ? null : manifest.engines?.node
          if (typeof range === 'string') {
            engines = { node: range }
            compatible = satisfiesNodeRange(range, process.versions.node)
          } else if (manifest !== null) {
            compatible = true
          }
        }
        latest = {
          channel: settings.channel,
          version: target.version,
          tags: target.tags,
          prerelease: target.version.includes('-'),
          engines,
          compatible,
          checkedAt: Date.now(),
          error: null,
        }
        if (order === null) {
          status = 'unknown'
          error = `cannot compare ${target.version} with ${String(installed.version)}`
        } else {
          status = order > 0 ? 'update-available' : 'up-to-date'
        }
      } catch (failure) {
        status = 'error'
        error = errorText(failure)
        latest = { ...latest, channel: settings.channel, checkedAt: Date.now(), error }
      } finally {
        checking = false
        inflight = null
      }
      // Opt-in unattended updates: a completed check that found a newer release
      // starts the install. Left off by default because it writes the global
      // npm installation without a user gesture. A release this runtime cannot
      // run is never installed unattended.
      if (
        settings.autoInstall === true &&
        settings.allowUpdate === true &&
        status === 'update-available' &&
        latest.compatible !== false
      ) {
        setTimeout(() => void performUpdate(), 0)
      }
      return snapshot()
    })()
    return inflight
  }

  /** Run the npm global install for one exact published version. */
  function runNpmInstall(version) {
    return new Promise((settle) => {
      const spec = `${PACKAGE_NAME}@${version}`
      const prefix = resolve(installDir, '..', '..', '..')
      const args = [
        'install',
        '--global',
        spec,
        '--prefix',
        prefix,
        '--no-audit',
        '--no-fund',
        '--loglevel=error',
      ]
      const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
      const viaCli = existsSync(npmCli)
      const command = viaCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
      const argv = viaCli ? [npmCli, ...args] : args
      let output = ''
      let child
      try {
        child = spawn(command, argv, {
          cwd: tmpdir(),
          windowsHide: true,
          shell: !viaCli && process.platform === 'win32',
          env: { ...process.env, npm_config_yes: 'true' },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (failure) {
        settle({ ok: false, message: errorText(failure), output })
        return
      }
      const collect = (chunk) => {
        output = (output + chunk.toString()).slice(-OUTPUT_TAIL)
      }
      child.stdout.on('data', collect)
      child.stderr.on('data', collect)
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          /* the process already left */
        }
      }, UPDATE_TIMEOUT_MS)
      child.on('error', (failure) => {
        clearTimeout(timer)
        settle({ ok: false, message: errorText(failure), output })
      })
      child.on('close', (code, signal) => {
        clearTimeout(timer)
        settle({
          ok: code === 0,
          message: code === 0 ? null : `npm exited with ${code ?? signal}`,
          output,
        })
      })
    })
  }

  /** Install the checked published version; a running install is not restarted. */
  async function performUpdate() {
    if (update.phase === 'running') return snapshot()
    if (settings.allowUpdate !== true) {
      update = { ...update, phase: 'failed', message: 'updates are disabled by plugin configuration' }
      return snapshot()
    }
    if (latest.version === null) await check()
    const target = latest.version
    if (target === null) {
      update = {
        ...update,
        phase: 'failed',
        message: error ?? 'no published version is known yet',
        finishedAt: Date.now(),
      }
      return snapshot()
    }
    if (typeof target !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(target)) {
      update = { ...update, phase: 'failed', message: `refusing to install "${String(target)}"`, finishedAt: Date.now() }
      return snapshot()
    }
    // Never install a release this runtime cannot start: the CLI would stop
    // working on the next launch. `allowUnsupportedNode` is the explicit escape.
    if (latest.compatible === false && settings.allowUnsupportedNode !== true) {
      update = {
        ...update,
        phase: 'failed',
        message:
          `dsh ${target} requires Node ${String(latest.engines.node)} ` +
          `and this process runs ${process.versions.node}. Upgrade Node first.`,
        finishedAt: Date.now(),
      }
      return snapshot()
    }
    const from = installed.version
    update = {
      phase: 'running',
      fromVersion: from,
      toVersion: null,
      message: null,
      restartRequired: false,
      startedAt: Date.now(),
      finishedAt: null,
      outputTail: null,
    }
    const result = await runNpmInstall(target)
    await refreshInstalled()
    update = {
      phase: result.ok ? 'succeeded' : 'failed',
      fromVersion: from,
      toVersion: installed.version,
      message: result.ok ? null : (result.message ?? 'npm failed'),
      restartRequired: result.ok && installed.version !== from,
      startedAt: update.startedAt,
      finishedAt: Date.now(),
      outputTail: result.ok ? null : (result.output ?? null),
    }
    if (result.ok) {
      error = null
      const order = compareVersions(target, installed.version)
      status = order !== null && order > 0 ? 'update-available' : 'up-to-date'
      // Keep `checkedAt` as the registry read time: the Client shows the update
      // notice until a later check supersedes it.
      latest = { ...latest, error: null }
    }
    return snapshot()
  }

  /** Answer an untrusted or unauthenticated request; true when it was rejected. */
  const rejected = (req, res) => {
    const rejection = ctx.connection.requestRejection(req)
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: STATE_PATH,
        handler: (req, res) => {
          if (rejected(req, res)) return
          if (!requireMethod(req, res, 'GET')) return
          lastRequestAt = Date.now()
          sendJson(res, 200, snapshot())
        },
      }),
    `dsh-updater: GET ${STATE_PATH}`,
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: CHECK_PATH,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          if (!requireMethod(req, res, 'POST')) return
          sendJson(res, 200, await check())
        },
      }),
    `dsh-updater: POST ${CHECK_PATH}`,
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: UPDATE_PATH,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          if (!requireMethod(req, res, 'POST')) return
          sendJson(res, 200, await performUpdate())
        },
      }),
    `dsh-updater: POST ${UPDATE_PATH}`,
  )

  // The agent shares the UI's operation instead of reimplementing it.
  const tools = ctx.get('tools')
  if (tools !== undefined) {
    ctx.effect(
      () =>
        tools.register({
          name: 'dsh_update',
          description:
            'Check whether the running dsh installation is current, and optionally install the newest release. ' +
            '"check" reads every npm dist-tag, compares the newest published version with the installed one, and reads that ' +
            'release engines.node requirement; "update" runs the npm global install, refusing a release this Node cannot run, ' +
            'after which the dsh process must be restarted. Use this when the user asks about dsh versions or updates.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              action: {
                type: 'string',
                enum: ['status', 'check', 'update'],
                description: 'status reads the current observation; check refreshes it from npm; update installs the newer release.',
              },
            },
          },
          output: {
            schema: {},
            render: (_args, value) => [{ type: 'text', text: describeSnapshot(value) }],
          },
          execute: async (args) => {
            const action = args !== null && typeof args === 'object' ? args.action : undefined
            if (action === 'check') return check()
            if (action === 'update') return performUpdate()
            return snapshot()
          },
        }),
      'dsh-updater: dsh_update tool',
    )
  }

  // Bootstrap: learn the installed version now, the published one shortly after.
  void refreshInstalled()
  if (settings.autoCheck === true) {
    ctx.effect(() => {
      const handle = setTimeout(() => void check(), 3_000)
      return () => clearTimeout(handle)
    }, 'dsh-updater: first check')
    const period = settings.checkIntervalMinutes * 60_000
    ctx.effect(() => {
      const handle = setInterval(() => void check(), period)
      return () => clearInterval(handle)
    }, 'dsh-updater: interval check')
  }
}

/** One-line summary of a snapshot for the agent tool result. */
function describeSnapshot(value) {
  if (value === null || typeof value !== 'object') return 'No update observation is available.'
  const installed = value.installed?.version ?? 'unknown'
  const published = value.latest?.version ?? 'unknown'
  const tags = Array.isArray(value.latest?.tags) && value.latest.tags.length > 0 ? ` (tags: ${value.latest.tags.join(', ')})` : ''
  const lines = [
    `Installed dsh ${installed}; channel "${value.settings?.channel ?? 'newest'}" publishes ${published}${tags}.`,
  ]
  const settings = value.settings
  if (settings !== null && settings !== undefined) {
    lines.push(
      `Policy: automatic checks ${settings.autoCheck === true ? `every ${String(settings.checkIntervalMinutes)} minutes` : 'off'}; ` +
        `automatic installs ${settings.autoInstall === true ? 'on' : 'off'}; installs ${settings.allowUpdate === true ? 'allowed' : 'disabled'}.`,
    )
  }
  if (typeof value.error === 'string' && value.error.length > 0) lines.push(`Last error: ${value.error}`)
  const node = value.runtime === null || value.runtime === undefined ? 'unknown' : value.runtime.node
  if (value.latest?.compatible === false) {
    lines.push(
      `Blocked: ${published} requires Node ${String(value.latest.engines?.node)}; this process runs ${String(node)}.`,
    )
  } else if (value.latest?.compatible === null && typeof value.latest?.engines?.node === 'string') {
    lines.push(`Node requirement unverified: ${value.latest.engines.node} (running ${String(node)}).`)
  }
  const clientRequest = value.client === null || value.client === undefined ? null : value.client.lastRequestAt
  lines.push(
    clientRequest === null || clientRequest === undefined
      ? 'No browser request has reached the update routes yet.'
      : `The browser page last read the update state at ${new Date(clientRequest).toISOString()}.`,
  )
  if (value.status === 'update-available') {
    lines.push(
      value.latest?.compatible === false
        ? 'An update exists, but this Node runtime cannot run it.'
        : 'An update is available.',
    )
  } else if (value.status === 'up-to-date') lines.push('The installation is up to date.')
  else lines.push(`Status: ${String(value.status)}.`)
  const change = value.update
  if (change !== null && typeof change === 'object') {
    if (change.phase === 'succeeded') {
      lines.push(`Installed ${String(change.toVersion)}; ${change.restartRequired === true ? 'restart dsh to use it.' : 'already current.'}`)
    } else if (change.phase === 'failed') {
      lines.push(`Update failed: ${String(change.message)}`)
      if (typeof change.outputTail === 'string' && change.outputTail.length > 0) {
        lines.push(change.outputTail.trim())
      }
    } else if (change.phase === 'running') {
      lines.push('An install is running.')
    }
  }
  return lines.join('\n')
}
