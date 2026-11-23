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
    const React = {createElement:h, useState(v) {return [typeof v==='function'?v():v, ()=>{}]}, useEffect(){}, useLayoutEffect(){}, useMemo(fn){return fn()}, useCallback(fn){return fn}, useRef(){return {current:null}}};
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
    module.apply({effect(){},slots:{inject(name,callback){if(name!=='plugins.bundle.config')throw Error('wrong slot '+name);callback()},register(meta,render){slots.push({meta,render})}}});
    const page=slots.find(s=>s.meta.name==='plugins.bundle.config');
    document.getElementById('root').appendChild(page.render({view:'page'}));
    const embeds=globalThis.__miopiikMarkdownEmbeds;
    const demo=document.createElement('div');
    demo.appendChild(embeds.renderBlock(${JSON.stringify(DEMO_CONTROLS_ML)}));
    demo.appendChild(embeds.renderBlock(${JSON.stringify(DEMO_DIAGRAM_ML)}));
    document.getElementById('root').appendChild(demo);
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
    const streamNode=embeds.renderBlockStreaming('<ui title="流式" fallback="F"><row><metric label="A" value="1"/>');
    live.appendChild(streamNode);
    document.getElementById('root').appendChild(live);
    const streamRoot=document.querySelector('[data-iui-streaming="1"]');
    document.body.dataset.streamingOk = (streamRoot !== null && String(streamRoot.className) === '' && streamRoot.getAttribute('data-iui-output') === 'ok') ? 'ok' : 'failed';
    // F-42：html 围栏沙箱文档——无脚本 iframe + CSP 注入 + 脚本剔除 + 超预算降级
    const htmlDoc = '<!doctype html><html><head><title>沙箱演示</title><script>alert(1)</'+'script><style>.chip{border:1px solid red}</style></head><body><span class="chip">A</span><code>&lt;diagram&gt;</code></body></html>';
    const htmlHost = document.createElement('div');
    htmlHost.appendChild(embeds.renderHtmlBlock(htmlDoc));
    document.getElementById('root').appendChild(htmlHost);
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
      && srcdoc.indexOf('<style data-miopiik-frame-preset="1">') < srcdoc.indexOf('<style>.chip{')
    const frameStyle = String(frame === null ? '' : (frame.getAttribute('style') ?? ''));
    const noResizeOk = frameStyle.indexOf('resize') === -1;
    // 真宿主令牌采样：把 dsw-* 变量挂到 documentElement，渲染时必须解析成绝对色值注入文档
    document.documentElement.style.setProperty('--dsw-alias-bg-base', 'rgb(11, 22, 33)');
    document.documentElement.style.setProperty('--dsw-alias-brand-primary', 'rgb(4, 5, 6)');
    const themed = embeds.renderHtmlBlock('<html><head></head><body><p>x</p></body></html>');
    const themedSrc = String((themed === null ? null : themed.getAttribute('srcdoc')) ?? '');
    const hostThemeOk = themedSrc.indexOf('--mi-bg:rgb(11, 22, 33)') >= 0
      && themedSrc.indexOf('--mi-accent:rgb(4, 5, 6)') >= 0
      && themedSrc.indexOf('--mi-bg:#0d1117') === -1;
    document.documentElement.style.removeProperty('--dsw-alias-bg-base');
    document.documentElement.style.removeProperty('--dsw-alias-brand-primary');
    // rc.14/rc.15 自动高度：内容高就用内容高（不残留初始值），内容矮就收回来（不被高提示撑住）
    const tallHost = document.createElement('div');
    tallHost.appendChild(embeds.renderHtmlBlock('<!doctype html><html><head><title>tall</title></head><body><div style="height:700px">tall</div></body></html>'));
    document.getElementById('root').appendChild(tallHost);
    const shortHost = document.createElement('div');
    shortHost.appendChild(embeds.renderHtmlBlock('<!-- height: 900 --><!doctype html><html><head><title>short-hint</title></head><body><p>short</p></body></html>'));
    document.getElementById('root').appendChild(shortHost);
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
    const big = embeds.renderHtmlBlock('<html>' + 'x'.repeat(262200) + '</html>');
    const oversizeOk = big !== null && typeof big.getAttribute === 'function' && big.getAttribute('data-miopiik-html-fallback') === 'oversize';
    document.body.dataset.htmlOk = (frameOk && oversizeOk) ? 'ok' : 'failed';
    document.body.dataset.integration = slots.length===1 && page.meta.key==='miopiik-iui' ? 'ok' : 'failed';
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
    html = execFileSync(chromium,['--headless=new','--no-sandbox','--disable-gpu','--hide-scrollbars','--user-data-dir='+join(folder,'settings-profile'),'--virtual-time-budget=3000','--dump-dom','file://'+file],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','ignore']})
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
})
