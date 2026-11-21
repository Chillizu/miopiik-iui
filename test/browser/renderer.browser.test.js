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

function fixture() {
  const setup = `
    const failures = [];
    window.addEventListener('error', e => failures.push(String(e.message)));
    let plugin;
    window.__ModuleLoader__ = { load(v) { plugin = v } };
    const SVG = new Set(['svg','g','path','rect','text','defs','marker','polyline','line','circle']);
    function h(type, props, ...children) {
      props = props || {};
      if (typeof type === 'function') return type({...props, children});
      const el = SVG.has(type) ? document.createElementNS('http://www.w3.org/2000/svg',type) : document.createElement(type);
      for (const [key,val] of Object.entries(props)) {
        if (val === null || val === undefined || key === 'key' || key === 'ref') continue;
        if (key === 'style') { for(const [prop,raw] of Object.entries(val)) el.style[prop] = typeof raw === 'number' && !['opacity','lineHeight','fontWeight','flexGrow','flexShrink','order','zIndex'].includes(prop) ? raw+'px' : raw; continue; }
        if (key.startsWith('on') && typeof val === 'function') { el.addEventListener(key.slice(2).toLowerCase(),val);continue; }
        if (key === 'className') { el.className = val; continue; }
        el.setAttribute(key,String(val));
      }
      for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
      }
      return el;
    }
    const React = {createElement:h, useState(v) {return [typeof v==='function'?v():v, ()=>{}]}, useEffect(){}, useMemo(fn){return fn()}, useCallback(fn){return fn}};
    const primitives = {
      Switch({checked,onChange,label}) {
        return React.createElement('button',{role:'switch','aria-checked':checked,'aria-label':label,onClick:()=>onChange(!checked)});
      },
      Button({onClick,children}) { return React.createElement('button',{onClick},children); },
    };
  `
  const run = `
    const slots=[];
    const module=plugin.factory(name => {if(name==='react')return React;if(name==='@deepseek-ai/dsh-client-ui-primitives')return primitives;throw Error('unexpected module '+name)});
    module.apply({effect(){},slots:{inject(name,callback){if(name!=='plugins.bundle.config'&&name!=='settings.plugins.tab')throw Error('wrong slot '+name);callback()},register(meta,render){slots.push({meta,render})}}});
    const intro=slots.find(s=>s.meta.name==='plugins.bundle.config');
    const tab=slots.find(s=>s.meta.name==='settings.plugins.tab');
    document.getElementById('root').appendChild(intro.render({view:'page'}));
    document.getElementById('root').appendChild(tab.render({}));
    const embeds=globalThis.__miopiikMarkdownEmbeds;
    const demo=document.createElement('div');
    demo.appendChild(embeds.renderBlock(${JSON.stringify(DEMO_CONTROLS_ML)}));
    document.getElementById('root').appendChild(demo);
    document.body.dataset.integration = slots.length===2 && intro.meta.key==='miopiik-iui' && tab.meta.id==='miopiik-iui' ? 'ok' : 'failed';
    document.body.dataset.errors=failures.join('|');
  `
  return '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><main id="root" style="width:650px;max-width:100%"></main><script>' + setup + '\n' + bundle + '\n' + run + '</script></body></html>'
}

test('插件页与设置页在真实 Chromium DOM 中各自完整呈现，并使用真实渲染器预览', (t) => {
  const chromium = findChromium()
  if (chromium === null) {
    t.skip('未找到 Chromium（可用 CHROMIUM_PATH / MIOPIIK_CHROMIUM 指定）：跳过真实 DOM 渲染检查')
    return
  }
  mkdirSync(folder, {recursive:true})
  const file=join(folder,'iui-settings.html')
  writeFileSync(file,fixture())
  let html
  try {
    html = execFileSync(chromium,['--headless=new','--no-sandbox','--disable-gpu','--hide-scrollbars','--user-data-dir='+join(folder,'settings-profile'),'--dump-dom','file://'+file],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','ignore']})
  } catch (error) {
    t.skip(`Chromium 不可用（${error.code ?? error.message}）：跳过真实 DOM 渲染检查`)
    return
  }
  assert.match(html,/data-integration="ok"/u,'两个插槽都必须注册成功')
  assert.match(html,/data-errors=""/u,'浏览器不应有运行时错误')
  assert.match(html,/data-iui-plugin-settings="1"/u)
  assert.match(html,/data-iui-overview="1"/u)
  assert.match(html,/data-iui-configuration="1"/u)
  assert.doesNotMatch(html,/role="tablist"/u,'页面里不该再有二级页签')
  assert.match(html,/role="switch"/u)
  assert.match(html,/data-iui-settings-preview="live"/u,'预览必须连接真实 IUI 注册表')
  assert.match(html,/data-iui-output="ok"/u,'预览应通过真正的 AST 渲染器')
  assert.match(html,/data-iui-registry-state="ready"/u)
  assert.match(html,/data-iui-preview-source="1"/u,'设置页应给出可复制示例')
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
})
