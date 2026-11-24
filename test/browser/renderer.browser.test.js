import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 独立仓库的根目录就是包根：client.js 与 package.json 同级。
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const bundle = readFileSync(join(root, 'client.js'), 'utf8')
const folder = join(root, '.dsh', 'tmp', 'browser-test')
// M·O·T 演示文档由 Lead 提供；就绪后本测试自动启用派生/折叠/复制/条件图的完整断言。
const motFixturePath = join(root, 'test', 'fixtures', 'mot', 'mot-demo.iui')
const motFixture = existsSync(motFixturePath) ? readFileSync(motFixturePath, 'utf8') : null

/** 本地 Chromium 是可选的：环境变量优先，其次 PATH 与常见绝对路径。 */
function findChromium() {
  const explicit = process.env.CHROMIUM_PATH ?? process.env.MIOPIIK_CHROMIUM
  if (explicit !== undefined && explicit !== '') return explicit
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (dir === '') continue
    for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return candidate
    }
  }
  for (const candidate of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** rc.7 交互面演示：donut / steps / toggle / slider / progress 绑定 / input / 过滤表格。 */
const DEMO_CONTROLS_ML = `<ui title="交互演示" fallback="Web 46 / CLI 32 / API 22">
  <state name="r" value='{"cur":"清单","on":true,"q":"","th":60,"s":[["Web",46],["CLI",32],["API",22]]}'/>
  <segmented label="视图" bind="$state.r.cur" options='[{"label":"占比","value":"占比"},{"label":"清单","value":"清单"}]'/>
  <chart kind="donut" series="$state.r.s" source="演示数据"/>
  <steps><step title="Web" note="46 次" tone="success"/><step title="CLI" note="32 次"/></steps>
  <toggle label="明细表" bind="$state.r.on"/>
  <slider label="完成线" bind="$state.r.th" min="0" max="100" step="5" unit="%"/>
  <progress label="完成率（演示）" value="$state.r.th" max="100" tone="success"/>
  <input bind="$state.r.q" placeholder="过滤渠道…"/>
  <table columns='["渠道","次数"]' rows='[["Web",46],["CLI",32],["API",22]]' caption="演示数据" filter="$state.r.q" when="$state.r.on"/>
</ui>`

/** rc.9 泳道图演示：显式 lane、跨列连线、虚线语义、注释行。 */
const DEMO_DIAGRAM_ML = `<ui title="派发链路" fallback="Mind 界定 → Operator 执行 → Mind 审核">
  <diagram title="派发链路（演示）" source="演示数据">
    <lane label="Mind"><node id="m1" label="范围界定" tone="info" note="切片合约"/><node id="m2" label="最终审核" tone="success"/></lane>
    <lane label="Operator"><node id="o1" label="分片执行" tone="warning"/><node id="o2" label="交付合并"/></lane>
    注释行：虚线表示异步路径
    <edge from="m1" to="o1" label="分发"/>
    <edge from="o1" to="o2"/>
    <edge from="o2" to="m2" label="验收" kind="dashed"/>
  </diagram>
</ui>`

/**
 * M·O·T 机制验证（JSON AST，不依赖 ml 解析器）：
 * 覆盖 derive 链/跨组件同源、绑定表格/图表、details 本地开合、copy 按钮两条状态路径、
 * diagram 的 lane/node/edge 条件显隐（隐藏节点退出布线、引用隐藏节点的边跳过）。
 */
const MOT_MECHANICS_AST = {
  title: 'M·O·T 机制验证',
  fallback: 'M·O·T 机制验证',
  state: { scenario: 'steady', hitRate: 60, workers: 6, blob: 'x'.repeat(2000) },
  root: {
    type: 'column',
    props: { gap: 10 },
    children: [
      { type: 'derive', props: { name: 'd.N', expr: '$state.scenario == "burst" ? 300 : 120' } },
      { type: 'derive', props: { name: 'd.H', expr: 'round($state.d.N * $state.hitRate / 100)' } },
      { type: 'derive', props: { name: 'd.M', expr: '$state.d.N - $state.d.H' } },
      { type: 'derive', props: { name: 'd.CAP', expr: '$state.workers * 20' } },
      { type: 'derive', props: { name: 'd.E', expr: 'min($state.d.M, $state.d.CAP)' } },
      { type: 'derive', props: { name: 'd.Q', expr: 'max(0, $state.d.M - $state.d.CAP)' } },
      { type: 'derive', props: { name: 'd.C', expr: '$state.d.H + $state.d.E' } },
      { type: 'derive', props: { name: 'd.P', expr: 'round(100 * $state.d.C / $state.d.N)' } },
      { type: 'derive', props: { name: 'd.full', expr: '$state.d.M <= 0' } },
      { type: 'derive', props: { name: 'd.caption', expr: '"命中率 " + $state.d.H + " · 场景 " + $state.scenario' } },
      { type: 'derive', props: { name: 'd.series', expr: '[["命中", $state.d.H], ["执行", $state.d.E], ["队列", $state.d.Q]]' } },
      { type: 'derive', props: { name: 'd.rows', expr: '[["命中", $state.d.H], ["执行", $state.d.E], ["队列", $state.d.Q]]' } },
      { type: 'derive', props: { name: 'd.config', expr: '{scenario: $state.scenario, requests: $state.d.N, workers: $state.workers, hitRate: $state.hitRate, cacheHits: $state.d.H, executed: $state.d.E, queued: $state.d.Q, completed: $state.d.C, completionPct: $state.d.P}' } },
      // 审计 R9/R5 用例：派生 JSON 载荷 > stateBytes（9×2000 字符数组）、非法 rows 绑定、13 列绑定
      { type: 'derive', props: { name: 'd.big', expr: '[$state.blob, $state.blob, $state.blob, $state.blob, $state.blob, $state.blob, $state.blob, $state.blob, $state.blob]' } },
      { type: 'derive', props: { name: 'd.badRows', expr: '$state.scenario' } },
      { type: 'derive', props: { name: 'd.overCols', expr: '["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11", "c12", "c13"]' } },
      {
        type: 'segmented',
        props: { label: '场景', bind: '$state.scenario', options: [{ label: '常规', value: 'steady' }, { label: '突发', value: 'burst' }] },
      },
      { type: 'slider', props: { label: '命中率', bind: '$state.hitRate', min: 0, max: 100, step: 10, unit: '%' } },
      { type: 'slider', props: { label: '工人数', bind: '$state.workers', min: 2, max: 12, step: 1 } },
      {
        type: 'row',
        props: { gap: 10 },
        children: [
          { type: 'metric', props: { label: '命中 H', value: '$state.d.H', unit: '项' } },
          { type: 'metric', props: { label: '执行 E', value: '$state.d.E', unit: '项' } },
          { type: 'metric', props: { label: '队列 Q', value: '$state.d.Q', unit: '项' } },
          { type: 'metric', props: { label: '完成 C', value: '$state.d.C', unit: '项' } },
        ],
      },
      { type: 'chart', props: { kind: 'line', series: '$state.d.series', source: '$state.d.caption' } },
      { type: 'table', props: { columns: ['指标', '数值'], rows: '$state.d.rows', caption: '$state.d.caption' } },
      { type: 'table', props: { columns: ['列'], rows: '$state.d.badRows', caption: '非法行绑定' } },
      { type: 'table', props: { columns: '$state.d.overCols', rows: [], caption: '超列绑定' } },
      { type: 'text', props: { text: '仍有未命中 M 项', when: '$state.d.M' } },
      { type: 'text', props: { text: '全部命中，无未命中', when: '$state.d.full' } },
      {
        type: 'details',
        props: { label: '$state.d.caption' },
        children: [
          { type: 'text', props: { text: '口径说明：派生值随控件变化。' } },
          { type: 'metric', props: { label: '派生完成 C', value: '$state.d.C' } },
        ],
      },
      { type: 'button', props: { label: '复制配置', action: 'copy', value: '$state.d.config', done: '已复制配置', unsupported: '当前不支持此动作' } },
      { type: 'button', props: { label: '复制超大载荷', action: 'copy', value: '$state.d.big', unsupported: '当前不支持此动作' } },
      {
        type: 'diagram',
        props: { title: '条件分支图', source: '$state.scenario' },
        children: [
          {
            type: 'lane',
            props: { label: '处理链路' },
            children: [
              { type: 'node', props: { id: 'n1', label: '命中 H', tone: 'info' } },
              { type: 'node', props: { id: 'n2', label: '完成 C', tone: 'success' } },
              { type: 'node', props: { id: 'q1', label: '队列 Q', tone: 'warning', when: '$state.d.Q' } },
            ],
          },
          {
            type: 'lane',
            props: { label: '告警', when: '$state.d.Q' },
            children: [{ type: 'node', props: { id: 'q2', label: '告警 Q', tone: 'warning' } }],
          },
          {
            type: 'lane',
            props: { label: '接管', when: '$state.d.Q' },
            children: [{ type: 'node', props: { id: 'q3', label: '接管', tone: 'danger', when: '$state.d.Q' } }],
          },
          { type: 'edge', props: { from: 'n1', to: 'n2' } },
          { type: 'edge', props: { from: 'q1', to: 'n2', label: '积压 Q', when: '$state.d.Q' } },
          { type: 'edge', props: { from: 'q2', to: 'n2', label: '告警边' } },
          { type: 'edge', props: { from: 'q3', to: 'n2', label: '接管边', when: '$state.d.Q' } },
        ],
      },
    ],
  },
}

/**
 * Round3 自然表达实验（JSON AST，机制可独立于 ml 解析器验证）：
 * - 根密度三态（inline 无外框 / compact 8px / panel 缺省 12px）；
 * - 任意节点 weight=primary|secondary|optional → data-iui-weight + 视觉强弱；
 * - details 展开态由 IuiSheet 按 item.id 持有（条件显隐卸载重挂载后仍保持）；
 * - copy 真实待复制摘要（data-iui-copy-bytes + 「待复制：JSON · N 字符」），解析失败「—」；
 * - 文本类属性字面量回退（$state.* 解析失败显示字面量，数值类仍 —）；
 * - derive 依赖拓扑：前向引用、失败传递、合并 scope 体积预算、校验期环降级。
 */
const R3_DENSITY_INLINE = { title: '行内密度', density: 'inline', root: { type: 'text', props: { text: '一句话增强' } } }
const R3_DENSITY_COMPACT = { title: '紧凑密度', density: 'compact', root: { type: 'text', props: { text: '紧凑卡' } } }
const R3_DENSITY_PANEL = { title: '面板密度', root: { type: 'text', props: { text: '完整面板（缺省 density）' } } }

const AUTO_LAYOUT_ML = `<ui density="auto" fallback="两种视图和当前值">
  <state name="selected" value="true"/>
  <row>
    <drawing width="360" height="96" label="图形示意"><rect x="4" y="4" width="352" height="88" stroke="accent"/></drawing>
    <chart kind="bar" series='[["A",3],["B",9]]'/>
  </row>
  <row>
    <button label="关闭" action="set" bind="$state.selected" value="false"/>
    <button label="重置" action="reset" bind="$state.selected"/>
  </row>
  <row>
    <metric label="当前值" value="3"/>
    <table columns='["场景","数值"]' rows='[["A",3],["B",9]]'/>
  </row>
  <card title="独立说明"><p>这里需要独立分组。</p></card>
</ui>`

const DRAWING_COMPARISON_ML = `<ui density="auto" fallback="蓝色圆点仅出现在调整后。">
  <state name="showLater" value="true"/>
  <toggle label="提供调整后视图" bind="$state.showLater"/>
  <drawing width="240" height="112" label="图层对照">
    <rect x="4" y="4" width="232" height="104"/>
    <view label="之前" caption="共同结构。"/>
    <line x1="16" y1="20" x2="16" y2="48" stroke="muted" stroke-dasharray="3 4"/>
    <view label="之后" caption="新增一个圆点。" when="$state.showLater == true"><circle cx="40" cy="40" r="9" fill="accent"/></view>
    <label x="120" y="97" align="center" text="共用标注"/>
  </drawing>
</ui>`

const R3_WEIGHT_AST = {
  title: '语义权重',
  root: {
    type: 'column',
    props: { gap: 8 },
    children: [
      { type: 'text', props: { text: '主要结论', weight: 'primary' } },
      { type: 'card', props: { title: '次要补充', weight: 'secondary' }, children: [{ type: 'text', props: { text: '细节' } }] },
      { type: 'metric', props: { label: '可选指标', value: 1, weight: 'optional' } },
    ],
  },
}

const R3_DETAILS_AST = {
  title: '受控折叠',
  state: { show: true },
  root: {
    type: 'column',
    props: { gap: 6 },
    children: [
      { type: 'toggle', props: { label: '显示详情', bind: '$state.show' } },
      { type: 'details', props: { label: '展开我', when: '$state.show' }, children: [{ type: 'text', props: { text: '内部说明' } }] },
    ],
  },
}

const R3_COPY_VALUE = { a: 1, b: [2, 3] }
const R3_COPY_BYTES = JSON.stringify(R3_COPY_VALUE).length
const R3_COPY_AST = {
  title: '复制加固',
  state: { obj: R3_COPY_VALUE },
  root: {
    type: 'column',
    props: { gap: 6 },
    children: [
      { type: 'button', props: { label: '复制对象', action: 'copy', value: '$state.obj', done: '已复制对象', unsupported: '不支持复制' } },
      { type: 'button', props: { label: '复制缺失', action: 'copy', value: '$state.missing', unsupported: '不支持复制' } },
    ],
  },
}

const R3_LITERAL_AST = {
  title: '字面量回退',
  root: {
    type: 'column',
    props: {},
    children: [
      { type: 'text', props: { text: '$state.missing' } },
      { type: 'badge', props: { text: '$data.missing', tone: 'info' } },
      { type: 'metric', props: { label: '$state.missingLabel', value: '$state.missingValue' } },
      { type: 'callout', props: { tone: 'info', title: '$state.missingTitle' }, children: [{ type: 'text', props: { text: '$state.missingInner' } }] },
    ],
  },
}

const R3_DERIVE_FWD_AST = {
  title: '前向引用',
  root: {
    type: 'column',
    props: {},
    children: [
      { type: 'derive', props: { name: 'f.B', expr: '$state.f.A + 1' } },
      { type: 'derive', props: { name: 'f.A', expr: '5' } },
      { type: 'derive', props: { name: 'f.C', expr: 'round($state.f.B * 2)' } },
      { type: 'metric', props: { label: 'B', value: '$state.f.B' } },
      { type: 'metric', props: { label: 'C', value: '$state.f.C' } },
    ],
  },
}

const R3_DERIVE_FAIL_AST = {
  title: '派生失败',
  state: { blob: 'x'.repeat(2000) },
  root: {
    type: 'column',
    props: {},
    children: [
      { type: 'derive', props: { name: 'x.missing', expr: '$state.nope + 1' } },
      { type: 'derive', props: { name: 'x.big', expr: '[$state.blob, $state.blob, $state.blob, $state.blob, $state.blob, $state.blob, $state.blob, $state.blob, $state.blob]' } },
      { type: 'derive', props: { name: 'x.after', expr: '$state.x.missing + 100' } },
      { type: 'metric', props: { label: '缺失', value: '$state.x.missing' } },
      { type: 'metric', props: { label: '预算', value: '$state.x.big' } },
      { type: 'metric', props: { label: '传递', value: '$state.x.after' } },
    ],
  },
}

const R3_DERIVE_CYCLE_AST = {
  title: '循环引用',
  root: {
    type: 'column',
    props: {},
    children: [
      { type: 'derive', props: { name: 'c.X', expr: '$state.c.Y + 1' } },
      { type: 'derive', props: { name: 'c.Y', expr: '$state.c.X + 1' } },
      { type: 'metric', props: { label: '环', value: '$state.c.X' } },
    ],
  },
}

/**
 * 迷你 React（仅测试用）：useState 触发重渲染，useEffect/useLayoutEffect/useMemo/useRef 齐备。
 * 现有浏览器测试只断言静态首屏；M·O·T 断言语义要求点击/滑杆后 DOM 真实更新，因此
 * fixture 需要一个能 reconcile 的最小 React 垫片（按 element key/位置保存 hook 槽位）。
 */
const SETUP = `
    const failures = [];
    window.addEventListener('error', e => failures.push(String(e.message)));
    let plugin;
    window.__ModuleLoader__ = { load(v) { plugin = v } };
    const SVG = new Set(['svg','g','path','rect','text','defs','marker','polyline','line','circle']);
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const UNITLESS = new Set(['opacity','lineHeight','fontWeight','flexGrow','flexShrink','order','zIndex','flex','flexBasis','gridRow','gridColumn']);
    let __current = null;
    let __id = 0;
    let __renderEffects = [];
    function __flatten(list, out) {
      for (const item of list) {
        if (Array.isArray(item)) __flatten(item, out);
        else out.push(item);
      }
      return out;
    }
    function createElement(type, config, ...children) {
      const props = {};
      let key = null;
      if (config !== null && config !== undefined && typeof config === 'object') {
        for (const name of Object.keys(config)) {
          if (name === 'key') key = config[name];
          else props[name] = config[name];
        }
      }
      const flat = __flatten(children, []);
      if (flat.length > 0) props.children = flat;
      return { __iuiEl: true, type, key: key === null || key === undefined ? null : String(key), props };
    }
    function applyProps(el, props) {
      for (const name of Object.keys(props)) {
        const value = props[name];
        if (name === 'children' || name === 'ref' || name === 'key') continue;
        if (name === 'style') {
          if (value !== null && typeof value === 'object') {
            for (const [prop, raw] of Object.entries(value)) {
              if (raw === undefined || raw === null) continue;
              el.style[prop] = typeof raw === 'number' && !UNITLESS.has(prop) ? raw + 'px' : raw;
            }
          }
          continue;
        }
        if (name === 'className') { el.className = value === undefined || value === null ? '' : String(value); continue; }
        if (name === 'value' && ['INPUT','SELECT','TEXTAREA'].includes(el.tagName)) { el.value = value === undefined || value === null ? '' : String(value); continue; }
        if (/^on[A-Z]/u.test(name) && typeof value === 'function') {
          const event = name.slice(2).toLowerCase();
          el.addEventListener(event, value);
          // React 的 onChange 对文本/范围输入等价于 input 事件：两个都挂，测试两种派发都生效。
          if (event === 'change') el.addEventListener('input', value);
          continue;
        }
        if (value === undefined || value === null || value === false) continue;
        try { el.setAttribute(name, String(value)); } catch (error) { failures.push('attr:' + String(error && error.message)); }
      }
    }
    function __instance() {
      if (__current === null) throw new Error('hook 在组件渲染之外被调用');
      return __current;
    }
    function __schedule(root) {
      if (root.pending) return;
      root.pending = true;
      queueMicrotask(() => {
        root.pending = false;
        if (root.mounted) __renderRoot(root);
      });
    }
    function __effectSlot(inst) {
      const index = inst.index++;
      if (inst.slots[index] === undefined) inst.slots[index] = { deps: undefined, cleanup: null };
      return inst.slots[index];
    }
    function __recordEffect(fn, deps, layout) {
      const inst = __instance();
      const slot = __effectSlot(inst);
      __renderEffects.push({ fn, deps, layout, slot });
    }
    const React = {
      createElement,
      useState(initial) {
        const inst = __instance();
        const index = inst.index++;
        if (inst.slots[index] === undefined) inst.slots[index] = { value: typeof initial === 'function' ? initial() : initial };
        const slot = inst.slots[index];
        return [slot.value, (update) => {
          const next = typeof update === 'function' ? update(slot.value) : update;
          if (Object.is(next, slot.value)) return;
          slot.value = next;
          __schedule(inst.root);
        }];
      },
      useRef(initial) {
        const inst = __instance();
        const index = inst.index++;
        if (inst.slots[index] === undefined) inst.slots[index] = { current: initial };
        return inst.slots[index];
      },
      useId() { return React.useState(() => 'iui-test-' + ++__id)[0]; },
      useMemo(factory, deps) {
        const inst = __instance();
        const index = inst.index++;
        const slot = inst.slots[index];
        if (slot === undefined) { inst.slots[index] = { value: factory(), deps }; return inst.slots[index].value }
        if (deps === undefined || slot.deps === undefined || deps.length !== slot.deps.length || deps.some((dep, i) => !Object.is(dep, slot.deps[i]))) {
          slot.value = factory(); slot.deps = deps;
        }
        return slot.value;
      },
      useCallback(fn, deps) {
        const inst = __instance();
        const index = inst.index++;
        const slot = inst.slots[index];
        if (slot === undefined) { inst.slots[index] = { value: fn, deps }; return inst.slots[index].value }
        if (deps === undefined || slot.deps === undefined || deps.length !== slot.deps.length || deps.some((dep, i) => !Object.is(dep, slot.deps[i]))) {
          slot.value = fn; slot.deps = deps;
        }
        return slot.value;
      },
      // 生产环境走 React.cloneElement（weight 合并 style 的路径）；测试垫片补一个等价实现覆盖该分支。
      cloneElement(element, extra) {
        return { ...element, props: { ...(element.props ?? {}), ...(extra ?? {}) } };
      },
      useEffect(fn, deps) { __recordEffect(fn, deps, false) },
      useLayoutEffect(fn, deps) { __recordEffect(fn, deps, true) },
    };
    function __runEffects(effects) {
      for (const effect of effects) {
        const slot = effect.slot;
        const changed = effect.deps === undefined || slot.deps === undefined || effect.deps.length !== slot.deps.length || effect.deps.some((dep, i) => !Object.is(dep, slot.deps[i]));
        if (!changed) continue;
        if (typeof slot.cleanup === 'function') { try { slot.cleanup() } catch (error) { failures.push('cleanup:' + String(error && error.message)) } }
        slot.deps = effect.deps;
        try {
          const cleanup = effect.fn();
          slot.cleanup = typeof cleanup === 'function' ? cleanup : null;
        } catch (error) {
          slot.cleanup = null;
          failures.push('effect:' + String(error && error.message));
        }
      }
    }
    function __renderNode(el, parent, root, pathBase, index) {
      if (el === null || el === undefined || el === false || el === true) return;
      if (typeof el === 'string' || typeof el === 'number') { parent.appendChild(document.createTextNode(String(el))); return }
      if (Array.isArray(el)) { el.forEach((child, i) => __renderNode(child, parent, root, pathBase, i)); return }
      if (typeof el !== 'object' || el.__iuiEl !== true) { if (el instanceof Node) parent.appendChild(el); return }
      if (typeof el.type === 'function') {
        const branch = el.key === null ? 'i:' + index : 'k:' + el.key;
        const path = pathBase + '/' + branch;
        let inst = root.slots.get(path);
        if (inst === undefined) { inst = { path, root, slots: [], index: 0, effects: [] }; root.slots.set(path, inst) }
        inst.index = 0;
        const previous = __current;
        __current = inst;
        let output = null;
        try { output = el.type(el.props); } finally { __current = previous }
        __renderNode(output, parent, root, path + '>', 0);
        return;
      }
      const namespace = SVG.has(el.type) ? SVG_NS : null;
      const dom = namespace === null ? document.createElement(el.type) : document.createElementNS(namespace, el.type);
      applyProps(dom, el.props);
      const branch = el.key === null ? 'i:' + index : 'k:' + el.key;
      const childPath = pathBase + '/' + branch;
      const kids = el.props.children === undefined ? [] : (Array.isArray(el.props.children) ? el.props.children : [el.props.children]);
      kids.forEach((child, i) => __renderNode(child, dom, root, childPath, i));
      parent.appendChild(dom);
      if (el.props.ref !== null && typeof el.props.ref === 'object') el.props.ref.current = dom;
    }
    function __renderRoot(root) {
      __renderEffects = [];
      const fragment = document.createDocumentFragment();
      __renderNode(root.element, fragment, root, 'r', 0);
      root.container.replaceChildren(fragment);
      const effects = __renderEffects;
      __renderEffects = [];
      __runEffects(effects);
    }
    function mountElement(element, container) {
      const root = { element, container, slots: new Map(), mounted: false, pending: false };
      root.mounted = true;
      __renderRoot(root);
      return root;
    }
    const primitives = {
      Switch({checked,onChange,label}) {
        return React.createElement('button',{role:'switch','aria-checked':checked,'aria-label':label,onClick:()=>onChange(!checked)});
      },
      Button({onClick,children}) { return React.createElement('button',{onClick},children); },
    };
`

/** 组装页面：setup（迷你 React）+ 生成的 bundle + 场景脚本。 */
function page(run) {
  return '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><main id="root" style="width:650px;max-width:100%"></main><script>' + SETUP + '\n' + bundle + '\n' + run + '</script></body></html>'
}

/** 主场景：0.1.1 回归 + M·O·T 机制（derive/details/button/diagram when）。 */
const MAIN_RUN = `
    const slots=[];
    const module=plugin.factory(name => {if(name==='react')return React;if(name==='@deepseek-ai/dsh-client-ui-primitives')return primitives;throw Error('unexpected module '+name)});
    module.apply({effect(){},slots:{inject(name,callback){if(name!=='plugins.bundle.config')throw Error('wrong slot '+name);callback()},register(meta,render){slots.push({meta,render})}}});
    const page=slots.find(s=>s.meta.name==='plugins.bundle.config');
    const pageHost=document.createElement('div');
    document.getElementById('root').appendChild(pageHost);
    mountElement(page.render({view:'page'}), pageHost);
    const embeds=globalThis.__miopiikMarkdownEmbeds;
    const mountBlock=(raw)=>{const host=document.createElement('div');document.getElementById('root').appendChild(host);mountElement(embeds.renderBlock(raw),host);return host};
    const demo=document.createElement('div');
    document.getElementById('root').appendChild(demo);
    const controlsHost=mountBlock(${JSON.stringify(DEMO_CONTROLS_ML)});
    const diagramHost=mountBlock(${JSON.stringify(DEMO_DIAGRAM_ML)});
    const motHost=mountBlock(${JSON.stringify(JSON.stringify(MOT_MECHANICS_AST))});
    window.__motHost=motHost;
    // Round3：自然表达原语（密度/权重/受控 details/copy 摘要/字面量回退/派生拓扑）
    const r3Hosts={
      densityInline:mountBlock(${JSON.stringify(JSON.stringify(R3_DENSITY_INLINE))}),
      densityCompact:mountBlock(${JSON.stringify(JSON.stringify(R3_DENSITY_COMPACT))}),
      densityPanel:mountBlock(${JSON.stringify(JSON.stringify(R3_DENSITY_PANEL))}),
      autoLayout:mountBlock(${JSON.stringify(AUTO_LAYOUT_ML)}),
      legacyLayout:mountBlock(${JSON.stringify(AUTO_LAYOUT_ML.replace(' density="auto"', ''))}),
      comparison:mountBlock(${JSON.stringify(DRAWING_COMPARISON_ML)}),
      weight:mountBlock(${JSON.stringify(JSON.stringify(R3_WEIGHT_AST))}),
      details:mountBlock(${JSON.stringify(JSON.stringify(R3_DETAILS_AST))}),
      copy:mountBlock(${JSON.stringify(JSON.stringify(R3_COPY_AST))}),
      literal:mountBlock(${JSON.stringify(JSON.stringify(R3_LITERAL_AST))}),
      badMl:mountBlock('<ui fallback="这张图展示流程关系"></ui>'),
      badJson:mountBlock('{"fallback":"未写完的声明"'),
      badRoot:mountBlock('{"fallback":"替代结论","root":{"type":"unknown-root"}}'),
      recoverMl:mountBlock('<ui><column><text>前一段</text><not-a-component/><slider label="无效控件" fallback="参数当前不可调整"/><text>后一段</text></column></ui>'),
      noOutput:mountBlock('<ui fallback="结果需要完整数据"><state name="x" value="1"/><derive name="y" expr="unknown($state.x)"/><slider label="失去结果的控件" bind="$state.x"/></ui>'),
      deriveFwd:mountBlock(${JSON.stringify(JSON.stringify(R3_DERIVE_FWD_AST))}),
      deriveFail:mountBlock(${JSON.stringify(JSON.stringify(R3_DERIVE_FAIL_AST))}),
      deriveCycle:mountBlock(${JSON.stringify(JSON.stringify(R3_DERIVE_CYCLE_AST))}),
    };
    window.__r3Hosts=r3Hosts;
    // L-11 基础：DOM 级行内嫁接——原生先渲染（加粗跨 token 保留），再原位替换受信 token
    const graftHost=document.createElement('div');
    graftHost.innerHTML='<p>状态 <strong>是 {{badge:success:完成}} 与 {{icon:check}} 收尾</strong>，后面的普通文本 {{code:npm test}} 也应嫁接。</p>';
    const grafted=embeds.graftInline(graftHost);
    const strongEl=graftHost.querySelector('strong');
    const badgeInStrong=strongEl !== null && strongEl.querySelector('[data-miopiik-graft="badge"]') !== null;
    const codeGrafted=graftHost.querySelectorAll('[data-miopiik-graft="code"]').length === 1;
    const idempotent=embeds.graftInline(graftHost) === 0;
    document.body.dataset.graftOk = (grafted === 3 && badgeInStrong && codeGrafted && idempotent) ? 'ok' : 'failed';
    // L-11 基础：流式部分渲染——未闭合围栏可渲染、不带入场动画、带流式标记
    const live=document.createElement('div');
    document.getElementById('root').appendChild(live);
    mountElement(embeds.renderBlockStreaming('<ui title="流式" fallback="F"><row><metric label="A" value="1"/>'), live);
    const streamRoot=document.querySelector('[data-iui-streaming="1"]');
    document.body.dataset.streamingOk = (streamRoot !== null && String(streamRoot.className) === '' && streamRoot.getAttribute('data-iui-output') === 'ok') ? 'ok' : 'failed';
    const liveComparison=document.createElement('div');
    document.getElementById('root').appendChild(liveComparison);
    mountElement(embeds.renderBlockStreaming(${JSON.stringify(DRAWING_COMPARISON_ML)}), liveComparison);
    const liveDrawingOptions=[...liveComparison.querySelectorAll('button[data-iui-drawing-option]')];
    document.body.dataset.comparisonLive = liveDrawingOptions.length === 2 && liveDrawingOptions.every(button => button.disabled) ? 'ok' : 'failed';
    // F-42：html 围栏沙箱文档——无脚本 iframe + CSP 注入 + 脚本剔除 + 超预算降级
    const htmlDoc = '<!doctype html><html><head><title>沙箱演示</title><script>alert(1)</'+'script><style>.chip{border:1px solid red}</style></head><body><span class="chip">A</span><code>&lt;diagram&gt;</code></body></html>';
    const htmlHost = document.createElement('div');
    document.getElementById('root').appendChild(htmlHost);
    mountElement(embeds.renderHtmlBlock(htmlDoc), htmlHost);
    const frame = document.querySelector('iframe[data-miopiik-html-doc="1"]');
    const srcdoc = frame === null ? '' : String(frame.getAttribute('srcdoc') ?? '');
    // srcdoc 必须是「文档原文」而不是再转义一遍：class 引号与 &lt; 实体都要原样交给文档解析器
    const srcdocOk = srcdoc.indexOf('class="chip"') >= 0
      && srcdoc.indexOf('&lt;diagram&gt;') >= 0
      && srcdoc.indexOf('&quot;') === -1
      && srcdoc.indexOf('&amp;lt;') === -1;
    // 宿主主题预设：令牌 + mi-* 组件词汇内联进文档；文档自有 <style> 在其后（可覆盖）
    const presetOk = srcdoc.indexOf('data-miopiik-frame-preset="1"') >= 0
      && srcdoc.indexOf('--mi-accent:') >= 0
      && srcdoc.indexOf('.mi-card{') >= 0
      && srcdoc.indexOf('[data-tone=success]') >= 0
      && srcdoc.indexOf('<style data-miopiik-frame-preset="1">') < srcdoc.indexOf('<style>.chip{');
    const frameStyle = String(frame === null ? '' : (frame.getAttribute('style') ?? ''));
    const noResizeOk = frameStyle.indexOf('resize') === -1;
    // 真宿主令牌采样：把 dsw-* 变量挂到 documentElement，渲染时必须解析成绝对色值注入文档
    document.documentElement.style.setProperty('--dsw-alias-bg-base', 'rgb(11, 22, 33)');
    document.documentElement.style.setProperty('--dsw-alias-brand-primary', 'rgb(4, 5, 6)');
    const themedHost = document.createElement('div');
    document.getElementById('root').appendChild(themedHost);
    mountElement(embeds.renderHtmlBlock('<html><head></head><body><p>x</p></body></html>'), themedHost);
    const themedFrame = themedHost.querySelector('iframe[data-miopiik-html-doc="1"]');
    const themedSrc = String(themedFrame === null ? '' : (themedFrame.getAttribute('srcdoc') ?? ''));
    const hostThemeOk = themedSrc.indexOf('--mi-bg:rgb(11, 22, 33)') >= 0
      && themedSrc.indexOf('--mi-accent:rgb(4, 5, 6)') >= 0
      && themedSrc.indexOf('--mi-bg:#0d1117') === -1;
    document.documentElement.style.removeProperty('--dsw-alias-bg-base');
    document.documentElement.style.removeProperty('--dsw-alias-brand-primary');
    // rc.14/rc.15 自动高度：内容高就用内容高（不残留初始值），内容矮就收回来（不被高提示撑住）
    const tallHost = document.createElement('div');
    document.getElementById('root').appendChild(tallHost);
    mountElement(embeds.renderHtmlBlock('<!doctype html><html><head><title>tall</title></head><body><div style="height:700px">tall</div></body></html>'), tallHost);
    const shortHost = document.createElement('div');
    document.getElementById('root').appendChild(shortHost);
    mountElement(embeds.renderHtmlBlock('<!-- height: 900 --><!doctype html><html><head><title>short-hint</title></head><body><p>short</p></body></html>'), shortHost);
    setTimeout(() => {
      const pick = (title) => [...document.querySelectorAll('iframe[data-miopiik-html-doc="1"]')].find((f) => f.title === title) ?? null;
      const tall = pick('tall');
      const short = pick('short-hint');
      const tallH = tall === null ? 0 : parseFloat(tall.style.height || '0');
      const shortH = short === null ? 0 : parseFloat(short.style.height || '0');
      document.body.dataset.autosizeTall = (tallH >= 690 && tallH <= 790) ? 'ok' : 'failed:' + tallH;
      document.body.dataset.autosizeShort = (shortH > 0 && shortH < 400) ? 'ok' : 'failed:' + shortH;
    }, 700);
    const frameOk = frame !== null
      && frame.getAttribute('sandbox') === 'allow-same-origin'
      && String(frame.getAttribute('sandbox')).indexOf('allow-scripts') === -1
      && srcdoc.indexOf('Content-Security-Policy') >= 0
      && srcdoc.indexOf('<script') === -1
      && frame.getAttribute('title') === '沙箱演示'
      && srcdocOk
      && presetOk
      && noResizeOk
      && hostThemeOk;
    const bigHost = document.createElement('div');
    document.getElementById('root').appendChild(bigHost);
    mountElement(embeds.renderHtmlBlock('<html>' + 'x'.repeat(262200) + '</html>'), bigHost);
    const big = bigHost.firstElementChild;
    const oversizeOk = big !== null && typeof big.getAttribute === 'function' && big.getAttribute('data-miopiik-html-fallback') === 'oversize';
    document.body.dataset.htmlOk = (frameOk && oversizeOk) ? 'ok' : 'failed';
    const demoHosts = { controls: controlsHost, diagram: diagramHost };
    window.__demoHosts = demoHosts;
    document.body.dataset.integration = slots.length===1 && page.meta.key==='miopiik-iui' ? 'ok' : 'failed';
    document.body.dataset.errors=failures.join('|');

    // ---- M·O·T 机制交互断言（derive/details/button/diagram when）----
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const mot = window.__motHost;
      const flag = (name) => { document.body.dataset[name] = 'ok' };
      const fail = (name, detail) => { document.body.dataset[name] = 'failed:' + detail; failures.push(name + ':' + detail) };
      const check = (name, fn) => { try { const detail = fn(); if (detail === true) flag(name); else fail(name, String(detail)) } catch (error) { fail(name, String(error && error.message)) } };
      const metrics = () => {
        const out = {};
        for (const el of mot.querySelectorAll('[data-iui-metric]')) out[el.getAttribute('data-iui-metric')] = el.children[1] === undefined ? '' : el.children[1].textContent;
        return out;
      };
      const setSlider = (label, value) => {
        const input = [...mot.querySelectorAll('[data-iui-slider] input')].find((el) => el.getAttribute('aria-label') === label);
        if (input === null || input === undefined) throw new Error('slider 不存在: ' + label);
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const textIn = (selector) => [...mot.querySelectorAll(selector)].map((el) => el.textContent);
      try {
        await wait(120);
        // 1) derive 链初始值（steady: N=120, H=72, E=48, Q=0, C=120）
        check('motDeriveInitial', () => {
          const values = metrics();
          if (values['命中 H'] !== '72项') return JSON.stringify(values);
          if (values['执行 E'] !== '48项') return JSON.stringify(values);
          if (values['队列 Q'] !== '0项') return JSON.stringify(values);
          if (values['完成 C'] !== '120项') return JSON.stringify(values);
          return true;
        });
        // 2) 跨组件同源：chart/table 绑定派生值
        check('motCrossComponent', () => {
          const chart = mot.querySelector('[data-iui-chart="line"]');
          if (chart === null) return 'chart 缺失';
          const summary = String((chart.querySelector('svg') === null ? '' : chart.querySelector('svg').getAttribute('aria-label')) ?? '');
          if (!summary.includes('72')) return summary;
          const table = mot.querySelector('[data-iui-table]');
          if (table === null) return 'table 缺失';
          return table.textContent.includes('72') ? true : table.textContent;
        });
        // 3) details：默认收起 → 点击展开
        const detailsButton = () => mot.querySelector('[data-iui-details] button');
        check('motDetailsClosed', () => {
          const host = mot.querySelector('[data-iui-details]');
          if (host === null) return 'details 缺失';
          if (host.getAttribute('data-iui-details') !== 'closed') return host.getAttribute('data-iui-details');
          if (detailsButton().getAttribute('aria-expanded') !== 'false') return detailsButton().getAttribute('aria-expanded');
          if (mot.querySelector('[data-iui-details-body]') !== null) return 'body 不应存在';
          return true;
        });
        detailsButton().click();
        await wait(60);
        check('motDetailsOpen', () => {
          const host = mot.querySelector('[data-iui-details]');
          if (host === null) return 'details 缺失';
          if (host.getAttribute('data-iui-details') !== 'open') return host.getAttribute('data-iui-details');
          const button = detailsButton();
          if (button.getAttribute('aria-expanded') !== 'true') return button.getAttribute('aria-expanded');
          const body = mot.querySelector('[data-iui-details-body]');
          if (body === null) return 'body 缺失';
          if (body.id !== button.getAttribute('aria-controls')) return 'aria-controls 不匹配';
          return body.textContent.includes('口径说明') ? true : body.textContent;
        });
        // 4) 改滑杆：派生值随状态变化，details 展开状态不重置
        setSlider('命中率', 50);
        await wait(80);
        check('motDeriveAfterSlider', () => {
          const values = metrics();
          if (values['命中 H'] !== '60项') return JSON.stringify(values);
          if (values['执行 E'] !== '60项') return JSON.stringify(values);
          return true;
        });
        check('motDetailsPersist', () => {
          const host = mot.querySelector('[data-iui-details]');
          return host !== null && host.getAttribute('data-iui-details') === 'open' ? true : '改滑杆后展开状态被重置';
        });
        // 4b) 切 segmented（同样触发 IuiSheet 重渲染）后 details 仍须保持展开
        const clickOption = (text) => {
          const button = [...mot.querySelectorAll('button')].find((el) => el.textContent.trim() === text);
          if (button === undefined) throw new Error('segmented 选项缺失: ' + text);
          button.click();
        };
        clickOption('突发');
        await wait(80);
        check('motDetailsPersistScenario', () => {
          const host = mot.querySelector('[data-iui-details]');
          if (host === null || host.getAttribute('data-iui-details') !== 'open') return '切 segmented 后展开状态被重置';
          const values = metrics();
          if (values['命中 H'] !== '150项') return 'N=300/hitRate=50 时 H 应为 150: ' + JSON.stringify(values);
          return true;
        });
        clickOption('常规');
        await wait(80);
        // 5) 零值 when：M=0 时「无未命中」文案切换（派生布尔 truthy/零值语义）
        setSlider('命中率', 100);
        await wait(80);
        check('motBooleanWhen', () => {
          const texts = textIn('div').join('\\n');
          if (texts.includes('全部命中，无未命中') === false) return '全部命中 未显示';
          if (texts.includes('仍有未命中') === true) return '零值分支未隐藏';
          return true;
        });
        // 6) diagram 条件节点：Q=0 时 q1 与引用它的 edge 不渲染；Q>0 后出现
        setSlider('命中率', 60);
        setSlider('工人数', 2);
        await wait(80);
        check('motDiagramConditional', () => {
          const ids = [...mot.querySelectorAll('[data-iui-diagram-node]')].map((el) => el.getAttribute('data-iui-diagram-node'));
          for (const id of ['q1', 'q2', 'q3']) if (!ids.includes(id)) return 'Q>0 时 ' + id + ' 应显示: ' + ids.join(',');
          const edgeLabels = [...mot.querySelectorAll('[data-iui-diagram-edge-label]')].map((el) => el.textContent);
          for (const label of ['积压 Q', '告警边', '接管边']) if (!edgeLabels.includes(label)) return 'edge 标签缺失 ' + label + ': ' + edgeLabels.join(',');
          const laneCount = mot.querySelector('[data-iui-diagram]').getAttribute('data-iui-diagram');
          if (laneCount !== '3') return 'Q>0 时应为 3 列: ' + laneCount;
          const laneLabels = [...mot.querySelectorAll('[data-iui-diagram-lane]')].map((el) => (el.firstElementChild === null ? '' : el.firstElementChild.textContent));
          for (const label of ['告警', '接管']) if (!laneLabels.some((text) => text.includes(label))) return 'lane ' + label + ' 未显示: ' + laneLabels.join('|');
          const diagramAria = String(mot.querySelector('[data-iui-diagram] svg') === null ? '' : mot.querySelector('[data-iui-diagram] svg').getAttribute('aria-label'));
          if (!diagramAria.includes('4 条连线')) return diagramAria;
          return true;
        });
        setSlider('工人数', 6);
        await wait(80);
        check('motDiagramHidden', () => {
          const ids = [...mot.querySelectorAll('[data-iui-diagram-node]')].map((el) => el.getAttribute('data-iui-diagram-node'));
          if (ids.includes('q1') || ids.includes('q3')) return 'Q=0 时条件节点应隐藏: ' + ids.join(',');
          // 隐藏 lane 仍有可见 node：忽略 lane 分组，节点并入首列而不是整组消失
          if (!ids.includes('q2')) return '隐藏 lane 的可见 node 不应消失: ' + ids.join(',');
          const edgeLabels = [...mot.querySelectorAll('[data-iui-diagram-edge-label]')].map((el) => el.textContent);
          if (edgeLabels.includes('积压 Q') || edgeLabels.includes('接管边')) return '引用隐藏节点的 edge 应跳过: ' + edgeLabels.join(',');
          const laneLabels = [...mot.querySelectorAll('[data-iui-diagram-lane]')].map((el) => (el.firstElementChild === null ? '' : el.firstElementChild.textContent));
          if (laneLabels.some((text) => text.includes('告警')) || laneLabels.some((text) => text.includes('接管'))) return '隐藏 lane 的列应移除: ' + laneLabels.join('|');
          const laneCount = mot.querySelector('[data-iui-diagram]').getAttribute('data-iui-diagram');
          if (laneCount !== '2') return 'Q=0 时应为 2 列（首列 + 处理链路）: ' + laneCount;
          const diagramAria = String(mot.querySelector('[data-iui-diagram] svg') === null ? '' : mot.querySelector('[data-iui-diagram] svg').getAttribute('aria-label'));
          if (!diagramAria.includes('2 条连线')) return diagramAria;
          return true;
        });
        // 7) copy 按钮：剪贴板不可用 → unsupported 文案（role=status/aria-live 播报）
        const copyButton = () => mot.querySelector('[data-iui-action="copy"]');
        check('motCopyButton', () => copyButton() !== null && copyButton().textContent.includes('复制配置') ? true : 'copy 按钮缺失');
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
        copyButton().click();
        await wait(80);
        check('motCopyUnsupported', () => {
          const status = mot.querySelector('[data-iui-action-status]');
          if (status === null) return '状态元素缺失';
          if (status.getAttribute('data-iui-action-status') !== 'unsupported') return status.getAttribute('data-iui-action-status');
          if (status.getAttribute('role') !== 'status') return 'role 不是 status';
          if (status.getAttribute('aria-live') !== 'polite') return 'aria-live 不是 polite';
          if (!status.textContent.includes('当前不支持此动作')) return status.textContent;
          return true;
        });
        // 8) 剪贴板写入被拒绝（权限/焦点）→ 同样 unsupported，不抛异常
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied') } } });
        copyButton().click();
        await wait(120);
        check('motCopyRejected', () => {
          const status = mot.querySelector('[data-iui-action-status]');
          return status === null ? '状态缺失' : status.getAttribute('data-iui-action-status') === 'unsupported' ? true : status.getAttribute('data-iui-action-status');
        });
        // 9) 剪贴板可用：写入派生 config JSON 并显示 done 文案
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.__copiedText = text } } });
        copyButton().click();
        await wait(160);
        check('motCopyOk', () => {
          const status = mot.querySelector('[data-iui-action-status]');
          if (status === null || status.getAttribute('data-iui-action-status') !== 'ok') return status === null ? '状态缺失' : status.getAttribute('data-iui-action-status');
          const copied = window.__copiedText;
          if (typeof copied !== 'string') return '未写入剪贴板';
          // 成功后 done 文案必须追加「 · N 字符」，N 是真实待复制内容的字符数
          if (status.textContent.trim() !== '已复制配置 · ' + copied.length + ' 字符') return status.textContent;
          const parsed = JSON.parse(copied);
          const keys = Object.keys(parsed).sort().join(',');
          if (keys !== 'cacheHits,completed,completionPct,executed,hitRate,queued,requests,scenario,workers') return keys;
          if (parsed.completed !== 120) return 'completed=' + parsed.completed;
          return true;
        });
        // 10) R5：绑定表格 resolve 后重新执行 12 列 / 200 行 / 体积预算 → 降级状态节点，不渲染超限表
        check('motTableGuard', () => {
          const invalid = [...mot.querySelectorAll('[data-iui-table-invalid="1"]')];
          if (invalid.length !== 2) return '降级表数量=' + invalid.length;
          if (!invalid.every((el) => el.getAttribute('role') === 'status')) return 'role 不是 status';
          if (!invalid.every((el) => el.textContent === '这部分内容暂不可用。')) return invalid.map((el) => el.textContent).join('|');
          if (mot.querySelectorAll('table').length !== 1) return '非法绑定不应渲染 table: ' + mot.querySelectorAll('table').length;
          return true;
        });
        // 11) R9：copy 载荷 JSON 超过 stateBytes → unsupported，且不写剪贴板
        const bigCopy = () => [...mot.querySelectorAll('[data-iui-action="copy"]')].find((el) => el.textContent.includes('超大载荷'));
        check('motCopyBudgetButton', () => bigCopy() === undefined ? '超大载荷按钮缺失' : true);
        window.__copiedText = 'untouched';
        bigCopy().click();
        await wait(120);
        check('motCopyBudget', () => {
          const status = bigCopy().parentElement.querySelector('[data-iui-action-status]');
          if (status === null) return '状态缺失';
          if (status.getAttribute('data-iui-action-status') !== 'unsupported') return status.getAttribute('data-iui-action-status');
          return window.__copiedText === 'untouched' ? true : '超限载荷不应写剪贴板: ' + String(window.__copiedText).slice(0, 32);
        });
        // ===== Round3 自然表达：密度 / 权重 / 受控 details / copy 摘要 / 字面量回退 / 派生拓扑 =====
        const r3 = window.__r3Hosts;
        check('r3Density', () => {
          const rootOf = (host) => host.querySelector('[data-iui-output="ok"]');
          const inline = rootOf(r3.densityInline);
          const compact = rootOf(r3.densityCompact);
          const panel = rootOf(r3.densityPanel);
          if (inline === null || inline.getAttribute('data-iui-density') !== 'inline') return 'inline 缺失';
          if (compact === null || compact.getAttribute('data-iui-density') !== 'compact') return 'compact 缺失';
          if (panel === null || panel.getAttribute('data-iui-density') !== 'panel') return 'panel 缺省值缺失';
          const styleOf = (el) => String(el.getAttribute('style') ?? '');
          if (styleOf(inline).includes('border: 1px') || styleOf(inline).includes('padding: 12px')) return 'inline 不应有外框/内边距: ' + styleOf(inline);
          if (!styleOf(compact).includes('padding: 8px')) return 'compact 内边距应为 8px: ' + styleOf(compact);
          if (!styleOf(panel).includes('padding: 12px')) return 'panel 内边距应为 12px: ' + styleOf(panel);
          const inlineTitle = inline.firstElementChild === null ? '' : String(inline.firstElementChild.getAttribute('style') ?? '');
          if (!inlineTitle.includes('font-size: 11px')) return 'inline 标题应为小号样式: ' + inlineTitle;
          return true;
        });
        check('autoLayout', () => {
          const host = r3.autoLayout;
          const root = host.querySelector('[data-iui-output="ok"]');
          const rows = [...host.querySelectorAll('[data-iui-container="row"]')];
          if (root === null || rows.length !== 3) return '缺少自适应布局';
          if (root.dataset.iuiDensity !== 'panel' || root.dataset.iuiSurface !== 'flow') return '自动布局仍用外框';
          const rootStyle = getComputedStyle(root);
          if (rootStyle.paddingTop !== '0px' || rootStyle.borderTopWidth !== '0px') return '自动外层有内边距或边框';
          const card = host.querySelector('[data-iui-container="card"]');
          if (card === null || getComputedStyle(card).borderTopWidth !== '1px') return '应保留显式卡片边界';
          const legacy = r3.legacyLayout.querySelector('[data-iui-output="ok"]');
          const legacyRow = r3.legacyLayout.querySelector('[data-iui-container="row"]');
          if (legacy?.dataset.iuiSurface !== 'frame' || getComputedStyle(legacy).paddingTop !== '12px' || getComputedStyle(legacyRow).display !== 'grid') return '历史布局发生变化';
          const layout = (row) => [...row.children].map((child) => child.getBoundingClientRect());
          const [drawings, actions, table] = rows;
          if (!drawings.firstElementChild.querySelector('[data-iui-drawing]') || !drawings.lastElementChild.querySelector('[data-iui-chart]')) return '图形顺序发生变化';
          const [drawing, chart] = layout(drawings);
          if (drawing.width < 232 || chart.width < 232 || drawing.top !== chart.top || drawing.right > chart.left) return '宽屏图形应并排';
          const [firstAction, secondAction] = layout(actions);
          if (firstAction.top !== secondAction.top || secondAction.right - firstAction.left > actions.clientWidth / 2) return '短操作不应按等宽列伸展';
          const [metric, data] = layout(table);
          if (data.top < metric.bottom || data.width < table.clientWidth - 1) return '数据表应独占一行';
          for (const width of [420, 360]) {
            host.style.width = width + 'px';
            const [first, second] = layout(drawings);
            if (second.top < first.bottom || first.width < width - 1 || second.width < width - 1 || root.scrollWidth > width + 1) return width + 'px 下图形未顺序堆叠或溢出';
          }
          return true;
        });
        const compare = r3.comparison;
        const compareFigure = () => compare.querySelector('figure[data-iui-drawing-comparison]');
        const compareButtons = () => [...compareFigure().querySelectorAll('button[data-iui-drawing-option]')];
        const compareGraph = () => compareFigure().querySelector('svg[data-iui-drawing]');
        const compareCaption = () => compareFigure().querySelector('figcaption[data-iui-drawing-caption]');
        const shapeOrder = () => [...compareGraph().children].map((shape) => shape.localName).join(',');
        check('comparisonInitial', () => {
          const buttons = compareButtons();
          const named = compareGraph().getAttribute('aria-describedby') === compareCaption().id;
          const graphicLeft = compareGraph().getBoundingClientRect().left;
          const aligned = Math.abs(buttons[0].getBoundingClientRect().left - graphicLeft) < 1
            && Math.abs(compareCaption().getBoundingClientRect().left - graphicLeft) < 1;
          return (buttons.length === 2 && buttons[0].type === 'button' && buttons[0].getAttribute('aria-pressed') === 'true'
            && compareCaption().textContent === '共同结构。' && named && aligned && shapeOrder() === 'rect,line,text') ? true : '初值、对齐或图层顺序错误';
        });
        compareButtons()[1].click();
        await wait(25);
        const laterActive = () => compareButtons()[1]?.getAttribute('aria-pressed') === 'true'
          && compareCaption().textContent === '新增一个圆点。' && shapeOrder() === 'rect,line,circle,text';
        check('comparisonChoice', () => laterActive() ? true : '切换未更新图层和图注');
        compare.querySelector('button[role="switch"]').click();
        await wait(25);
        check('comparisonFallback', () => (compareButtons().length === 0 && compareCaption().textContent === '共同结构。' && shapeOrder() === 'rect,line,text') ? true : '无后项时没有回到首个图层');
        compare.querySelector('button[role="switch"]').click();
        await wait(25);
        check('comparisonRestored', () => laterActive() ? true : '重新显示后项时没有保留选择');
        check('r3Weight', () => {
          const host = r3.weight;
          const primary = host.querySelector('[data-iui-weight="primary"]');
          const secondary = host.querySelector('[data-iui-weight="secondary"]');
          const optional = host.querySelector('[data-iui-weight="optional"]');
          if (primary === null || secondary === null || optional === null) return '权重节点缺失';
          if (primary.textContent !== '主要结论') return 'primary 文本被改写: ' + primary.textContent;
          if (!String(primary.getAttribute('style')).includes('font-weight: 600')) return 'primary 应加粗: ' + primary.getAttribute('style');
          if (!String(secondary.getAttribute('style')).includes('font-weight: 500')) return 'secondary 应略弱: ' + secondary.getAttribute('style');
          if (!String(optional.getAttribute('style')).includes('font-weight: 400')) return 'optional 应弱化: ' + optional.getAttribute('style');
          return host.querySelectorAll('[data-iui-weight]').length === 3 ? true : '权重节点数=' + host.querySelectorAll('[data-iui-weight]').length;
        });
        const detailsHost = r3.details;
        const detailsEl = () => detailsHost.querySelector('[data-iui-details]');
        const toggleEl = () => detailsHost.querySelector('[data-iui-toggle] button');
        check('r3DetailsClosed', () => {
          const el = detailsEl();
          if (el === null) return 'details 缺失';
          if (el.getAttribute('data-iui-details') !== 'closed') return el.getAttribute('data-iui-details');
          return el.querySelector('button').getAttribute('aria-expanded') === 'false' ? true : 'aria-expanded 初始值错误';
        });
        detailsEl().querySelector('button').click();
        await wait(60);
        check('r3DetailsOpen', () => {
          const el = detailsEl();
          if (el === null || el.getAttribute('data-iui-details') !== 'open') return '展开失败';
          const button = el.querySelector('button');
          const body = detailsHost.querySelector('[data-iui-details-body]');
          if (button.getAttribute('aria-expanded') !== 'true') return 'aria-expanded=' + button.getAttribute('aria-expanded');
          if (body === null) return 'body 缺失';
          if (button.getAttribute('aria-controls') !== body.id) return 'aria-controls 不匹配';
          return body.textContent.includes('内部说明') ? true : body.textContent;
        });
        // 条件显隐让 details 卸载 → 再显示：展开态必须由 IuiSheet 的 Map 保住（受控）
        toggleEl().click();
        await wait(60);
        check('r3DetailsHidden', () => detailsEl() === null ? true : 'when=false 时 details 应卸载');
        toggleEl().click();
        await wait(60);
        check('r3DetailsRemount', () => {
          const el = detailsEl();
          if (el === null) return 'details 未重新挂载';
          if (el.getAttribute('data-iui-details') !== 'open') return '重挂载后展开态丢失: ' + el.getAttribute('data-iui-details');
          return el.querySelector('button').getAttribute('aria-expanded') === 'true' ? true : 'aria-expanded 丢失';
        });
        const copyButtons = () => [...r3.copy.querySelectorAll('[data-iui-action="copy"]')];
        check('r3CopySummary', () => {
          const buttons = copyButtons();
          if (buttons.length !== 2) return '按钮数=' + buttons.length;
          const first = buttons[0];
          if (first.getAttribute('data-iui-copy-bytes') !== String(${R3_COPY_BYTES})) return 'bytes=' + first.getAttribute('data-iui-copy-bytes');
          const firstSummary = first.parentElement.querySelector('[data-iui-copy-summary]');
          const firstPreview = first.parentElement.querySelector('[data-iui-copy-preview]');
          if (firstPreview === null || firstPreview.textContent.length !== Number(first.getAttribute('data-iui-copy-bytes'))) return '缺少真实载荷预览';
          if (firstSummary === null) return '摘要缺失';
          if (firstSummary.textContent !== '待复制：JSON · ' + ${R3_COPY_BYTES} + ' 字符') return '摘要=' + firstSummary.textContent;
          const second = buttons[1];
          const secondSummary = second.parentElement.querySelector('[data-iui-copy-summary]');
          if (secondSummary === null || secondSummary.textContent !== '待复制：—') return '无法解析时应显示 —: ' + (secondSummary === null ? '缺失' : secondSummary.textContent);
          if (second.getAttribute('data-iui-copy-bytes') !== null) return '无法解析时不应带 bytes';
          return true;
        });
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.__r3Copied = text } } });
        copyButtons()[0].click();
        await wait(120);
        check('r3CopySuccess', () => {
          const button = copyButtons()[0];
          const status = button.parentElement.querySelector('[data-iui-action-status]');
          if (status === null || status.getAttribute('data-iui-action-status') !== 'ok') return 'status=' + (status === null ? '缺失' : status.getAttribute('data-iui-action-status'));
          if (status.textContent.trim() !== '已复制对象 · ' + ${R3_COPY_BYTES} + ' 字符') return 'done 文案=' + status.textContent;
          if (window.__r3Copied !== JSON.stringify(${JSON.stringify(R3_COPY_VALUE)})) return '剪贴板内容=' + String(window.__r3Copied).slice(0, 40);
          return true;
        });
        copyButtons()[1].click();
        await wait(120);
        check('r3CopyInvalid', () => {
          const status = copyButtons()[1].parentElement.querySelector('[data-iui-action-status]');
          if (status === null || status.getAttribute('data-iui-action-status') !== 'unsupported') return '解析失败应 unsupported';
          return true;
        });
        check('r3LiteralFallback', () => {
          const host = r3.literal;
          if (host.textContent.includes('$state.') || host.textContent.includes('$data.')) return '读者看到声明语法';
          if (host.querySelectorAll('[data-iui-binding-unavailable="1"]').length < 3) return '无法确认显示值已降级';
          const metric = host.querySelector('[data-iui-metric]');
          if (metric === null || metric.children[1].textContent !== '—') return 'metric value 应为 —';
          return true;
        });
        check('readerFallback', () => {
          if (r3.badMl.textContent !== '这张图展示流程关系' || r3.badJson.textContent !== '这部分内容暂不可用。' || r3.badRoot.textContent !== '替代结论') return '整块兜底没有呈现';
          for (const host of [r3.badMl, r3.badJson, r3.badRoot]) {
            const output = host.querySelector('[data-iui-output="invalid"]');
            if (!output || JSON.parse(output.getAttribute('data-iui-diagnostics')).length === 0) return '诊断未留在数据属性';
          }
          const local = r3.recoverMl.textContent;
          for (const text of ['前一段', '参数当前不可调整', '后一段']) if (!local.includes(text)) return '局部兜底丢失 ' + text;
          if (local.includes('未知标签') || local.includes('$state.') || r3.recoverMl.querySelector('input')) return '无效控件或内部错误呈现给读者';
          if (r3.noOutput.textContent !== '结果需要完整数据' || r3.noOutput.querySelector('input')) return '失败的计算暴露了无结果控件';
          if (!live.textContent.includes('A') || live.textContent.includes('没有闭合') || live.textContent.includes('<ui')) return '流式阶段未保留完成的兄弟节点';
          return true;
        });
        check('r3DeriveForward', () => {
          const host = r3.deriveFwd;
          const root = host.querySelector('[data-iui-output="ok"]');
          if (root === null) return '根缺失';
          if (root.getAttribute('data-iui-derive-errors') !== '0') return 'derive-errors=' + root.getAttribute('data-iui-derive-errors');
          const values = {};
          for (const el of host.querySelectorAll('[data-iui-metric]')) values[el.getAttribute('data-iui-metric')] = el.children[1] === undefined ? '' : el.children[1].textContent;
          if (values.B !== '6') return '前向引用失败 B=' + values.B;
          if (values.C !== '12') return '前向引用链失败 C=' + values.C;
          return true;
        });
        check('r3DeriveFailures', () => {
          const host = r3.deriveFail;
          const root = host.querySelector('[data-iui-output="ok"]');
          if (root === null) return '根缺失';
          if (root.getAttribute('data-iui-derive-errors') !== '3') return 'derive-errors=' + root.getAttribute('data-iui-derive-errors');
          const values = {};
          for (const el of host.querySelectorAll('[data-iui-metric]')) values[el.getAttribute('data-iui-metric')] = el.children[1] === undefined ? '' : el.children[1].textContent;
          for (const key of ['缺失', '预算', '传递']) if (values[key] !== '—') return key + '=' + values[key];
          return true;
        });
        check('r3DeriveCycle', () => {
          const host = r3.deriveCycle;
          const root = host.querySelector('[data-iui-output="ok"]');
          if (root === null) return '根缺失';
          // 环在校验期 failNode 降级（渲染层拓扑守卫为第二道防线，正常路径不可达）
          if (root.getAttribute('data-iui-degraded') !== '2') return 'degraded=' + root.getAttribute('data-iui-degraded');
          if (!host.textContent.includes('循环引用')) return '降级原因缺失: ' + host.textContent.slice(0, 120);
          const metric = host.querySelector('[data-iui-metric]');
          if (metric === null || metric.children[1] === undefined || metric.children[1].textContent !== '—') return '环引用指标应为 —';
          return true;
        });
        check('r3Errors', () => failures.length === 0 ? true : failures.join('|'));
        check('motErrors', () => failures.length === 0 ? true : failures.join('|'));
      } catch (error) {
        fail('motFatal', String(error && error.stack || error));
      }
    })();
`

/** M·O·T 演示（Lead 提供的 ml fixture）：派生/图表/表格/折叠/复制/条件图的端到端断言。 */
function motRun(source) {
  return `
    const slots=[];
    const module=plugin.factory(name => {if(name==='react')return React;if(name==='@deepseek-ai/dsh-client-ui-primitives')return primitives;throw Error('unexpected module '+name)});
    module.apply({effect(){},slots:{inject(name,callback){if(name!=='plugins.bundle.config')throw Error('wrong slot '+name);callback()},register(meta,render){slots.push({meta,render})}}});
    const embeds=globalThis.__miopiikMarkdownEmbeds;
    const host=document.createElement('div');
    document.getElementById('root').appendChild(host);
    mountElement(embeds.renderBlock(${JSON.stringify(source)}),host);
    (async () => {
      const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
      const flag=(name)=>{document.body.dataset[name]='ok'};
      const fail=(name,detail)=>{document.body.dataset[name]='failed:'+detail;failures.push(name+':'+detail)};
      const check=(name,fn)=>{try{const detail=fn();if(detail===true)flag(name);else fail(name,String(detail))}catch(error){fail(name,String(error&&error.stack||error))}};
      const q=(sel)=>host.querySelector(sel);
      const qa=(sel)=>[...host.querySelectorAll(sel)];
      const text=(sel)=>qa(sel).map((el)=>el.textContent).join(' ');
      const mets=()=>{const out={};for(const el of qa('[data-iui-metric]'))out[el.getAttribute('data-iui-metric')]=el.children[1]===undefined?'':el.children[1].textContent;return out};
      const setSlider=(label,value)=>{const input=qa('[data-iui-slider] input').find((el)=>el.getAttribute('aria-label')===label);if(input===undefined)throw new Error('slider 缺失: '+label);input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}))};
      const clickButton=(label)=>{const button=qa('button').find((el)=>el.textContent.trim()===label);if(button===undefined)throw new Error('button 缺失: '+label);button.click()};
      const diagramIds=()=>qa('[data-iui-diagram-node]').map((el)=>el.getAttribute('data-iui-diagram-node'));
      try {
        await wait(160);
        check('motFixtureRendered',()=>{
          if (q('[data-iui-output="ok"]')===null) return 'fixture 未渲染为 ok';
          if (!host.textContent.includes('M·O·T')) return '标题缺失';
          return host.textContent.includes('模拟') ? true : '模拟 badge 缺失';
        });
        check('motFixtureSteady',()=>{
          const values=mets();
          const flat=Object.entries(values).map(([key,value])=>key+'='+value).join('|');
          if (!flat.includes('120')) return 'C/N 120 缺失: '+flat;
          if (!flat.includes('72')) return 'H 72 缺失: '+flat;
          if (!flat.includes('100')) return 'P 100 缺失: '+flat;
          if (text('[data-iui-callout="warning"]').includes('容量不足')) return 'Q=0 不应有容量不足告警';
          if (!text('[data-iui-callout="success"]').includes('容量足够')) return '缺少容量足够 callout';
          // Q=0：队列节点及引用它的 edge 必须条件隐藏
          if (diagramIds().includes('queue')) return 'Q=0 时 queue 节点应隐藏: ' + diagramIds().join(',');
          const aria = String(q('[data-iui-diagram] svg')?.getAttribute('aria-label') ?? '');
          if (!/，8 条连线/u.test(aria)) return 'Q=0 时 queue 相关 edge 应跳过（连线数）: ' + aria;
          return true;
        });
        const details=q('[data-iui-details]');
        check('motFixtureDetails',()=>{
          if (details===null) return 'details 缺失';
          if (details.getAttribute('data-iui-details')!=='closed') return details.getAttribute('data-iui-details');
          return details.querySelector('button[aria-expanded="false"]')===null?'aria-expanded 缺失':true;
        });
        details.querySelector('button').click();
        await wait(80);
        check('motFixtureDetailsOpen',()=>{
          const now=q('[data-iui-details]');
          if (now===null||now.getAttribute('data-iui-details')!=='open') return '展开失败';
          return text('[data-iui-details]').includes('规则模拟')?true:text('[data-iui-details]');
        });
        // 切场景 → 突发 + 工人数 2：N=300,H=180,M=120,CAP=40,E=40,Q=80,C=220,P=73
        clickButton('突发');
        await wait(60);
        const workers=qa('[data-iui-slider] input').find((el)=>el.getAttribute('min')==='2'&&el.getAttribute('max')==='12');
        check('motFixtureWorkersSlider',()=>workers===undefined?'工人数滑杆缺失':true);
        workers.value='2';
        workers.dispatchEvent(new Event('input',{bubbles:true}));
        await wait(100);
        check('motFixtureBurst',()=>{
          const chart=q('[data-iui-chart="bar"]');
          if (chart===null) return '柱状图缺失';
          const chartText=chart.textContent;
          for (const expected of ['180','40','80']) if (!chartText.includes(expected)) return '柱状图缺 '+expected+': '+chartText;
          if (!text('[data-iui-callout="warning"]').includes('容量不足')) return '缺少容量不足告警';
          if (!text('[data-iui-table]').includes('180')) return '绑定表格未随派生值更新';
          return true;
        });
        check('motFixtureDetailsPersist',()=>{
          const now=q('[data-iui-details]');
          return now!==null&&now.getAttribute('data-iui-details')==='open'?true:'切场景后展开状态被重置';
        });
        check('motFixtureDiagramConditional',()=>{
          const ids=diagramIds();
          if (!ids.includes('queue')) return 'Q>0 时 queue 节点应显示: '+ids.join(',');
          const aria = String(q('[data-iui-diagram] svg')?.getAttribute('aria-label') ?? '');
          if (!/，10 条连线/u.test(aria)) return 'Q>0 时 queue 相关 edge 应显示（连线数）: ' + aria;
          if (ids.length!==9) return '节点数应为 9（8+条件队列）: '+ids.length;
          return true;
        });
        // 复制：注入剪贴板，断言派生 config JSON 的九个键
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text)=>{window.__copiedText=text}}});
        const copy=q('[data-iui-action="copy"]');
        check('motFixtureCopyButton',()=>copy===null?'copy 按钮缺失':true);
        copy.click();
        await wait(160);
        check('motFixtureCopy',()=>{
          const status=q('[data-iui-action-status]');
          if (status===null||status.getAttribute('data-iui-action-status')!=='ok') return status===null?'状态缺失':status.getAttribute('data-iui-action-status');
          const parsed=JSON.parse(window.__copiedText||'null');
          if (parsed===null) return '剪贴板为空';
          const keys=Object.keys(parsed).sort().join(',');
          if (keys!=='cacheHits,completed,completionPct,executed,hitRate,queued,requests,scenario,workers') return keys;
          if (parsed.scenario!=='burst') return 'scenario='+parsed.scenario;
          if (parsed.requests!==300||parsed.cacheHits!==180||parsed.executed!==40||parsed.queued!==80||parsed.completed!==220||parsed.completionPct!==73) return JSON.stringify(parsed);
          return true;
        });
        document.body.dataset.errors=failures.join('|');
        check('motFixtureErrors',()=>failures.length===0?true:failures.join('|'));
      } catch (error) {
        fail('motFixtureFatal',String(error&&error.stack||error));
      }
    })();
  `
}

function dumpDom(html, name = 'dump') {
  mkdirSync(folder, {recursive:true})
  const file = join(folder, 'iui-settings.html')
  writeFileSync(file, html)
  const dump = execFileSync(visibleChromium, ['--headless=new','--no-sandbox','--disable-gpu','--hide-scrollbars','--user-data-dir='+join(folder,'settings-profile'),'--virtual-time-budget=3000','--dump-dom','file://'+file], {encoding:'utf8',timeout:60000,stdio:['ignore','pipe','ignore']})
  writeFileSync(join(folder, 'last-' + name + '.html'), dump)
  return dump
}

let visibleChromium = null

test('插件页与设置页在真实 Chromium DOM 中各自完整呈现，并使用真实渲染器预览', (t) => {
  const chromium = findChromium()
  if (chromium === null) {
    t.skip('未找到 Chromium（可用 CHROMIUM_PATH / MIOPIIK_CHROMIUM 指定）：跳过真实 DOM 渲染检查')
    return
  }
  visibleChromium = chromium
  let html
  try {
    html = dumpDom(page(MAIN_RUN), 'main')
  } catch (error) {
    t.skip(`Chromium 不可用（${error.code ?? error.message}）：跳过真实 DOM 渲染检查`)
    return
  }
  assert.match(html,/data-integration="ok"/u,'插件页插槽必须注册成功（且只注册一个）')
  assert.match(html,/data-errors=""/u,'浏览器不应有运行时错误')
  assert.match(html,/data-iui-plugin-settings="1"/u)
  assert.doesNotMatch(html,/role="tablist"/u,'页面里不该有二级页签')
  assert.match(html,/role="switch"/u)
  assert.match(html,/data-iui-settings-preview="live"/u,'预览必须连接真实 IUI 注册表')
  assert.match(html,/data-iui-output="ok"/u,'预览应通过真正的 AST 渲染器')
  assert.match(html,/data-iui-registry-state="ready"/u)
  assert.match(html,/data-iui-preview-source="1"/u,'插件页应给出可复制示例')
  assert.doesNotMatch(html,/data-iui-chart-empty="1"/u,'预览图表不应为空')
  assert.doesNotMatch(html,/linear-gradient/u,'插件页不使用品牌渐变')
  // rc.7 交互面：新控件在真实 Chromium DOM 中全部渲染
  assert.match(html,/data-iui-chart="donut"/u,'donut 应真实渲染（SVG + 图例）')
  assert.match(html,/data-iui-steps="2"/u,'steps 轨道应真实渲染')
  assert.match(html,/data-iui-toggle="on"/u,'toggle 初始应按 state 置为开')
  assert.match(html,/data-iui-slider="60"/u,'slider 初始应取 state 中的 th')
  assert.match(html,/aria-valuenow="60"/u,'progress 绑定值应解析为数字')
  assert.match(html,/data-iui-input="1"/u,'input 应真实渲染')
  assert.doesNotMatch(html,/data-iui-table-filtered="1"/u,'空过滤词不应标记过滤态')
  // rc.8 动效定妆：插件自有样式与入场/hover 类
  assert.match(html,/<style id="miopiik-iui-chrome">/u,'插件应注入固定的动效定妆样式')
  assert.match(html,/class="miopiik-enter"/u,'块与显隐内容应有入场淡入类')
  assert.match(html,/prefers-reduced-motion/u,'定妆样式应尊重减少动效偏好')
  assert.match(html,/class="miopiik-ctl"/u,'交互按钮应有 hover/active 反馈类')
  // rc.16 无障碍与触摸：焦点环、sr-only、粗指针目标、表头 scope、图表数据摘要、分组语义
  assert.match(html,/:focus-visible/u,'交互控件必须有可见焦点环')
  assert.match(html,/\.miopiik-sr\{/u,'需要 sr-only 工具类（live region 用）')
  assert.match(html,/pointer:coarse/u,'触摸屏需放大点击目标')
  assert.match(html,/forced-colors:active/u,'强制色彩模式需有兜底边框')
  assert.match(html,/scope="col"/u,'表头单元格需要 scope=col')
  assert.match(html,/aria-label="占比图：/u,'图表需要数据摘要供读屏')
  assert.match(html,/role="group"/u,'segmented 需要分组语义')
  assert.match(html,/aria-label="演示数据"/u,'表格应带可访问名（caption 或行列数）')
  // rc.9 泳道图：确定性几何布线在真实 DOM 中渲染
  assert.match(html,/data-iui-diagram="2"/u,'泳道图应渲染两条 lane')
  assert.match(html,/data-iui-diagram-node="m1"/u,'节点药丸应携带图内 id')
  assert.match(html,/aria-label="派发链路（演示），3 条连线"/u,'连线应有可访问摘要')
  assert.match(html,/strokeDasharray="4 3"/u,'虚线语义应落在 SVG path 上')
  assert.match(html,/注释行：虚线表示异步路径/u,'纯文本行应按注释保留')
  assert.match(html,/data-iui-diagram-edge-label="1"/u,'连线标签应为 HTML 覆盖层（SVG 拉伸会压扁文字）')
  // L-11 基础：DOM 级嫁接与流式部分渲染
  assert.match(html,/data-graft-ok="ok"/u,'行内嫁接应保留加粗并把 token 原位替换（幂等）')
  assert.match(html,/data-streaming-ok="ok"/u,'流式部分渲染应无入场动画并带流式标记')
  assert.match(html,/data-html-ok="ok"/u,'```html 应渲染为无脚本沙箱 iframe：sandbox 空、CSP 注入、脚本剔除、超预算降级')
  assert.match(html,/data-autosize-tall="ok"/u,'沙箱帧应长到内容高度（700px 内容不能被初始高度截断）')
  assert.match(html,/data-autosize-short="ok"/u,'沙箱帧应收回到内容高度（height 提示 900 不得残留成空白）')
  // M·O·T 机制：derive 链、跨组件同源、details、copy、diagram 条件分支
  assert.match(html,/data-mot-derive-initial="ok"/u,'derive 链初始值应为 N=120/H=72/E=48/Q=0/C=120')
  assert.match(html,/data-mot-cross-component="ok"/u,'派生值应进入图表/表格等任意组件（跨组件同源）')
  assert.match(html,/data-mot-details-closed="ok"/u,'details 初始应收起（aria-expanded=false）')
  assert.match(html,/data-mot-details-open="ok"/u,'details 点击后应展开（aria-expanded=true + aria-controls 指向内容）')
  assert.match(html,/data-mot-derive-after-slider="ok"/u,'改滑杆后派生数值应随状态变化')
  assert.match(html,/data-mot-details-persist="ok"/u,'IuiSheet 重渲染（改滑杆）不得重置 details 展开状态')
  assert.match(html,/data-mot-details-persist-scenario="ok"/u,'IuiSheet 重渲染（切 segmented）不得重置 details 展开状态')
  assert.match(html,/data-mot-boolean-when="ok"/u,'派生布尔用于 when 时 truthy 显示、零值隐藏')
  assert.match(html,/data-mot-diagram-conditional="ok"/u,'Q>0 时条件节点与其 edge 应显示')
  assert.match(html,/data-mot-diagram-hidden="ok"/u,'Q=0 时隐藏节点不渲染，引用它的 edge 一并跳过')
  assert.match(html,/data-mot-copy-button="ok"/u,'copy 按钮应存在且 label 走 resolve')
  assert.match(html,/data-mot-copy-unsupported="ok"/u,'剪贴板不可用时 copy 显示 unsupported 文案并通过 role=status 播报')
  assert.match(html,/data-mot-copy-rejected="ok"/u,'剪贴板写入被拒绝时 copy 显示 unsupported，不抛异常')
  assert.match(html,/data-mot-copy-ok="ok"/u,'剪贴板可用时写入派生 config JSON 并显示 done 文案')
  assert.match(html,/data-mot-table-guard="ok"/u,'table 绑定值 resolve 后必须重新执行 12 列 / 200 行 / 体积预算（降级而非渲染超限表）')
  assert.match(html,/data-mot-copy-budget="ok"/u,'copy 载荷超过 stateBytes 时必须 unsupported 且不写剪贴板')
  assert.doesNotMatch(html,/data-mot-fatal=/u,'M·O·T 机制交互不应抛异常')
  // Round3 自然表达：密度三态 / 语义权重 / details 受控与重挂载 / copy 摘要 / 字面量回退 / 派生拓扑
  assert.match(html,/data-r3-density="ok"/u,'根密度三态应各有真实样式（inline 无框、compact 8px、panel 12px）且输出 data-iui-density')
  assert.match(html,/data-auto-layout="ok"/u,'自动布局应使用正文外观，保留显式分组，按组件最小宽度并排或堆叠')
  assert.match(html,/data-comparison-initial="ok"/u,'对照图应默认第一个可用条件，并在图内声明顺序中保留共享图元')
  assert.match(html,/data-comparison-choice="ok"/u,'对照切换应同步图元、按钮和可访问图注')
  assert.match(html,/data-comparison-fallback="ok"/u,'选中条件隐藏时应回退到第一个可用条件')
  assert.match(html,/data-comparison-restored="ok"/u,'普通重渲染应保留显式选择')
  assert.match(html,/data-comparison-live="ok"/u,'尚未定稿的流式对照选项应禁用')
  assert.match(html,/data-r3-weight="ok"/u,'weight 三态应输出 data-iui-weight 并给出强弱视觉（primary 加粗 / secondary·optional 弱化）')
  assert.match(html,/data-r3-details-closed="ok"/u,'details 初始应收起并带 aria-expanded=false')
  assert.match(html,/data-r3-details-open="ok"/u,'details 由 IuiSheet 受控展开（aria-controls 指向内容）')
  assert.match(html,/data-r3-details-hidden="ok"/u,'when=false 时 details 子树应卸载')
  assert.match(html,/data-r3-details-remount="ok"/u,'子组件重挂载后 details 展开态不得丢失（IuiSheet 级 open Map）')
  assert.match(html,/data-r3-copy-summary="ok"/u,'copy 按钮应显示真实待复制摘要「待复制：JSON · N 字符」/「—」并带 data-iui-copy-bytes')
  assert.match(html,/data-r3-copy-success="ok"/u,'copy 成功后 done 文案应追加 · N 字符，且剪贴板内容与摘要一致')
  assert.match(html,/data-r3-copy-invalid="ok"/u,'待复制值无法解析时点击必须 unsupported，不假报成功')
  assert.match(html,/data-r3-literal-fallback="ok"/u,'未解析绑定使用简洁兜底，声明语法不进入正文')
  assert.match(html,/data-reader-fallback="ok"/u,'整块和局部异常保留作者兜底，不破坏健康相邻内容或流式阶段')
  assert.match(html,/data-r3-derive-forward="ok"/u,'derive 应按依赖拓扑求值，支持文档顺序之前的前向引用')
  assert.match(html,/data-r3-derive-failures="ok"/u,'derive 求值失败/合并 scope 超预算应传递 undefined 并在根节点计 data-iui-derive-errors')
  assert.match(html,/data-r3-derive-cycle="ok"/u,'derive 环应在校验期降级并在指标处显示兜底')
  assert.match(html,/data-r3-errors="ok"/u,'Round3 场景不应产生浏览器运行时错误')
})

test('M·O·T 演示块（miopiik-ml）在真实 Chromium DOM 中完成派生/折叠/复制/条件图', (t) => {
  if (motFixture === null) {
    t.skip(`未找到 ${motFixturePath}（Lead 提供）：跳过 M·O·T 演示块断言`)
    return
  }
  const chromium = visibleChromium ?? findChromium()
  if (chromium === null) {
    t.skip('未找到 Chromium（可用 CHROMIUM_PATH / MIOPIIK_CHROMIUM 指定）：跳过真实 DOM 渲染检查')
    return
  }
  visibleChromium = chromium
  let html
  try {
    html = dumpDom(page(motRun(motFixture)), 'mot')
  } catch (error) {
    t.skip(`Chromium 不可用（${error.code ?? error.message}）：跳过真实 DOM 渲染检查`)
    return
  }
  assert.match(html,/data-errors=""/u,'浏览器不应有运行时错误')
  assert.match(html,/data-mot-fixture-rendered="ok"/u,'M·O·T 演示块应通过 ml 解析与 AST 校验完整渲染')
  assert.match(html,/data-mot-fixture-steady="ok"/u,'初始 steady 派生值应为 N=120/H=72/E=48/Q=0/C=120/P=100 且无容量告警')
  assert.match(html,/data-mot-fixture-details="ok"/u,'details 初始应收起')
  assert.match(html,/data-mot-fixture-details-open="ok"/u,'details 展开后应显示计算口径与「规则模拟」声明')
  assert.match(html,/data-mot-fixture-workers-slider="ok"/u,'工人数滑杆应为 2..12')
  assert.match(html,/data-mot-fixture-burst="ok"/u,'突发+2 工人时图表应为 H=180/E=40/Q=80 并出现容量不足告警')
  assert.match(html,/data-mot-fixture-details-persist="ok"/u,'切场景后 details 展开状态不得重置')
  assert.match(html,/data-mot-fixture-diagram-conditional="ok"/u,'Q>0 时队列节点与边应显示')
  assert.match(html,/data-mot-fixture-copy-button="ok"/u,'copy 按钮应存在')
  assert.match(html,/data-mot-fixture-copy="ok"/u,'copy 应写入九个契约键的派生 config JSON')
  assert.doesNotMatch(html,/data-mot-fixture-fatal=/u,'M·O·T 演示块交互不应抛异常')
})
