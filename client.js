window.__ModuleLoader__.load({
  id: '@inf-nicolasperez/dsh-updater',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = '@inf-nicolasperez/dsh-updater'

    const ENDPOINTS = {
      state: '/dsh-updater/state',
      check: '/dsh-updater/check',
      update: '/dsh-updater/update',
    }

    /** Simplified Chinese copy; the key set mirrors `en`. */
    const zh = {
      'row.title': 'dsh 更新',
      'action.check': '检查更新',
      'action.checking': '正在检查…',
      'action.update': '更新到 {version}',
      'action.updating': '正在安装…',
      'state.loading': '正在读取版本信息…',
      'state.never': '尚未检查更新。',
      'state.checking': '正在查询 npm 源…',
      'state.current': '已是最新版本（{version}）。',
      'state.available': '有新版本 {version} 可用，当前为 {installed}。',
      'state.error': '检查失败：{message}',
      'state.unsupported': '无法读取已安装的版本。',
      'state.installing': '正在安装 {version}…',
      'state.updated': '已更新到 {version}，重启 dsh 后生效。',
      'state.alreadyLatest': '已安装 {version}，无需重启。',
      'state.updateFailed': '更新失败：{message}',
      'state.checkedAt': '上次检查：{time}',
      'state.channel': '渠道：{channel}',
      'state.tag': '标签：{tag}',
      'state.auto': '新版本会自动安装',
      'state.incompatible': '有新版本 {version} 可用，但它需要 Node {range}，当前运行的是 {current}。',
      'side.label': '检查 dsh 更新',
      'toast.noUpdate': '没有可用更新 — dsh {version} 已是最新版本。',
      'toast.updateAvailable': 'dsh {version} 可用',
      'toast.updateAvailableDetail': '当前版本为 {installed}。要现在安装吗？',
      'toast.incompatible': 'dsh {version} 需要 Node {range}',
      'toast.incompatibleDetail': '当前运行的是 {current}。请先升级 Node，重启 dsh 后再检查。',
      'toast.updateNow': '立即更新',
      'toast.later': '稍后',
      'toast.updating': '正在更新 dsh 到 {version}…',
      'toast.updated': '已更新到 {version}，重启 dsh 后生效。',
      'toast.updatedNoRestart': '已安装 dsh {version}。',
      'toast.updateFailed': '更新失败：{message}',
      'toast.checkFailed': '检查更新失败：{message}',
      'toast.dismiss': '关闭',
    }

    /** English copy; also the fallback when no client dictionary is bound. */
    const en = {
      'row.title': 'dsh updates',
      'action.check': 'Check for updates',
      'action.checking': 'Checking…',
      'action.update': 'Update to {version}',
      'action.updating': 'Installing…',
      'state.loading': 'Reading the installed version…',
      'state.never': 'Not checked yet.',
      'state.checking': 'Asking the npm registry…',
      'state.current': 'Up to date ({version}).',
      'state.available': '{version} is available; this is {installed}.',
      'state.error': 'Check failed: {message}',
      'state.unsupported': 'The installed version could not be read.',
      'state.installing': 'Installing {version}…',
      'state.updated': 'Updated to {version}. Restart dsh to use it.',
      'state.alreadyLatest': 'Installed {version}; no restart needed.',
      'state.updateFailed': 'Update failed: {message}',
      'state.checkedAt': 'Last checked: {time}',
      'state.channel': 'Channel: {channel}',
      'state.tag': 'Tag: {tag}',
      'state.auto': 'New releases install automatically',
      'state.incompatible': '{version} is available, but it needs Node {range} and this runs {current}.',
      'side.label': 'Check for dsh updates',
      'toast.noUpdate': 'No update available — dsh {version} is the latest release.',
      'toast.updateAvailable': 'dsh {version} is available',
      'toast.updateAvailableDetail': 'This is {installed}. Install the newer release now?',
      'toast.incompatible': 'dsh {version} requires Node {range}',
      'toast.incompatibleDetail': 'This process runs {current}. Upgrade Node, restart dsh, then check again.',
      'toast.updateNow': 'Update now',
      'toast.later': 'Not now',
      'toast.updating': 'Updating dsh to {version}…',
      'toast.updated': 'Updated to {version}. Restart dsh to use it.',
      'toast.updatedNoRestart': 'dsh {version} is installed.',
      'toast.updateFailed': 'Update failed: {message}',
      'toast.checkFailed': 'Update check failed: {message}',
      'toast.dismiss': 'Dismiss',
    }

    /** Fill `{name}` placeholders from a plain params object. */
    function interpolate(text, params) {
      if (params === null || params === undefined || typeof text !== 'string') return text
      return text.replace(/\{(\w+)\}/g, (match, key) =>
        Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
      )
    }

    /** Bind the owner-provided translator, falling back to the bundled copy. */
    function translator(bound) {
      return (key, params) => {
        if (typeof bound === 'function') {
          const rendered = bound(key, params)
          if (rendered !== key && typeof rendered === 'string') return interpolate(rendered, params)
        }
        return interpolate(en[key] ?? key, params)
      }
    }

    /** Ask one route for JSON; a failure carries the Host's message. */
    async function request(path, method) {
      const response = await fetch(path, {
        method,
        headers: { accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const text = await response.text()
      let body = null
      try {
        body = text.length > 0 ? JSON.parse(text) : null
      } catch {
        body = null
      }
      if (!response.ok) {
        const message = body !== null && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`
        throw new Error(message)
      }
      // The SPA fallback answers an unclaimed path with HTML and 200, so a
      // missing Host half must not read as an empty observation.
      const mediaType = response.headers.get('content-type') ?? ''
      if (!mediaType.includes('application/json')) {
        throw new Error('the dsh-updater Host half is not serving this path')
      }
      return body
    }

    /**
     * One transient notice at a time. A newer notice replaces the shown one and
     * restarts its timer; `timeoutMs: 0` keeps it up until something replaces it
     * or the user dismisses it.
     */
    function createToasts() {
      let current = null
      let timer = null
      let seq = 0
      const listeners = new Set()
      const emit = () => {
        for (const listener of [...listeners]) listener()
      }
      const stop = () => {
        if (timer !== null) clearTimeout(timer)
        timer = null
      }
      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        getSnapshot() {
          return current
        },
        show(toast) {
          stop()
          current = { ...toast, seq: ++seq }
          if (toast.timeoutMs !== 0) {
            timer = setTimeout(() => {
              timer = null
              current = null
              emit()
            }, toast.timeoutMs ?? 6000)
          }
          emit()
        },
        hide() {
          stop()
          if (current === null) return
          current = null
          emit()
        },
      }
    }

    /** One observation shared by the Settings row and the sidebar button. */
    function createStore() {
      let snapshot = { state: null, loaded: false, error: null, checking: false, updating: false, fetchedAt: 0 }
      const listeners = new Set()
      let t = translator(undefined)
      /** `finishedAt` of the last install outcome already announced. */
      let announcedUpdateAt = null
      const set = (patch) => {
        snapshot = { ...snapshot, ...patch }
        for (const listener of [...listeners]) listener()
      }
      /** Toast one settled install that no earlier toast covered. */
      const announceOutcome = (state) => {
        const change = state === null || state === undefined ? null : state.update
        if (change === null || change === undefined) return false
        if (change.phase !== 'succeeded' && change.phase !== 'failed') return false
        const stamp = change.finishedAt ?? 0
        if (stamp === 0 || stamp === announcedUpdateAt) return false
        announcedUpdateAt = stamp
        if (change.phase === 'succeeded') {
          toasts.show({
            tone: 'success',
            text:
              change.restartRequired === true
                ? t('toast.updated', { version: change.toVersion ?? '' })
                : t('toast.updatedNoRestart', { version: change.toVersion ?? '' }),
            timeoutMs: 12000,
          })
        } else {
          toasts.show({
            tone: 'error',
            text: t('toast.updateFailed', { message: change.message ?? '' }),
            detail: typeof change.outputTail === 'string' && change.outputTail.length > 0 ? lastLines(change.outputTail, 3) : null,
            timeoutMs: 16000,
          })
        }
        return true
      }
      /** Toast the result of one human-triggered check. */
      const announceCheck = (state) => {
        if (state === null || state === undefined) return
        if (state.status === 'update-available') {
          const version = state.latest === null ? '' : (state.latest.version ?? '')
          // A release this runtime cannot start is reported, not offered.
          if (state.latest !== null && state.latest !== undefined && state.latest.compatible === false) {
            toasts.show({
              tone: 'warn',
              text: t('toast.incompatible', {
                version,
                range: state.latest.engines === null || state.latest.engines === undefined ? '' : (state.latest.engines.node ?? ''),
              }),
              detail: t('toast.incompatibleDetail', {
                current: state.runtime === null || state.runtime === undefined ? '' : (state.runtime.node ?? ''),
              }),
              timeoutMs: 20000,
            })
            return
          }
          toasts.show({
            tone: 'update',
            text: t('toast.updateAvailable', { version }),
            detail: t('toast.updateAvailableDetail', {
              installed: state.installed === null ? '' : (state.installed.version ?? ''),
            }),
            actions: [
              { label: t('toast.updateNow'), primary: true, run: () => void store.update() },
              { label: t('toast.later') },
            ],
            timeoutMs: 25000,
          })
          return
        }
        if (state.status === 'up-to-date') {
          toasts.show({
            tone: 'success',
            text: t('toast.noUpdate', { version: state.installed === null ? '' : (state.installed.version ?? '') }),
            timeoutMs: 5000,
          })
          return
        }
        toasts.show({
          tone: 'error',
          text: t('toast.checkFailed', { message: state.error ?? '' }),
          timeoutMs: 14000,
        })
      }
      const store = {
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        getSnapshot() {
          return snapshot
        },
        /** Use the namespace-bound translator that follows the active locale. */
        attachTranslator(bound) {
          t = translator(bound)
        },
        async load() {
          try {
            const state = await request(ENDPOINTS.state, 'GET')
            set({ state, loaded: true, error: null, fetchedAt: Date.now() })
            // An unattended install finishes on the Host: surface it on the next read.
            announceOutcome(state)
          } catch (failure) {
            set({ loaded: true, error: failure instanceof Error ? failure.message : String(failure) })
          }
        },
        async loadIfStale(maxAgeMs) {
          if (Date.now() - snapshot.fetchedAt < maxAgeMs) return
          await store.load()
        },
        async check(announce = false) {
          if (snapshot.checking === true) return
          set({ checking: true, error: null })
          try {
            const state = await request(ENDPOINTS.check, 'POST')
            set({ state, loaded: true, checking: false, error: null, fetchedAt: Date.now() })
            if (announceOutcome(state) === false && announce === true) announceCheck(state)
          } catch (failure) {
            const message = failure instanceof Error ? failure.message : String(failure)
            set({ checking: false, error: message })
            if (announce === true) toasts.show({ tone: 'error', text: t('toast.checkFailed', { message }), timeoutMs: 14000 })
          }
        },
        async update() {
          if (snapshot.updating === true) return
          const target = snapshot.state === null || snapshot.state.latest === null ? '' : (snapshot.state.latest.version ?? '')
          set({ updating: true, error: null })
          toasts.show({ tone: 'busy', text: t('toast.updating', { version: target }), timeoutMs: 0 })
          try {
            const state = await request(ENDPOINTS.update, 'POST')
            set({ state, loaded: true, updating: false, error: null, fetchedAt: Date.now() })
            if (announceOutcome(state) === false) {
              toasts.show({
                tone: 'error',
                text: t('toast.updateFailed', { message: state.error ?? 'no install result was reported' }),
                timeoutMs: 14000,
              })
            }
          } catch (failure) {
            const message = failure instanceof Error ? failure.message : String(failure)
            set({ updating: false, error: message })
            toasts.show({ tone: 'error', text: t('toast.updateFailed', { message }), timeoutMs: 16000 })
          }
        },
        async bootstrap() {
          await store.load()
          const state = snapshot.state
          if (state === null || state.latest === null || state.latest.checkedAt === null) await store.check(false)
        },
      }
      return store
    }

    /** Last `count` non-empty lines of captured command output. */
    function lastLines(text, count) {
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
      return lines.slice(-count).join('\n')
    }

    const toasts = createToasts()
    const store = createStore()
    const useSnapshot = () => React.useSyncExternalStore(store.subscribe, store.getSnapshot)

    /**
     * Keep one mounted surface's observation fresh: read on mount, when the tab
     * becomes visible, and on a slow interval so a transient failure (an early
     * load before the Host half activated) heals without a page reload.
     */
    function useFreshObservation() {
      React.useEffect(() => {
        void store.loadIfStale(120_000)
        const onVisibility = () => {
          if (document.visibilityState === 'visible') void store.loadIfStale(60_000)
        }
        document.addEventListener('visibilitychange', onVisibility)
        const handle = setInterval(() => void store.loadIfStale(240_000), 300_000)
        return () => {
          document.removeEventListener('visibilitychange', onVisibility)
          clearInterval(handle)
        }
      }, [])
    }

    /** The update notice that still applies: newer than the last successful check. */
    function recentUpdate(state) {
      const change = state === null || state === undefined ? null : state.update
      if (change === null || change === undefined) return null
      if (change.phase === 'running') return change
      if (change.phase !== 'succeeded' && change.phase !== 'failed') return null
      const finished = change.finishedAt ?? 0
      const checked = state.latest === null || state.latest === undefined ? 0 : (state.latest.checkedAt ?? 0)
      return finished >= checked ? change : null
    }

    /** One status line: the key, its parameters, and how to color it. */
    function describe(snapshot, t) {
      const state = snapshot.state
      if (snapshot.checking === true || (state !== null && state.busy !== undefined && state.busy.checking === true)) {
        return { text: t('state.checking'), tone: 'busy', available: false }
      }
      if (snapshot.updating === true) {
        const pending = state === null || state.latest === null ? '' : (state.latest.version ?? '')
        return { text: t('state.installing', { version: pending }), tone: 'busy', available: false }
      }
      if (snapshot.error !== null) return { text: t('state.error', { message: snapshot.error }), tone: 'error', available: false }
      if (state === null) return { text: t('state.loading'), tone: 'idle', available: false }
      const change = recentUpdate(state)
      if (change !== null && change.phase === 'running') {
        const version = state.latest === null ? '' : (state.latest.version ?? '')
        return { text: t('state.installing', { version }), tone: 'busy', available: false }
      }
      if (change !== null && change.phase === 'succeeded') {
        const text = change.restartRequired === true
          ? t('state.updated', { version: change.toVersion ?? '' })
          : t('state.alreadyLatest', { version: change.toVersion ?? '' })
        return { text, tone: 'success', available: false }
      }
      if (change !== null && change.phase === 'failed') {
        return { text: t('state.updateFailed', { message: change.message ?? '' }), tone: 'error', available: false, log: change.outputTail }
      }
      if (state.status === 'error') {
        return { text: t('state.error', { message: state.error ?? '' }), tone: 'error', available: false }
      }
      if (state.installed !== null && state.installed !== undefined && state.installed.version === null) {
        return { text: t('state.unsupported'), tone: 'error', available: false }
      }
      if (state.status === 'update-available') {
        const version = state.latest === null ? '' : (state.latest.version ?? '')
        const installedVersion = state.installed === null ? '' : (state.installed.version ?? '')
        // A release this Node runtime cannot start is never offered as actionable.
        if (state.latest !== null && state.latest !== undefined && state.latest.compatible === false) {
          return {
            text: t('state.incompatible', {
              version,
              range: state.latest.engines === null || state.latest.engines === undefined ? '' : (state.latest.engines.node ?? ''),
              current: state.runtime === null || state.runtime === undefined ? '' : (state.runtime.node ?? ''),
            }),
            tone: 'warn',
            available: false,
          }
        }
        return {
          text: t('state.available', { version, installed: installedVersion }),
          tone: 'warn',
          available: state.settings === null || state.settings === undefined || state.settings.allowUpdate !== false,
        }
      }
      if (state.status === 'up-to-date') {
        const version = state.installed === null ? '' : (state.installed.version ?? '')
        return { text: t('state.current', { version }), tone: 'ok', available: false }
      }
      return { text: t('state.never'), tone: 'idle', available: false }
    }

    /** Shared spinner/status glyph. */
    function RefreshIcon({ spinning }) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 16,
          height: 16,
          'aria-hidden': true,
          className: spinning === true ? 'dshupd_spin' : undefined,
          style: { display: 'block', flex: 'none' },
        },
        h('path', {
          d: 'M13.5 8a5.5 5.5 0 1 1-1.62-3.9',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M13.6 2.2v3.1h-3.1',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    /** Tone glyph for one toast: check, warning, install arrow, or a spinner. */
    function Glyph({ tone }) {
      const frame = { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true, style: { display: 'block' } }
      if (tone === 'success') {
        return h(
          'svg',
          frame,
          h('path', {
            d: 'M3.2 8.4l3 3 6.6-6.9',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.7,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }),
        )
      }
      if (tone === 'error' || tone === 'warn') {
        return h(
          'svg',
          frame,
          h('path', {
            d: 'M8 2.3l6 10.5H2z',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.4,
            strokeLinejoin: 'round',
          }),
          h('path', { d: 'M8 6.5v3', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
          h('path', { d: 'M8 11.4h.01', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }),
        )
      }
      if (tone === 'busy') return h(RefreshIcon, { spinning: true })
      return h(
        'svg',
        frame,
        h('path', { d: 'M8 2v7', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
        h('path', {
          d: 'M4.6 6.2L8 9.6l3.4-3.4',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M3 13h10', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
      )
    }

    const TOAST_CSS = `
.dshupd_toastLayer{position:fixed;right:20px;bottom:20px;z-index:60;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none}
.dshupd_toast{pointer-events:auto;display:flex;align-items:flex-start;gap:10px;max-width:min(420px,calc(100vw - 40px));padding:10px 10px 10px 12px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;box-shadow:0 8px 28px rgb(0 0 0 / 18%);animation:dshupd-toast-in 160ms ease-out}
.dshupd_toastGlyph{flex:none;margin-top:1px;color:var(--dsw-alias-label-secondary)}
.dshupd_toast[data-tone="success"] .dshupd_toastGlyph{color:var(--dsw-alias-state-success-primary)}
.dshupd_toast[data-tone="error"] .dshupd_toastGlyph{color:var(--dsw-alias-state-error-primary)}
.dshupd_toast[data-tone="warn"] .dshupd_toastGlyph{color:var(--dsw-alias-state-warn-primary)}
.dshupd_toast[data-tone="update"] .dshupd_toastGlyph,.dshupd_toast[data-tone="busy"] .dshupd_toastGlyph{color:var(--dsw-alias-brand-primary)}
.dshupd_toastBody{flex:1 1 auto;min-width:0}
.dshupd_toastText{font-weight:500;overflow-wrap:anywhere}
.dshupd_toastDetail{margin-top:2px;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.dshupd_toastLog{margin:6px 0 0;padding:6px 8px;border-radius:6px;max-height:72px;overflow:auto;white-space:pre-wrap;font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
.dshupd_toastActions{display:flex;align-items:center;gap:8px;margin-top:8px}
.dshupd_toastAction{height:26px;padding:0 10px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;line-height:1;white-space:nowrap;cursor:pointer}
.dshupd_toastAction:hover{background:var(--dsw-alias-bg-layer-2)}
.dshupd_toastAction[data-primary="true"]{border-color:transparent;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-weight:600}
.dshupd_toastAction[data-primary="true"]:hover{opacity:.9}
.dshupd_toastClose{flex:none;width:22px;height:22px;display:flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:15px;line-height:1;cursor:pointer}
.dshupd_toastClose:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
@keyframes dshupd-toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
`

    /** Frame-wide overlay entry: the one transient notice this plugin shows. */
    function ToastHost(props) {
      const t = translator(props.t)
      const toast = React.useSyncExternalStore(toasts.subscribe, toasts.getSnapshot)
      if (toast === null) return null
      const actions = Array.isArray(toast.actions) ? toast.actions : []
      return h(
        'div',
        { className: 'dshupd_toastLayer' },
        h('style', { 'data-dsh-updater': 'toast' }, TOAST_CSS),
        h(
          'div',
          {
            className: 'dshupd_toast',
            'data-tone': toast.tone ?? 'info',
            role: 'status',
            'aria-live': 'polite',
          },
          h('span', { className: 'dshupd_toastGlyph' }, h(Glyph, { tone: toast.tone })),
          h(
            'div',
            { className: 'dshupd_toastBody' },
            h('div', { className: 'dshupd_toastText' }, toast.text),
            typeof toast.detail === 'string' && toast.detail.length > 0
              ? h('div', { className: 'dshupd_toastDetail' }, toast.detail)
              : null,
            typeof toast.log === 'string' && toast.log.length > 0
              ? h('pre', { className: 'dshupd_toastLog' }, toast.log)
              : null,
            actions.length === 0
              ? null
              : h(
                  'div',
                  { className: 'dshupd_toastActions' },
                  actions.map((action, index) =>
                    h(
                      'button',
                      {
                        key: `${String(toast.seq)}-${String(index)}`,
                        type: 'button',
                        className: 'dshupd_toastAction',
                        'data-primary': action.primary === true ? 'true' : 'false',
                        onClick: () => {
                          toasts.hide()
                          if (typeof action.run === 'function') void action.run()
                        },
                      },
                      action.label,
                    ),
                  ),
                ),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dshupd_toastClose',
              'aria-label': t('toast.dismiss'),
              title: t('toast.dismiss'),
              onClick: () => toasts.hide(),
            },
            '×',
          ),
        ),
      )
    }

    const ROW_CSS = `
.dshupd_row{justify-content:space-between;align-items:flex-start;gap:24px;padding:16px 0;display:flex;color:var(--dsw-alias-label-primary)}.dshupd_text{min-width:0}
.dshupd_title{font-size:14px;line-height:20px}
.dshupd_description{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dshupd_description[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}
.dshupd_description[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary)}
.dshupd_meta{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);opacity:.75}
.dshupd_actions{display:flex;flex:none;align-items:center;gap:8px}
.dshupd_button{height:28px;padding:0 12px;border-radius:6px;font-size:13px;line-height:1;white-space:nowrap;cursor:pointer;color:var(--dsw-alias-label-primary);background:transparent;border:.5px solid var(--dsw-alias-border-l2)}
.dshupd_button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dshupd_button:disabled{opacity:.55;cursor:default}
.dshupd_primary{color:var(--dsw-alias-bg-base);background:var(--dsw-alias-brand-primary);border-color:transparent}
.dshupd_primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);opacity:.9}
.dshupd_log{margin:8px 0 0;padding:8px;border-radius:6px;max-height:96px;overflow:auto;white-space:pre-wrap;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
`

    const SIDE_CSS = `
.dshupd_side{position:relative;display:flex;align-items:center;gap:8px;width:100%;height:28px;padding:0 6px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1;white-space:nowrap;overflow:hidden;cursor:pointer;text-align:left}
.dshupd_side:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshupd_side:disabled{opacity:.55;cursor:default}
.dshupd_side[data-wide="false"]{width:100%;flex:none;justify-content:center;padding:0}
.dshupd_sideLabel{overflow:hidden;text-overflow:ellipsis}
.dshupd_dot{position:absolute;top:2px;right:2px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary)}
.dshupd_spin{animation:dshupd-spin 1s linear infinite}
@keyframes dshupd-spin{to{transform:rotate(360deg)}}
`

    /** Settings → General row: full state, Check, and Update. */
    function UpdateRow(props) {
      const t = translator(props.t)
      const snapshot = useSnapshot()
      const view = describe(snapshot, t)
      const state = snapshot.state
      const busy = snapshot.checking === true || snapshot.updating === true || (state !== null && state.busy !== undefined && (state.busy.checking === true || state.busy.updating === true))
      useFreshObservation()
      const checkedAt = state !== null && state.latest !== null && state.latest.checkedAt !== null
        ? new Date(state.latest.checkedAt).toLocaleString()
        : null
      const autoInstall = state !== null && state.settings !== null && state.settings !== undefined && state.settings.autoInstall === true
      const channel = state === null || state.settings === null || state.settings === undefined ? null : (state.settings.channel ?? null)
      const tags = state === null || state.latest === null || state.latest === undefined || !Array.isArray(state.latest.tags) ? [] : state.latest.tags
      const meta = [
        checkedAt === null ? null : t('state.checkedAt', { time: checkedAt }),
        channel === null ? null : t('state.channel', { channel }),
        tags.length === 0 ? null : t('state.tag', { tag: tags.join(', ') }),
        autoInstall ? t('state.auto') : null,
      ].filter((part) => part !== null)
      const updateButton =
        view.available === true
          ? h(
              'button',
              {
                type: 'button',
                className: 'dshupd_button dshupd_primary',
                disabled: busy,
                onClick: () => void store.update(),
              },
              snapshot.updating === true
                ? t('action.updating')
                : t('action.update', { version: state.latest === null ? '' : (state.latest.version ?? '') }),
            )
          : null
      return h(
        'div',
        { className: 'dshupd_row' },
        h('style', { 'data-dsh-updater': 'row' }, ROW_CSS),
        h(
          'div',
          { className: 'dshupd_text' },
          h('div', { className: 'dshupd_title' }, t('row.title')),
          h('div', { className: 'dshupd_description', 'data-tone': view.tone }, view.text),
          checkedAt === null && autoInstall === false
            ? null
            : h('div', { className: 'dshupd_meta' }, meta.join(' · ')),
          typeof view.log === 'string' && view.log.length > 0 ? h('pre', { className: 'dshupd_log' }, view.log.trim()) : null,
        ),
        h(
          'div',
          { className: 'dshupd_actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'dshupd_button',
              disabled: busy,
              onClick: () => void store.check(true),
            },
            snapshot.checking === true ? t('action.checking') : t('action.check'),
          ),
          updateButton,
        ),
      )
    }

    /** Sidebar foot action: compact status plus one click to check. */
    function UpdateButton(props) {
      const t = translator(props.t)
      const snapshot = useSnapshot()
      const view = describe(snapshot, t)
      const wide = props.wide !== false
      const busy = snapshot.checking === true || (snapshot.state !== null && snapshot.state.busy !== undefined && snapshot.state.busy.checking === true)
      useFreshObservation()
      return h(
        'button',
        {
          type: 'button',
          className: 'dshupd_side',
          'data-wide': wide ? 'true' : 'false',
          title: view.text,
          'aria-label': view.text,
          'aria-busy': busy,
          disabled: busy,
          onClick: () => void store.check(true),
        },
        h('style', { 'data-dsh-updater': 'side' }, SIDE_CSS),
        h(RefreshIcon, { spinning: busy }),
        wide ? h('span', { className: 'dshupd_sideLabel' }, t('side.label')) : null,
        view.available === true ? h('span', { className: 'dshupd_dot', 'aria-hidden': true }) : null,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-updater: dictionaries')
        // Toast copy is composed when the notice is raised, from the live locale.
        store.attachTranslator(ctx.locale.bind(NS))
        ctx.slots.inject('settings.general.item', () =>
          ctx.slots.register(
            { name: 'settings.general.item', id: 'dsh-updater', order: 101, locale: NS },
            UpdateRow,
          ),
        )
        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register(
            { name: 'sidebar.footer.action', id: 'dsh-updater', order: 5, locale: NS },
            UpdateButton,
          ),
        )
        // Frame-wide floating layer: the transient notice outlives whichever
        // surface raised it, and closes over the whole application.
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'dsh-updater-toast', order: 100, locale: NS }, ToastHost),
        )
        void store.bootstrap()
      },
    }
  },
})
