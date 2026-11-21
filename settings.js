/**
 * MiOpIIk IUI — the plugin's own page: Plugins → Installed → MiOpIIk IUI.
 *
 * One surface, no essays: the browser-local render switch, a live preview,
 * a one-line status, and a copyable sample. No separate settings tab is
 * registered; everything the user can adjust or wants to see lives here.
 * Trusted plugin chrome only: theme tokens, no gradients, no fake switches.
 */
const IUI_PREF_KEY = 'miopiik.markdownEmbeds'

const IUI_PREVIEW_ML = `<ui title="活动概览" fallback="7 日活跃 1,248；30 日活跃 4,826">
  <state name="v" value='{"range":{"total":"1,248","change":"+12.6%","points":[["一",92],["二",118],["三",105],["四",148],["五",167],["六",191],["日",220]]},"detail":true,"q":""}'/>
  <column>
    <metric label="活跃访问" value="$state.v.range.total" unit="次" delta="$state.v.range.change"/>
    <segmented bind="$state.v.range" options='[{"label":"近 7 天","value":{"total":"1,248","change":"+12.6%","points":[["一",92],["二",118],["三",105],["四",148],["五",167],["六",191],["日",220]]}},{"label":"近 30 天","value":{"total":"4,826","change":"+8.3%","points":[["第1周",940],["第2周",1080],["第3周",1275],["第4周",1531]]}}]'/>
    <chart kind="line" series="$state.v.range.points" source="虚构演示数据"/>
    <toggle label="明细表" bind="$state.v.detail"/>
    <input bind="$state.v.q" placeholder="过滤渠道…"/>
    <table columns='["渠道","活跃"]' rows='[["Web 客户端",742],["CLI",331],["API",175]]' caption="虚构演示数据" filter="$state.v.q" when="$state.v.detail"/>
  </column>
</ui>`
const IUI_SAMPLE_MARKDOWN = String.fromCharCode(96).repeat(3) + 'iui\n' + IUI_PREVIEW_ML + '\n' + String.fromCharCode(96).repeat(3)

function iuiIsEnabled() {
  try { return localStorage.getItem(IUI_PREF_KEY) !== '0' } catch { return true }
}

// 实验补丁是否在宿主侧生效：由 chat 插件 fork 在加载时置位；原生 DSH 不会有这个标记。
function hostPatchActive() {
  try {
    return globalThis.__miopiikMarkdownEmbedsHost === true
  } catch {
    return false
  }
}

function iuiRegistry() {
  const registry = globalThis.__miopiikMarkdownEmbeds
  return typeof registry?.renderBlock === 'function' && typeof registry?.renderInline === 'function' ? registry : null
}

// Official primitives when the running DSH shell exposes them; plain token
// elements otherwise so the page never breaks on a foreign shell.
let IUI_PRIMITIVES = null
try {
  IUI_PRIMITIVES = require('@deepseek-ai/dsh-client-ui-primitives')
} catch {
  IUI_PRIMITIVES = null
}
const IuiSwitch = IUI_PRIMITIVES?.Switch
const IuiButton = IUI_PRIMITIVES?.Button

const IUI_PAGE = {
  root: {
    display: 'flex', flexDirection: 'column', gap: 16,
    width: '100%', minWidth: 0, boxSizing: 'border-box',
    color: 'var(--dsw-alias-label-primary)', fontFamily: 'inherit',
  },
  section: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  title: { margin: 0, fontSize: 13, fontWeight: 500, lineHeight: '18px' },
  hint: {
    margin: 0, fontSize: 12, lineHeight: '18px',
    color: 'var(--dsw-alias-label-tertiary)', overflowWrap: 'anywhere',
  },
  switchRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 0', minWidth: 0,
    borderTop: '.5px solid var(--dsw-alias-border-l2)',
    borderBottom: '.5px solid var(--dsw-alias-border-l2)',
  },
  switchLabel: { fontSize: 13, fontWeight: 500, lineHeight: '20px', flex: 'none' },
  status: {
    display: 'flex', gap: 10, flexWrap: 'wrap',
    fontSize: 11.5, lineHeight: '16px',
    color: 'var(--dsw-alias-label-tertiary)',
  },
  pre: {
    margin: 0, padding: '10px 12px', maxWidth: '100%', overflowX: 'auto',
    border: '.5px solid var(--dsw-alias-border-l1)',
    borderRadius: 'var(--dsw-radius-md)',
    background: 'var(--dsw-alias-bg-module-platform)',
    fontFamily: 'var(--ds-font-family-code, var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace))',
    fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-primary)',
    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
  },
  preview: {
    border: '.5px solid var(--dsw-alias-border-l4)',
    borderRadius: 'var(--dsw-radius-lg)',
    background: 'var(--dsw-alias-bg-layer-1)',
    padding: '12px clamp(9px, 2vw, 17px)', minHeight: 142, minWidth: 0, overflow: 'hidden',
  },
  actions: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
}

function IuiActionButton({ onClick, children }) {
  if (IuiButton) return h(IuiButton, { variant: 'outline', size: 'sm', onClick }, children)
  return h(
    'button',
    {
      type: 'button',
      onClick,
      style: {
        height: 28, padding: '0 10px',
        border: '.5px solid var(--dsw-alias-border-l4)',
        borderRadius: 'var(--dsw-radius-md)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)', font: 'inherit', fontSize: 12.5, cursor: 'pointer',
      },
    },
    children,
  )
}

function IuiToggle({ enabled, onToggle }) {
  if (IuiSwitch) {
    return h(IuiSwitch, { checked: enabled, onChange: onToggle, label: '在聊天中显示 IUI', title: '在聊天中显示 IUI' })
  }
  return h(
    'button',
    {
      type: 'button',
      role: 'switch',
      'aria-checked': enabled,
      'aria-label': '在聊天中显示 IUI',
      'data-iui-settings-toggle': '1',
      onClick: onToggle,
      style: {
        boxSizing: 'border-box', position: 'relative', flex: '0 0 auto',
        width: 36, height: 20, padding: 2, border: 0, borderRadius: 999,
        background: enabled ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l3)',
        cursor: 'pointer',
      },
    },
    h('span', {
      'aria-hidden': true,
      style: {
        display: 'block', width: 16, height: 16, borderRadius: '50%',
        background: enabled ? 'var(--dsw-alias-label-primary-foreground)' : 'var(--dsw-alias-switch-thumb)',
        transform: enabled ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform .12s ease',
      },
    }),
  )
}

/** The one real page: switch, live preview, one status line, copyable sample. */
function IuiPluginPage() {
  const [enabled, setEnabled] = React.useState(iuiIsEnabled)
  const [error, setError] = React.useState('')
  const [copyMessage, setCopyMessage] = React.useState('')
  const registry = iuiRegistry()
  const ready = registry !== null
  const patched = hostPatchActive()

  const toggle = () => {
    const next = !enabled
    try {
      localStorage.setItem(IUI_PREF_KEY, next ? '1' : '0')
      setEnabled(next)
      setError('')
      // The host memoizes Markdown nodes: refresh to rehydrate historical messages.
      if (typeof location !== 'undefined' && typeof location.reload === 'function') location.reload()
    } catch {
      setError('无法保存设置。请检查此网站的浏览器存储权限。')
    }
  }
  const copySample = async () => {
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error('clipboard unavailable')
      await globalThis.navigator.clipboard.writeText(IUI_SAMPLE_MARKDOWN)
      setCopyMessage('已复制可直接发送的 IUI 示例')
    } catch {
      setCopyMessage('复制不可用，请手动选择下方文本')
    }
  }

  return h(
    'div',
    { 'data-iui-plugin-settings': '1', style: IUI_PAGE.root },
    h('p', { style: IUI_PAGE.hint }, '模型在回复里书写受控 iui 围栏，本插件把它渲染成界面组件；不注册工具、不产生消息。'),
    h(
      'div',
      { style: IUI_PAGE.switchRow },
      h('span', { style: IUI_PAGE.switchLabel }, '在聊天中显示 IUI'),
      h('span', { 'data-iui-settings-status': enabled ? 'enabled' : 'disabled', style: IUI_PAGE.hint }, enabled ? '已开启 · 仅作用于当前浏览器' : '已关闭 · iui 围栏按代码块显示'),
      h(IuiToggle, { enabled, onToggle: toggle }),
    ),
    error ? h('p', { role: 'alert', style: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' } }, error) : null,
    h(
      'section',
      { style: IUI_PAGE.section },
      h('h3', { style: IUI_PAGE.title }, '实时预览'),
      h(
        'div',
        { 'data-iui-settings-preview': enabled && ready ? 'live' : 'paused', style: IUI_PAGE.preview },
        enabled && ready
          ? registry.renderBlock(IUI_PREVIEW_ML)
          : h(
              'div',
              { role: 'status', style: { minHeight: 142, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 5, color: 'var(--dsw-alias-label-tertiary)' } },
              h('strong', { style: { fontSize: 12, fontWeight: 650 } }, ready ? '预览已暂停' : '渲染器未连接'),
              h('span', { style: { fontSize: 11, textAlign: 'center', overflowWrap: 'anywhere' } }, ready ? '开启「在聊天中显示 IUI」即可恢复预览。' : '请检查插件加载状态后刷新页面。'),
            ),
      ),
    ),
    h(
      'div',
      { 'data-iui-plugin-status': '1', style: IUI_PAGE.status },
      h('span', { 'data-iui-plugin-version': '1' }, 'v' + IUI_PLUGIN_VERSION),
      h('span', { 'data-iui-patch-state': patched ? 'loaded' : 'missing' }, patched ? '宿主补丁已加载' : '未检测到补丁 · 仅预览可用'),
      h('span', { 'data-iui-registry-state': ready ? 'ready' : 'unavailable' }, ready ? '渲染器已连接' : '渲染器未连接'),
    ),
    h(
      'section',
      { style: IUI_PAGE.section },
      h('h3', { style: IUI_PAGE.title }, '示例与复制'),
      h('p', { style: IUI_PAGE.hint }, '粘贴到任意 DSH 会话即可测试。'),
      h('pre', { 'data-iui-preview-source': '1', style: IUI_PAGE.pre }, IUI_SAMPLE_MARKDOWN),
      h(
        'div',
        { style: IUI_PAGE.actions },
        h(IuiActionButton, { onClick: copySample }, '复制示例'),
        h('span', { role: 'status', 'data-iui-copy-status': '1', style: IUI_PAGE.hint }, copyMessage),
      ),
    ),
  )
}

function registerIuiSettings(ctx) {
  if (!ctx.slots || typeof ctx.slots.inject !== 'function') return
  // 唯一入口：插件页承载全部可调项与状态；不再注册设置页页签。
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: 'miopiik-iui',
  }, () => h(IuiPluginPage)))
}
