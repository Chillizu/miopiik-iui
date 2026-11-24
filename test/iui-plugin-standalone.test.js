import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Script, createContext } from 'node:vm'
import { apply as hostApply, Config, IUI_CHARTER, IUI_VISUAL_GUIDANCE } from '../index.js'
import { parseMiopiikMl } from '../shared/miopiik-ml.js'
import { validateAst } from '../shared/iui-ast.js'

const path = new URL('../', import.meta.url)
const text = (file) => readFileSync(new URL(file, path), 'utf8')

function loadStandalonePlugin({ preference = null, configForm } = {}) {
  let loaded
  let copied = ''
  const React = {
    createElement(type, props, ...children) { return { type, props: props ?? {}, children } },
    useMemo(value) { return value() },
    useState(value) { return [typeof value === 'function' ? value() : value, () => {}] },
    useEffect() {},
    useLayoutEffect() {},
    useRef() { return { current: null } },
    useCallback(value) { return value },
    useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot() },
  }
  // The page prefers the official primitives; the stub keeps the same contract.
  const primitives = {
    Switch({ checked, onChange, label, disabled }) {
      return React.createElement('button', {
        role: 'switch', 'aria-checked': checked, 'aria-label': label, disabled,
        onClick: () => !disabled && onChange(!checked),
      })
    },
    Button({ onClick, children }) { return React.createElement('button', { onClick }, children) },
  }
  const storage = new Map(preference === null ? [] : [['miopiik.markdownEmbeds', preference]])
  let reloads = 0
  const sandbox = {
    console,
    localStorage: { getItem(key) { return storage.get(key) ?? null }, setItem(key, value) { storage.set(key, value) } },
    location: { reload() { reloads += 1 } },
    navigator: { clipboard: { writeText(value) { copied = value; return Promise.resolve() } } },
  }
  sandbox.window = sandbox
  sandbox.__ModuleLoader__ = { load(value) { loaded = value } }
  createContext(sandbox)
  new Script(text('client.js'), { filename: 'client.js' }).runInContext(sandbox, { timeout: 3000 })
  assert.equal(loaded.id, 'miopiik-iui')
  const plugin = loaded.factory((name) => {
    if (name === 'react') return React
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error('unexpected dependency: ' + name)
  })
  assert.equal(Array.from(plugin.inject).join(','), 'slots', 'DSH slot API requires explicit Cordis injection')
  let dispose = null
  const slots = []
  plugin.apply({
    effect(callback) { dispose = callback() },
    ...(configForm === undefined ? {} : {
      inject(names, callback) {
        assert.equal(Array.from(names).join(','), 'configForms')
        callback({ configForms: { get(id) { assert.equal(id, 'miopiik-iui'); return configForm } } })
      },
    }),
    slots: {
      inject(name, register) {
        assert.ok(['plugins.bundle.config', 'settings.plugins.tab'].includes(name), 'unexpected slot: ' + name)
        register()
      },
      register(metadata, render) { slots.push({ metadata, render }); return () => {} },
    },
  })
  return { sandbox, registry: sandbox.__miopiikMarkdownEmbeds, dispose, slots, storage, getReloads: () => reloads, getCopied: () => copied }
}

/** Render host nodes recursively; function components receive their props. */
function render(node) {
  if (node === null || node === undefined || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(render)
  if (typeof node.type === 'function') return render(node.type({ ...node.props, children: node.children }))
  return [node, ...(node.children ?? []).flatMap(render)]
}

function slotBy(slots, name) {
  const entry = slots.find((slot) => slot.metadata.name === name)
  assert.ok(entry !== undefined, 'missing slot: ' + name)
  return entry
}

function renderPage(slots, props = { view: 'page' }) {
  return render(slotBy(slots, 'plugins.bundle.config').render(props))
}

test('独立包不依赖 MiOpIIk Agent，也不注册旧工具', () => {
  const manifest = JSON.parse(text('package.json'))
  assert.equal(manifest.name, 'miopiik-iui')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(manifest.exports['./client'])
  // 单包：零依赖，清单与源码都不引用 Agent 包
  assert.equal(manifest.dependencies, undefined, 'IUI 必须零运行时依赖')
  assert.equal(text('package.json').includes('miopiik-dsh'), false)
  assert.doesNotMatch(text('index.js'), /miopiik-dsh|ink_view|ink_chart/u)
  assert.doesNotMatch(text('client.js'), /ink_view|ink_chart|miopiikBackstage/u)
  // 能力只经自己的浏览器注册表暴露，不占用 Agent 工具面
  assert.match(text('client.js'), /globalThis\.__miopiikMarkdownEmbeds = registry/u)
  assert.match(text('index.js'), /systemPrompt/u)
  assert.doesNotMatch(text('index.js'), /ink_/u)
})

test('Host 输出约定独立注入，不占用工具面', () => {
  const sections = []
  hostApply({
    inject(names, callback) {
      assert.deepEqual(names, ['systemPrompt'])
      callback({ systemPrompt: { section(value) { sections.push(value) } } })
    },
  })
  assert.equal(sections.length, 2)
  assert.equal(sections[0].name, 'miopiik-iui:render-contract')
  assert.match(sections[0].text, /miopiik-ml/u)
  assert.equal(sections[1].text(), '')
  assert.match(IUI_CHARTER, /由你按内容判断/u)
  assert.doesNotMatch(IUI_CHARTER, /优先普通 Markdown/u)
})

test('视觉构思默认关闭，profile 的 volatile 更新只改变额外提示段', () => {
  const write = Symbol.for('cosmokit.volatile.write')
  const config = Config()
  const other = Config()
  assert.equal(other.enhancedVisuals.get(), false)
  assert.throws(() => Config({ enhancedVisuals: 'false' }), /Expected a boolean/u)
  const schema = Config.toJSON()
  const field = schema.refs[schema.refs[schema.uid].dict.enhancedVisuals]
  assert.deepEqual(field, { type: 'boolean', meta: { default: false, volatile: true } })
  const childSchema = Config.dict.enhancedVisuals.toJSON()
  delete childSchema.refs[childSchema.uid].meta.volatile
  assert.equal(Config.dict.enhancedVisuals.meta.volatile, true, '宿主移除表单的 volatile 标记时不应改写源 schema')

  const sections = []
  hostApply({ inject(_names, callback) {
    callback({ systemPrompt: { section(value) { sections.push(value) } } })
  } }, config)
  assert.equal(sections[1].name, 'miopiik-iui:visual-guidance')
  assert.equal(sections[1].interpolate, false)
  assert.equal(sections[1].text(), '')
  config.enhancedVisuals[write](true)
  assert.equal(sections[1].text(), IUI_VISUAL_GUIDANCE)
  assert.equal(sections[0].text, IUI_CHARTER)
  assert.equal(other.enhancedVisuals.get(), false)
  config.enhancedVisuals[write](false)
  assert.equal(sections[1].text(), '')
})

test('客户端在没有 Mind/Ink/Operator 时可加载、渲染并注销', () => {
  const { sandbox, registry, dispose } = loadStandalonePlugin()
  assert.equal(typeof registry.segments, 'function')
  assert.equal(typeof registry.renderBlock, 'function')
  assert.equal(typeof registry.renderInline, 'function')
  const fence = String.fromCharCode(96).repeat(3)
  const segments = registry.segments('状态 {{badge:success:完成}}\n' + fence + 'iui\n<ui><metric label="次数" value="12"/></ui>\n' + fence)
  assert.equal(segments.filter((x) => x.kind === 'inline').length, 1)
  assert.equal(segments.filter((x) => x.kind === 'block').length, 1)
  const sample = '<ui title="演示" fallback="12次"><metric label="次数" value="12" unit="次"/></ui>'
  const parsed = parseMiopiikMl(sample)
  assert.equal(validateAst(parsed.doc).ok, true)
  const element = registry.renderBlock(sample)
  assert.equal(typeof element.type, 'function')
  const output = element.type(element.props)
  assert.equal(output.props['data-iui-output'], 'ok')
  assert.equal(output.props['data-iui-degraded'], '0')
  dispose()
  assert.equal(sandbox.__miopiikMarkdownEmbeds, undefined)
})

test('局部、整块和流式兜底保留读者文本并分离诊断', () => {
  const { registry } = loadStandalonePlugin()
  const renderText = (node) => render(node).flatMap((element) => element.children ?? [])
    .flat(Infinity).filter((child) => typeof child === 'string').join(' ')

  const invalid = registry.renderBlock('<ui fallback="读者说明"></ui>')
  assert.equal(invalid.props['data-iui-output'], 'invalid')
  assert.match(invalid.props['data-iui-diagnostics'], /没有可渲染内容/u)
  assert.equal(renderText(invalid), '读者说明')
  assert.equal(renderText(registry.renderBlock('{"root":')), '这部分内容暂不可用。')

  const partial = registry.renderBlock('<ui><text>解说里的 $state.x 是一个符号</text><unknown fallback="原节点说明"/><slider label="坏控件"/><text text="$state.missing"/></ui>')
  assert.match(renderText(partial), /解说里的 \$state\.x 是一个符号 原节点说明/u)
  assert.doesNotMatch(renderText(partial), /未知标签|bind=|\$state\.missing/u)
  assert.ok(!render(partial).some((node) => node.type === 'input'))
  assert.ok(render(partial).some((node) => node.props['data-iui-partial'] === '1'))

  const live = registry.renderBlockStreaming('<ui><column><metric label="已经完成" value="1"/><slider label="还没写完')
  assert.match(renderText(live), /已经完成 1/u)
  assert.doesNotMatch(renderText(live), /还没写完|没有闭合|暂不可用/u)
  assert.equal(registry.renderBlockStreaming('<ui').props.hidden, true)
})

test('插件页承载全部设置：一个开关 + 实时预览 + 状态行 + 可复制示例，不再注册设置页页签', async () => {
  const { slots, storage, getReloads, getCopied } = loadStandalonePlugin()
  assert.equal(slots.length, 1, '只应注册 plugins.bundle.config 一个插槽')
  assert.equal(slots[0].metadata.name, 'plugins.bundle.config')
  assert.equal(slots[0].metadata.key, 'miopiik-iui')
  const nodes = renderPage(slots)
  assert.ok(nodes.some((node) => node.props?.['data-iui-plugin-settings'] === '1'))
  assert.equal(nodes.filter((node) => node.props?.role === 'tab').length, 0, '插件页不该有二级页签')
  const allSwitches = nodes.filter((node) => node.props?.role === 'switch')
  assert.equal(allSwitches.length, 2, '一个真实开关 + 预览里的一个演示开关')
  const switches = allSwitches.filter((node) => node.props?.['aria-label'] === '在聊天中显示 IUI')
  assert.equal(switches.length, 1, '真实开关应可按 aria-label 定位')
  assert.equal(switches[0].props['aria-checked'], true)
  assert.equal(nodes.find((node) => node.props?.['data-iui-settings-preview'])?.props['data-iui-settings-preview'], 'live')
  assert.ok(nodes.some((node) => node.props?.['data-iui-preview-source'] === '1'))
  assert.ok(nodes.some((node) => node.props?.['data-iui-patch-state'] === 'missing'), '无宿主补丁时应显式报告 missing（真实 fork 下才为 loaded）')
  assert.ok(nodes.some((node) => node.props?.['data-iui-registry-state'] === 'ready'))
  const text = nodes.flatMap((node) => node.children ?? []).flat(Infinity).filter((child) => typeof child === 'string').join(' ')
  assert.match(text, /仅作用于当前浏览器/u)
  assert.match(text, /粘贴到任意 DSH 会话即可测试/u)
  // 开关真实生效：写偏好并请求刷新
  switches[0].props.onClick()
  assert.equal(storage.get('miopiik.markdownEmbeds'), '0')
  assert.equal(getReloads(), 1)

  // 复制按钮真实生效
  const copy = nodes.find((node) => node.type === 'button' && (node.children ?? []).flat(Infinity).includes('复制示例'))
  assert.ok(copy)
  await copy.props.onClick()
  assert.match(getCopied(), /^```iui\n<ui /u)

  // 关闭偏好下的开关行为
  const disabled = loadStandalonePlugin({ preference: '0' })
  const disabledNodes = renderPage(disabled.slots)
  const disabledSwitch = disabledNodes.find((node) => node.props?.role === 'switch' && node.props?.['aria-label'] === '在聊天中显示 IUI')
  assert.equal(disabledSwitch.props['aria-checked'], false)
  assert.equal(disabledNodes.find((node) => node.props?.['data-iui-settings-preview'])?.props['data-iui-settings-preview'], 'paused')
  disabledSwitch.props.onClick()
  assert.equal(disabled.storage.get('miopiik.markdownEmbeds'), '1')
  assert.equal(disabled.getReloads(), 1)
})

test('无受信标记的 Markdown 不切分，行内标记无执行能力', () => {
  const { registry } = loadStandalonePlugin()
  assert.equal(registry.segments('纯 Markdown 与 **加粗**').map((x) => x.kind).join(','), 'text')
  const badge = registry.renderInline({ type: 'badge', props: { tone: 'success', text: '好了' } })
  assert.equal(badge.type, 'span')
  assert.equal(badge.props['data-iui-badge'], 'success')
})

test('增强生成读取 profile 的确认状态，并通过 Host 持久化，不写浏览器偏好', async () => {
  let snapshot = { status: 'ready', value: { enhancedVisuals: false }, writable: true }
  let accepted = false
  const writes = []
  const page = loadStandalonePlugin({ configForm: {
    subscribe() { return () => {} },
    getSnapshot() { return snapshot },
    async set(key, value) {
      writes.push([key, value])
      if (accepted) snapshot = { ...snapshot, value: { enhancedVisuals: value } }
      return accepted
    },
  } })
  const toggle = () => renderPage(page.slots).find((node) => node.props?.['aria-label'] === '增强视觉构思')
  assert.equal(toggle().props['aria-checked'], false)
  await toggle().props.onClick()
  assert.equal(toggle().props['aria-checked'], false)
  accepted = true
  await toggle().props.onClick()
  assert.equal(toggle().props['aria-checked'], true)
  snapshot = { ...snapshot, writable: false }
  assert.equal(toggle().props.disabled, true)
  await toggle().props.onClick()
  assert.deepEqual(writes, [['enhancedVisuals', true], ['enhancedVisuals', true]])
  assert.equal(page.storage.size, 0)
  assert.equal(page.getReloads(), 0)
  snapshot = { status: 'unavailable' }
  assert.equal(toggle(), undefined)
})
