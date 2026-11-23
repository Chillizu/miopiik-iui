/**
 * Standalone IUI renderer extracted from the verified MiOpIIk RC.
 * Scope: React h/React, IUI_AST, MIOPIIK_ML, C, SANS. No legacy Widget/Ink deps.
 * This source is bundled verbatim into client.js by tools/build.mjs.
 */
    function svgCanvas(width, height, children, label) {
      return h(
        'svg',
        {
          viewBox: `0 0 ${width} ${height}`,
          width,
          height,
          preserveAspectRatio: 'xMidYMid meet',
          role: 'img',
          'aria-label': label === undefined || label === '' ? undefined : label,
          style: { display: 'block', maxWidth: '100%', height: 'auto', margin: '0 auto', overflow: 'visible' },
        },
        ...children,
      )
    }

    const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

    /** 图表可访问摘要：读屏用户拿到的应是数据本身，而不只是"一张图"。 */
    function chartSummary(rows, kind) {
      const kindName = { bar: '柱状图', line: '折线图', donut: '占比图' }[kind] ?? '图表'
      const parts = rows.slice(0, 8).map((row) => `${String(row[0] ?? '')} ${String(row[1] ?? '')}`)
      const suffix = rows.length > 8 ? `，等共 ${rows.length} 项` : ''
      return `${kindName}：${parts.join('，')}${suffix}`
    }

    function renderChart(columns, rows, kind, label) {
      const values = rows.map((row) => Number(row[1]) || 0)
      const max = Math.max(1, ...values)
      const labels = rows.map((row) => String(row[0] ?? ''))
      if (kind === 'line') {
        const width = 360
        const height = 128
        const padL = 8
        const padR = 8
        const padT = 18
        const padB = 22
        const step = rows.length > 1 ? (width - padL - padR) / (rows.length - 1) : 0
        const points = values.map((value, index) => ({
          x: padL + index * step,
          y: height - padB - (value / max) * (height - padB - padT),
        }))
        const parts = []
        parts.push(h('line', { key: 'axis', x1: padL, y1: height - padB, x2: width - padR, y2: height - padB, stroke: C.border, strokeWidth: 1 }))
        parts.push(
          h('polyline', {
            key: 'line',
            points: points.map((point) => `${point.x},${point.y}`).join(' '),
            fill: 'none',
            stroke: C.brand,
            strokeWidth: 2,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }),
        )
        points.forEach((point, index) => {
          parts.push(h('circle', { key: `dot-${index}`, cx: point.x, cy: point.y, r: 3, fill: C.brand }))
          parts.push(
            h('text', { key: `val-${index}`, x: point.x, y: point.y - 8, fontSize: 9, fill: C.text, fontFamily: SANS, textAnchor: 'middle' }, String(values[index])),
          )
          parts.push(
            h('text', { key: `lab-${index}`, x: point.x, y: height - 7, fontSize: 8.5, fill: C.muted, fontFamily: SANS, textAnchor: 'middle' }, labels[index]),
          )
        })
        return svgCanvas(width, height, parts, label)
      }
      if (kind === 'donut') {
        const size = 124
        const radius = 42
        const thickness = 16
        const total = values.reduce((sum, value) => sum + value, 0) || 1
        const circumference = 2 * Math.PI * radius
        let offset = 0
        const palette = [C.brand, C.success, C.warn, C.idle, C.error]
        const arcs = values.map((value, index) => {
          const length = (value / total) * circumference
          const arc = h('circle', {
            key: `arc-${index}`,
            cx: size / 2,
            cy: size / 2,
            r: radius,
            fill: 'none',
            stroke: palette[index % palette.length],
            strokeWidth: thickness,
            strokeDasharray: `${Math.max(0, length - 2)} ${circumference}`,
            strokeDashoffset: -offset,
            transform: `rotate(-90 ${size / 2} ${size / 2})`,
            strokeLinecap: 'butt',
          })
          offset += length
          return arc
        })
        return h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' } },
          h('div', { style: { width: size, flex: 'none' } }, svgCanvas(size, size, arcs, label)),
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 } },
            ...labels.map((label, index) =>
              h(
                'div',
                { key: index, style: { display: 'flex', alignItems: 'center', gap: 6 } },
                h('span', { style: { width: 8, height: 8, borderRadius: 2, background: palette[index % palette.length], flex: 'none' } }),
                h('span', { style: { color: C.text } }, label),
                h('span', { style: { color: C.muted } }, String(values[index])),
              ),
            ),
          ),
        )
      }
      const chartHeight = 96
      const axis = h(
        'div',
        { key: 'plot', style: { display: 'flex', alignItems: 'flex-end', gap: 10, height: chartHeight, borderBottom: `1px solid ${C.border}` } },
        ...rows.map((row, index) =>
          h(
            'div',
            { key: `bar-${index}`, style: { flex: '1 1 0', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 3 } },
            h('div', { style: { fontSize: 10, color: C.text, lineHeight: '12px' } }, String(values[index])),
            h('div', {
              style: {
                width: '100%',
                maxWidth: 52,
                height: Math.max(2, Math.round((values[index] / max) * (chartHeight - 18))),
                background: C.brand,
                borderRadius: '3px 3px 0 0',
              },
            }),
          ),
        ),
      )
      const labelsRow = h(
        'div',
        { key: 'labels', style: { display: 'flex', gap: 10, marginTop: 5 } },
        ...labels.map((label, index) =>
          h(
            'div',
            { key: `lab-${index}`, style: { flex: '1 1 0', minWidth: 0, textAlign: 'center', fontSize: 10, color: C.muted, lineHeight: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            label,
          ),
        ),
      )
      return h('div', { style: { display: 'flex', flexDirection: 'column', width: '100%' } }, axis, labelsRow)
    }

    /** when/is 显隐判定：通用 node() 与 diagram 子树共用（diagram 单独处理子树，不能直接复用 node()）。 */
    function isItemVisible(item, resolve) {
      const itemProps = item?.props ?? {}
      if (itemProps.when === undefined) return true
      const actual = resolve(itemProps.when)
      return itemProps.is === undefined ? Boolean(actual) : sameValue(actual, resolve(itemProps.is))
    }

    function IuiDiagram({ item, resolve }) {
      // 泳道图：真实浏览器挂载后一次实测锚点（等比 1:1 坐标，箭头精确落在药丸边缘）；
      // stub / 无 DOM 环境回落到近似几何（360 逻辑坐标），保住测试通道与降级路径。
      const props = item.props ?? {}
      const resolveText = (value) => (value === undefined || value === null ? '' : String(value))
      const kids = Array.isArray(item.children) ? item.children : []
      const lanes = []
      const notes = []
      const edges = []
      const freeNodes = []
      // 先过滤子树：隐藏 node 不进入布局/布线，引用隐藏 node 的 edge 一并跳过，
      // 隐藏 lane 若仍有可见 node 则忽略其分组（节点并入首列），无可见节点的列整列去掉。
      for (const child of kids) {
        if (child.type === 'lane') {
          const laneVisible = isItemVisible(child, resolve)
          const laneKids = Array.isArray(child.children) ? child.children : []
          const visibleNodes = laneKids
            .filter((laneChild) => laneChild?.type === 'node' && isItemVisible(laneChild, resolve))
            .map((laneChild) => ({
              ...laneChild,
              props: {
                ...(laneChild.props ?? {}),
                label: resolveText(resolve(laneChild.props?.label)),
                note: resolveText(resolve(laneChild.props?.note)),
              },
            }))
          if (!laneVisible) {
            freeNodes.push(...visibleNodes)
            continue
          }
          if (visibleNodes.length === 0) continue
          lanes.push({ ...child, props: { ...(child.props ?? {}), label: resolveText(resolve(child.props?.label)) }, children: visibleNodes })
        } else if (child.type === 'node') {
          if (!isItemVisible(child, resolve)) continue
          freeNodes.push({
            ...child,
            props: {
              ...(child.props ?? {}),
              label: resolveText(resolve(child.props?.label)),
              note: resolveText(resolve(child.props?.note)),
            },
          })
        } else if (child.type === 'edge') {
          if (!isItemVisible(child, resolve)) continue
          edges.push({ ...child, props: { ...(child.props ?? {}), label: resolveText(resolve(child.props?.label)) } })
        } else notes.push(child)
      }
      if (freeNodes.length > 0) lanes.unshift({ props: {}, children: freeNodes })
      const visibleIds = new Set()
      for (const lane of lanes) for (const laneChild of lane.children) {
        const laneId = laneChild.props?.id
        if (typeof laneId === 'string') visibleIds.add(laneId)
      }
      const liveEdges = edges.filter((edge) => visibleIds.has(edge.props?.from) && visibleIds.has(edge.props?.to))
      const laneCount = Math.max(1, lanes.length)
      const PILL = 44
      const GAP = 14
      const HEAD = 30 // 列标签行 16 + 间距 14；此前 8px 行高曾把列标题裁成残影
      const slots = lanes.map((lane) => (Array.isArray(lane.children) ? lane.children.filter((child) => child.type === 'node') : []))
      const maxSlots = Math.max(1, ...slots.map((slot) => slot.length))
      const laneOf = {}
      const rowOf = {}
      slots.forEach((laneNodes, li) => laneNodes.forEach((node, si) => { laneOf[node.props?.id] = li; rowOf[node.props?.id] = si }))
      // 反向边（或多列同行正向跳跃）统一走底部弧线：静态判定即可，提前留出底部空间
      const needsDrop = liveEdges.some((edge) => {
        const f = laneOf[edge.props?.from]
        const t = laneOf[edge.props?.to]
        if (f === undefined || t === undefined) return false
        if (f > t) return true
        return f < t && Math.abs(f - t) > 1 && rowOf[edge.props?.from] === rowOf[edge.props?.to]
      })
      const wrapRef = React.useRef(null)
      const [geo, setGeo] = React.useState(null)
      React.useLayoutEffect(() => {
        const root = wrapRef.current
        if (root === null || typeof root.querySelectorAll !== 'function') return
        const rootRect = root.getBoundingClientRect()
        if (rootRect.width === 0 || rootRect.height === 0) return
        const anchors = {}
        for (const el of root.querySelectorAll('[data-iui-diagram-node]')) {
          const r = el.getBoundingClientRect()
          anchors[el.getAttribute('data-iui-diagram-node')] = { cx: r.left - rootRect.left + r.width / 2, cy: r.top - rootRect.top + r.height / 2, halfW: r.width / 2, halfH: r.height / 2 }
        }
        const { arcs } = DIAGRAM_GEO.diagramEdges(liveEdges, anchors, rootRect.width / laneCount)
        // spacer 已在流内，rootRect.height 自带底部弧线空间
        const next = { width: rootRect.width, height: rootRect.height, arcs }
        const signature = JSON.stringify(next)
        setGeo((prev) => (prev !== null && prev.signature === signature ? prev : { ...next, signature }))
      })
      const rowsHeight = HEAD + maxSlots * PILL + Math.max(0, maxSlots - 1) * GAP + (needsDrop ? 48 : 0)
      const measured = geo !== null
      const anchors = measured ? null : DIAGRAM_GEO.diagramFallbackAnchors(slots, laneCount, HEAD, PILL, GAP)
      const layout = measured ? { arcs: geo.arcs } : DIAGRAM_GEO.diagramEdges(liveEdges, anchors, 360 / laneCount)
      const svgWidth = measured ? geo.width : 360
      const svgHeight = measured ? geo.height : rowsHeight
      const markerId = 'miopiik-arrow-' + String(item.id ?? 'diagram').replace(/[^A-Za-z0-9_-]/gu, '')
      const markerSize = measured ? 7 : 6
      const titleText = resolveText(resolve(props.title))
      const sourceText = resolveText(resolve(props.source))
      return h(
        'div',
        { className: 'miopiik-enter', 'data-iui-diagram': String(lanes.length), style: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 } },
        h('div', { ref: wrapRef, style: { position: 'relative', width: '100%' } },
          h('svg', {
            viewBox: `0 0 ${svgWidth} ${svgHeight}`,
            preserveAspectRatio: measured ? undefined : 'none',
            role: 'img',
            'aria-label': titleText === '' ? `泳道图，${liveEdges.length} 条连线` : `${titleText}，${liveEdges.length} 条连线`,
            style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' },
          },
            h('defs', { key: 'defs' },
              h('marker', { key: markerId, id: markerId, viewBox: `0 0 ${markerSize} ${markerSize}`, refX: markerSize - 0.5, refY: markerSize / 2, markerWidth: markerSize, markerHeight: markerSize, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' },
                h('path', { d: `M0,0 L${markerSize},${markerSize / 2} L0,${markerSize} z`, fill: C.muted }))),
            ...layout.arcs.map((arc, index) => h('path', { key: `edge-${index}`, d: arc.d, fill: 'none', stroke: C.muted, strokeWidth: 1.2, markerEnd: `url(#${markerId})`, strokeDasharray: arc.dashed ? '4 3' : undefined })),
          ),
          ...layout.arcs.map((arc, index) => arc.label === null ? null : h('div', {
            key: `edge-label-${index}`,
            'data-iui-diagram-edge-label': '1',
            style: {
              position: 'absolute',
              left: measured ? `${arc.labelX}px` : `${Math.min(88, Math.max(12, (arc.labelX / 360) * 100))}%`,
              top: `${arc.labelY}px`,
              transform: 'translate(-50%, -50%)',
              fontSize: 9.5,
              color: C.muted,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            },
          }, arc.label)),
          h('div', { style: { position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${laneCount}, minmax(0, 1fr))`, gap: 10, minWidth: 0 } },
            ...lanes.map((lane, li) => h('div', { key: `lane-${li}`, 'data-iui-diagram-lane': String(li), style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: GAP, minWidth: 0 } },
              h('div', { key: 'head', style: { height: 16, display: 'flex', alignItems: 'flex-end', fontSize: 11, lineHeight: '16px', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' } }, String(lane.props?.label ?? '')),
              ...slots[li].map((child, si) => {
                const cp = child.props ?? {}
                const toneColor = (TONE_COLORS[cp.tone] ?? [null, C.text])[1]
                return h('div', { key: `node-${si}`, 'data-iui-diagram-node': String(cp.id ?? ''), style: { height: PILL, minWidth: 56, maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, border: `1px ${cp.tone === 'accent' ? 'dashed' : 'solid'} ${cp.tone ? toneColor : C.border}`, borderRadius: 8, padding: '2px 8px', boxSizing: 'border-box', textAlign: 'center', color: cp.tone ? toneColor : C.text } },
                  h('div', { style: { fontSize: 11, lineHeight: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' } }, String(cp.label ?? '')),
                  String(cp.note ?? '') !== '' ? h('div', { style: { fontSize: 9, lineHeight: '11px', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' } }, String(cp.note)) : null)
              }),
            )),
          ),
          needsDrop ? h('div', { key: 'drop', style: { height: 48 } }) : null,
        ),
        titleText !== '' || sourceText !== '' ? h('div', { style: { fontSize: 10, color: C.muted } }, [titleText, sourceText !== '' ? `来源：${sourceText}` : ''].filter((part) => part !== '').join(' · ')) : null,
        ...notes.map((note, index) => h('div', { key: `note-${index}`, style: { fontSize: 10, color: C.muted } }, resolveText(resolve(note.props?.text)))),
      )
    }

    /** derive 名字：点号路径，段首字母/下划线；保留名段禁止（渲染层按 AST 校验规则再守一道）。 */
    const DERIVE_NAME = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u
    const RESERVED_STATE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
    function isRecordValue(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value)
    }
    // 表达式引擎由构建器以 IUI_EXPR 闭包注入；缺失或接口异常时 derive 全部解析为 undefined（组件显示兜底），不抛异常。
    const EXPR_ENGINE = (() => {
      try {
        return typeof IUI_EXPR === 'undefined' ? null : IUI_EXPR
      } catch {
        return null
      }
    })()
    const EXPR_CACHE = new Map()
    const DERIVE_MAX = Number.isInteger(IUI_AST.LIMITS?.derive) ? IUI_AST.LIMITS.derive : 64

    function compileDeriveExpr(source) {
      const key = String(source)
      if (EXPR_CACHE.has(key)) return EXPR_CACHE.get(key)
      let compiled = null
      try {
        compiled = EXPR_ENGINE === null ? null : EXPR_ENGINE.compileExpr(source)
      } catch {
        compiled = null
      }
      if (compiled === null || typeof compiled !== 'object' || compiled.ok !== true) {
        compiled = { ok: false, error: typeof compiled?.error === 'string' ? compiled.error : '表达式不可用' }
      }
      // 有界缓存：同一 source 重复出现不重复编译（引擎自身缓存之外再守一道）
      if (EXPR_CACHE.size >= 256) EXPR_CACHE.delete(EXPR_CACHE.keys().next().value)
      EXPR_CACHE.set(key, compiled)
      return compiled
    }

    /** derive 结果必须是 JSON-safe 值（有限数/字符串/布尔/null/数组/纯对象），否则该派生值按 undefined 处理。 */
    function safeDerivedValue(value, depth) {
      if (depth > 8) return null
      if (value === null) return { ok: true, value }
      const kind = typeof value
      if (kind === 'boolean') return { ok: true, value }
      if (kind === 'number') return Number.isFinite(value) ? { ok: true, value } : null
      if (kind === 'string') return value.length <= IUI_AST.LIMITS.text ? { ok: true, value } : null
      if (kind !== 'object') return null
      if (Array.isArray(value)) {
        if (value.length > 128) return null
        const items = []
        for (const entry of value) {
          const safe = safeDerivedValue(entry, depth + 1)
          if (safe === null) return null
          items.push(safe.value)
        }
        return { ok: true, value: items }
      }
      const keys = Object.keys(value)
      if (keys.length > 64) return null
      const record = {}
      for (const key of keys) {
        if (key.length > 64 || RESERVED_STATE_KEYS.has(key)) return null
        const safe = safeDerivedValue(value[key], depth + 1)
        if (safe === null) return null
        record[key] = safe.value
      }
      return { ok: true, value: record }
    }

    /** DFS（文档顺序）收集 derive 节点。 */
    function collectDeriveNodes(root) {
      const found = []
      const walk = (item) => {
        if (item === null || typeof item !== 'object') return
        if (item.type === 'derive') found.push(item)
        const kids = Array.isArray(item.children) ? item.children : []
        for (const kid of kids) walk(kid)
      }
      walk(root)
      return found
    }

    /** 依次求值派生链，返回「原始 state + 派生值」合并后的只读 scope.state（不修改 React state）。 */
    function deriveState(root, baseState) {
      const nodes = collectDeriveNodes(root)
      if (nodes.length === 0) return baseState
      let merged = baseState
      const seen = new Set()
      const total = Math.min(nodes.length, DERIVE_MAX)
      for (let index = 0; index < total; index += 1) {
        const node = nodes[index]
        const props = node.props ?? {}
        const name = props.name
        if (typeof name !== 'string' || name === '' || name.length > 200 || !DERIVE_NAME.test(name)) continue
        if (name.split('.').some((part) => RESERVED_STATE_KEYS.has(part))) continue
        if (seen.has(name)) continue
        seen.add(name)
        let value
        if (EXPR_ENGINE !== null && typeof props.expr === 'string') {
          const compiled = compileDeriveExpr(props.expr)
          if (compiled.ok) {
            let evaluated = null
            try {
              evaluated = EXPR_ENGINE.evaluateExpr(compiled, { state: merged, data: {} })
            } catch {
              evaluated = null
            }
            if (evaluated !== null && typeof evaluated === 'object' && evaluated.ok === true) {
              const safe = safeDerivedValue(evaluated.value, 0)
              if (safe !== null) value = safe.value
            }
          }
        }
        // 失败/非法值同样写入 undefined：依赖它的后续 derive 与组件都能读到「不可用」，不会回落到原始 state 的旧值。
        merged = writeStatePath(merged, name, value)
      }
      return merged
    }


    function IuiSheet({ sample, format, degraded, streaming }) {
      const checked = IUI_AST.validateAst(sample)
      // 依赖必须是**内容**而不是对象引用：正文每次渲染都会产生新对象，用引用会导致状态被重置。
      const sampleKey = React.useMemo(() => {
        try {
          return JSON.stringify(checked.ok ? { state: checked.ast.state, root: checked.ast.root } : sample)
        } catch {
          return String(sample)
        }
      }, [sample])
      const [state, setState] = React.useState(checked.ok ? checked.ast.state : {})
      React.useEffect(() => {
        if (checked.ok) setState(checked.ast.state)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [sampleKey])
      const degradedCount = (Array.isArray(degraded) ? degraded.length : 0) + (checked.ok ? checked.degraded : 0)
      if (!checked.ok) {
        return h(
          'div',
          { 'data-iui-output': 'invalid', 'data-iui-format': format ?? 'json', style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, lineHeight: '18px' } },
          h('div', { style: { color: C.muted } }, '这份 AST 不合法，已整段降级：'),
          h('div', null, checked.fallback || checked.errors[0]),
        )
      }
      const ast = checked.ast
      // 派生状态：每次渲染按 DFS 顺序求值 derive 链，与原始 state 合并成统一 scope；
      // 之后所有 $state.* 读取（控件 + 全部组件）都看到派生结果（跨组件同源）。
      const scopedState = deriveState(ast.root, state)
      const scope = { state: scopedState, data: {} }
      const resolve = (value) => IUI_AST.resolveValue(value, scope)
      const textOf = (value) => (value === undefined || value === null ? '' : String(value))
      const node = (item, key) => {
        const props = item.props ?? {}
        // when/is：本地显隐（可选 is 做等值切换）。只读 $state，不执行任何表达式。
        if (!isItemVisible(item, resolve)) return null
        if (item.type === 'derive') return null
        if (item.type === 'text') {
          return h('div', { key, style: { fontSize: 12, lineHeight: '18px', color: C.text } }, textOf(resolve(props.text)))
        }
        if (item.type === 'divider') {
          const label = resolve(props.label)
          if (!label) return h('hr', { key, 'data-iui-divider': '1', style: { border: 'none', borderTop: `1px solid ${C.border}`, width: '100%' } })
          return h(
            'div',
            { key, 'data-iui-divider': '1', style: { display: 'flex', alignItems: 'center', gap: 8, width: '100%' } },
            h('span', { style: { fontSize: 11, color: C.muted, whiteSpace: 'nowrap' } }, textOf(label)),
            h('span', { style: { flex: '1 1 auto', borderTop: `1px solid ${C.border}` } }),
          )
        }
        if (item.type === 'metric') {
          const tone = TONE_COLORS[props.tone] ?? [null, C.muted]
          const label = resolve(props.label)
          const value = resolve(props.value)
          const unit = resolve(props.unit)
          const delta = resolve(props.delta)
          const described = resolve(props.caption ?? props.note)
          return h(
            'div',
            { key, 'data-iui-metric': textOf(label), style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 0' } },
            h('div', { style: { fontSize: 11, color: C.muted } }, textOf(label)),
            h('div', { style: { fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: props.tone ? tone[1] : C.text } }, `${value === undefined || value === null ? '—' : String(value)}${textOf(unit)}`),
            delta !== undefined && delta !== null && String(delta) !== ''
              ? h('div', { 'data-iui-delta': String(delta), style: { fontSize: 11, color: String(delta).startsWith('-') ? '#d1242f' : '#2ea043' } }, String(delta))
              : null,
            textOf(described) === '' ? null : h('div', { style: { fontSize: 10, color: C.muted } }, textOf(described)),
          )
        }
        if (item.type === 'segmented') {
          const label = resolve(props.label)
          const binding = IUI_AST.readBinding(props.bind)
          const current = binding.scope === 'state' ? readStatePath(scopedState, binding.key) : undefined
          const options = Array.isArray(props.options) ? props.options : []
          const selectedIndex = options.findIndex((option) => sameValue(option?.value, current))
          return h(
            'div',
            { key, role: 'group', 'aria-label': label ? textOf(label) : undefined, style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
            label ? h('span', { style: { fontSize: 11, color: C.muted } }, textOf(label)) : null,
            ...options.map((option, index) =>
              h(
                'button',
                {
                  key: `${key}-${index}`,
                  className: 'miopiik-ctl',
                  type: 'button',
                  'aria-pressed': index === selectedIndex,
                  onClick: () => {
                    if (binding.scope !== 'state') return
                    setState((prev) => writeStatePath(prev, binding.key, option.value))
                  },
                  style: {
                    border: `1px solid ${index === selectedIndex ? C.brand : C.border}`,
                    background: index === selectedIndex ? C.brand : 'transparent',
                    color: index === selectedIndex ? '#fff' : C.muted,
                    borderRadius: 999,
                    padding: '2px 10px',
                    fontSize: 11,
                    cursor: 'pointer',
                    transition: 'background-color .12s ease, border-color .12s ease, color .12s ease',
                  },
                },
                String(option.label ?? ''),
              ),
            ),
          )
        }
        if (item.type === 'toggle') {
          const label = resolve(props.label)
          const binding = IUI_AST.readBinding(props.bind)
          const current = binding.scope === 'state' ? readStatePath(scopedState, binding.key) : undefined
          const on = current === true || current === 'true'
          const ariaLabel = label ? textOf(label) : String(props.bind ?? '')
          return h(
            'div',
            { key, 'data-iui-toggle': on ? 'on' : 'off', style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
            label ? h('span', { style: { fontSize: 11, color: C.muted } }, textOf(label)) : null,
            h(
              'button',
              {
                key: `${key}-ctl`,
                className: 'miopiik-ctl',
                type: 'button',
                role: 'switch',
                'aria-checked': on,
                'aria-label': ariaLabel,
                onClick: () => {
                  if (binding.scope !== 'state') return
                  setState((prev) => writeStatePath(prev, binding.key, !on))
                },
                style: {
                  boxSizing: 'border-box',
                  position: 'relative',
                  flex: 'none',
                  width: 28,
                  height: 16,
                  padding: 2,
                  border: 0,
                  borderRadius: 999,
                  background: on ? C.brand : 'rgba(127,127,127,0.35)',
                  cursor: 'pointer',
                  transition: 'background-color .12s ease',
                },
              },
              h('span', {
                'aria-hidden': true,
                style: { display: 'block', width: 12, height: 12, borderRadius: '50%', background: on ? '#fff' : C.text, transform: on ? 'translateX(12px)' : 'translateX(0)', transition: 'transform .12s ease' },
              }),
            ),
          )
        }
        if (item.type === 'slider') {
          const label = resolve(props.label)
          const unit = resolve(props.unit)
          const binding = IUI_AST.readBinding(props.bind)
          const min = typeof props.min === 'number' && Number.isFinite(props.min) ? props.min : 0
          const max = typeof props.max === 'number' && Number.isFinite(props.max) && props.max > min ? props.max : Math.max(100, min + 1)
          const stepSize = typeof props.step === 'number' && Number.isFinite(props.step) && props.step > 0 ? props.step : 1
          const current = binding.scope === 'state' ? readStatePath(scopedState, binding.key) : undefined
          const raw = Number(current)
          const value = Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : min
          const ariaLabel = label ? textOf(label) : String(props.bind ?? '')
          return h(
            'div',
            { key, 'data-iui-slider': String(value), style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
            label ? h('span', { style: { fontSize: 11, color: C.muted } }, textOf(label)) : null,
            h('input', {
              key: `${key}-ctl`,
              type: 'range',
              min,
              max,
              step: stepSize,
              value,
              'aria-label': ariaLabel,
              onChange: (event) => {
                if (binding.scope !== 'state') return
                const next = Number(event.target.value)
                if (Number.isFinite(next)) setState((prev) => writeStatePath(prev, binding.key, next))
              },
              style: { flex: '1 1 120px', minWidth: 120, accentColor: C.brand },
            }),
            h('span', { style: { fontSize: 11, fontVariantNumeric: 'tabular-nums', color: C.text } }, `${value}${textOf(unit)}`),
          )
        }
        if (item.type === 'input') {
          const label = resolve(props.label)
          const binding = IUI_AST.readBinding(props.bind)
          const current = binding.scope === 'state' ? readStatePath(scopedState, binding.key) : undefined
          const ariaLabel = label ? textOf(label) : String(props.bind ?? '')
          return h(
            'div',
            { key, 'data-iui-input': '1', style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
            label ? h('span', { style: { fontSize: 11, color: C.muted } }, textOf(label)) : null,
            h('input', {
              key: `${key}-ctl`,
              type: 'text',
              value: current === undefined || current === null ? '' : String(current),
              maxLength: IUI_AST.LIMITS.text,
              placeholder: String(props.placeholder ?? ''),
              'aria-label': ariaLabel,
              onChange: (event) => {
                if (binding.scope !== 'state') return
                setState((prev) => writeStatePath(prev, binding.key, event.target.value))
              },
              style: { flex: '1 1 140px', minWidth: 140, border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', padding: '3px 8px', fontSize: 12, color: C.text, lineHeight: '18px' },
            }),
          )
        }
        if (item.type === 'steps') {
          return h(
            'div',
            { key, className: 'miopiik-enter', 'data-iui-steps': String(item.children.length), style: { display: 'flex', flexDirection: 'column', minWidth: 0 } },
            ...item.children.map((child, index) => {
              const cp = child.props ?? {}
              const title = resolve(cp.title)
              const note = resolve(cp.note)
              const toneColor = (TONE_COLORS[cp.tone] ?? [null, C.text])[1]
              const glyph = { success: '✓', warning: '!', danger: '✕' }[cp.tone] ?? String(index + 1)
              const last = index === item.children.length - 1
              return h(
                'div',
                { key: `${key}-${index}`, style: { display: 'flex', gap: 10 } },
                h(
                  'div',
                  { key: 'rail', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' } },
                  h('span', { key: 'dot', style: { boxSizing: 'border-box', width: 18, height: 18, borderRadius: 999, border: `1px solid ${cp.tone ? toneColor : C.border}`, color: cp.tone ? toneColor : C.muted, fontSize: 10, lineHeight: '16px', textAlign: 'center', flex: 'none' } }, glyph),
                  last ? null : h('span', { key: 'line', style: { width: 1, flex: '1 1 auto', minHeight: 8, background: C.border, marginTop: 2 } }),
                ),
                h(
                  'div',
                  { key: 'body', style: { paddingBottom: last ? 0 : 10, minWidth: 0 } },
                  h('div', { key: 'title', style: { fontSize: 12, fontWeight: 600, color: C.text, lineHeight: '18px' } }, textOf(title)),
                  textOf(note) === '' ? null : h('div', { key: 'note', style: { fontSize: 11, color: C.muted, lineHeight: '17px', marginTop: 1 } }, textOf(note)),
                ),
              )
            }),
          )
        }
        if (item.type === 'paragraph') {
          const TONE = {
            neutral: { bg: 'rgba(127,127,127,0.14)', fg: C.text },
            success: { bg: 'rgba(46,160,67,0.16)', fg: '#2ea043' },
            warning: { bg: 'rgba(210,153,34,0.18)', fg: '#b08800' },
            danger: { bg: 'rgba(218,54,51,0.16)', fg: '#d1242f' },
            info: { bg: 'rgba(65,118,230,0.16)', fg: C.brand },
            accent: { bg: 'rgba(65,118,230,0.16)', fg: C.brand },
          }
          const ICON_GLYPH = { check: '✓', alert: '!', dot: '•', 'arrow-right': '→', spark: '✳', chart: '▤', layers: '▦', shield: '⛨', clock: '◷', inbox: '▣', info: 'ℹ' }
          const inline = (child, index) => {
            const key2 = `${key}-${index}`
            if (!isItemVisible(child, resolve)) return null
            if (child.type === 'text') return h('span', { key: key2 }, textOf(resolve(child.props.text)))
            if (child.type === 'badge') {
              const tone = TONE[child.props.tone] ?? TONE.neutral
              return h('span', { key: key2, 'data-iui-badge': String(child.props.tone ?? 'neutral'), style: { display: 'inline-block', padding: '0 6px', margin: '0 2px', borderRadius: 999, fontSize: 11, lineHeight: '18px', background: tone.bg, color: tone.fg } }, textOf(resolve(child.props.text)))
            }
            if (child.type === 'emphasis') return h(child.props.strong === false ? 'em' : 'strong', { key: key2 }, textOf(resolve(child.props.text)))
            if (child.type === 'code') return h('code', { key: key2, style: { fontFamily: 'ui-monospace, monospace', fontSize: 12, background: 'rgba(127,127,127,0.14)', borderRadius: 4, padding: '0 4px' } }, textOf(resolve(child.props.text)))
            // href 不参与绑定解析：链接目标保持静态白名单，避免状态数据变成任意跳转目标。
            if (child.type === 'link') return h('a', { key: key2, href: String(child.props.href ?? ''), target: '_blank', rel: 'noreferrer noopener', style: { color: C.brand, textDecoration: 'underline' } }, textOf(resolve(child.props.text)))
            if (child.type === 'icon') return h('span', { key: key2, 'data-iui-icon': String(child.props.name ?? ''), role: 'img', 'aria-label': textOf(resolve(child.props.label ?? child.props.name)), style: { margin: '0 2px' } }, ICON_GLYPH[child.props.name] ?? '•')
            return h('span', { key: key2 }, '')
          }
          return h(
            'div',
            { key, 'data-iui-inline': String(item.children.length), style: { display: 'block', fontSize: 13, lineHeight: '22px', color: C.text, overflowWrap: 'break-word' } },
            ...item.children.map(inline),
          )
        }
        if (item.type === 'badge') {
          const tone = TONE_COLORS[props.tone] ?? TONE_COLORS.neutral
          return h('span', { key, 'data-iui-badge': String(props.tone ?? 'neutral'), style: { display: 'inline-block', padding: '0 6px', borderRadius: 999, fontSize: 11, background: tone[0], color: tone[1] } }, textOf(resolve(props.text)))
        }
        if (item.type === 'diagram') return h(IuiDiagram, { key, item, resolve })
        if (item.type === 'callout') {
          const tone = String(props.tone ?? 'neutral')
          const color = (TONE_COLORS[tone] ?? TONE_COLORS.neutral)[1]
          const title = resolve(props.title)
          const text = resolve(props.text)
          const kids = item.children.map((child, index) => node(child, `${key}-${index}`))
          return h(
            'div',
            { key, 'data-iui-callout': tone, style: { display: 'flex', flexDirection: 'column', gap: 6, borderLeft: `3px solid ${color}`, background: 'rgba(127,127,127,0.07)', borderRadius: 6, padding: '8px 10px' } },
            title ? h('div', { style: { fontSize: 12, fontWeight: 600, color } }, textOf(title)) : null,
            textOf(text) === '' ? null : h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.text } }, textOf(text)),
            ...kids,
          )
        }
        if (item.type === 'progress') {
          const label = resolve(props.label)
          const shown = resolve(props.value)
          const numeric = Number(shown)
          const max = Number(props.max ?? 1)
          const ratio = Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric / (max === 0 ? 1 : max))) : 0
          return h(
            'div',
            { key, style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            label ? h('div', { style: { fontSize: 11, color: C.muted } }, textOf(label)) : null,
            h('div', { role: 'progressbar', 'aria-valuenow': String(Math.round(ratio * 100)), 'aria-valuemin': '0', 'aria-valuemax': '100', style: { height: 6, borderRadius: 999, background: 'rgba(127,127,127,0.18)', overflow: 'hidden' } },
              h('div', { style: { width: `${ratio * 100}%`, height: '100%', background: (TONE_COLORS[props.tone] ?? [null, C.brand])[1], transition: 'width .18s ease' } })),
          )
        }
        if (item.type === 'empty') {
          const glyph = { check: '✓', alert: '!', dot: '•', 'arrow-right': '→', spark: '✳', chart: '▤', layers: '▦', shield: '⛨', clock: '◷', inbox: '▣', info: 'ℹ' }
          const title = resolve(props.title)
          const description = resolve(props.description ?? props.text)
          return h(
            'div',
            { key, 'data-iui-empty': '1', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center', padding: '14px 0', color: C.muted } },
            props.icon ? h('div', { style: { fontSize: 18, lineHeight: '22px' } }, glyph[props.icon] ?? '•') : null,
            title ? h('div', { style: { fontSize: 12, fontWeight: 600, color: C.text } }, textOf(title)) : null,
            textOf(description) === '' ? null : h('div', { style: { fontSize: 11, lineHeight: '17px', maxWidth: 320 } }, textOf(description)),
          )
        }
        if (item.type === 'card') {
          const title = resolve(props.title)
          const subtitle = resolve(props.subtitle)
          const kids = item.children.map((child, index) => node(child, `${key}-${index}`))
          const span = Number(props.span ?? 1)
          return h(
            'div',
            {
              key,
              'data-iui-container': 'card',
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: Number(props.gap ?? 8),
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: 12,
                minWidth: 0,
                gridColumn: Number.isFinite(span) && span > 1 ? `span ${Math.min(3, span)}` : undefined,
              },
            },
            title ? h('div', { style: { fontSize: 12, fontWeight: 600, color: C.text } }, textOf(title)) : null,
            subtitle ? h('div', { style: { fontSize: 10, color: C.muted } }, textOf(subtitle)) : null,
            ...kids,
          )
        }
        if (item.type === 'grid') {
          return h(
            'div',
            {
              key,
              'data-iui-container': 'grid',
              style: {
                display: 'grid',
                // columns 2-6 落实为固定列；columns 缺省或 <=1 时保持自适应单列流
                gridTemplateColumns: props.columns && Number(props.columns) > 1
                  ? `repeat(${Math.round(Number(props.columns))}, minmax(0, 1fr))`
                  : 'repeat(auto-fit, minmax(160px, 1fr))',
                alignItems: props.align === 'stretch' ? 'stretch' : undefined,
                gap: Number(props.gap ?? 10),
              },
            },
            ...item.children.map((child, index) => node(child, `${key}-${index}`)),
          )
        }
        if (item.type === 'table') {
          // columns/rows/caption 都允许绑定：先 resolve，再**重新执行**静态校验器同款预算。
          // 绑定值来自派生状态，不能因为绕过 validateAst 的静态检查就放宽 12 列 / 200 行 / 体积预算。
          const resolvedColumns = resolve(props.columns)
          const resolvedRows = resolve(props.rows)
          const columnsValid = Array.isArray(resolvedColumns)
            && resolvedColumns.length >= 1
            && resolvedColumns.length <= 12
            && resolvedColumns.every((column) => typeof column === 'string'
              || (isRecordValue(column) && typeof column.label === 'string' && (column.key === undefined
                || (typeof column.key === 'string' && !RESERVED_STATE_KEYS.has(column.key) && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u.test(column.key)))))
          const rowsValid = Array.isArray(resolvedRows)
            && resolvedRows.length <= 200
            && resolvedRows.every((row) => Array.isArray(row) || isRecordValue(row))
          let withinBudget = false
          if (columnsValid && rowsValid) {
            try {
              withinBudget = JSON.stringify({ columns: resolvedColumns, rows: resolvedRows }).length <= IUI_AST.LIMITS.stateBytes
            } catch {
              withinBudget = false
            }
          }
          if (!columnsValid || !rowsValid || !withinBudget) {
            return h('div', { key, 'data-iui-table-invalid': '1', role: 'status', style: { fontSize: 12, color: C.muted, padding: '10px 0' } }, '表格数据超出预算或格式不合法')
          }
          const normalized = IUI_AST.tableMatrix({ columns: resolvedColumns, rows: resolvedRows })
          const columns = normalized.columns
          // 单元格若被绑定成对象/数组，String() 会渲染成 [object Object]：降级为 '—'（不猜测结构）
          const cellText = (cell) => (cell === null || cell === undefined ? '' : typeof cell === 'object' ? '—' : String(cell))
          if (columns.length === 0) {
            return h('div', { key, 'data-iui-table-empty': '1', role: 'status', style: { fontSize: 12, color: C.muted, padding: '10px 0' } }, '暂无有效表格数据')
          }
          // filter：本地文本过滤（大小写不敏感、全字段匹配）。只读绑定值，不过滤即全量。
          const filterValue = resolve(props.filter)
          const query = filterValue === undefined || filterValue === null ? '' : String(filterValue).trim().toLowerCase()
          const allRows = normalized.rows
          const filtered = query === '' ? allRows : allRows.filter((row) => row.some((cell) => String(cell ?? '').toLowerCase().includes(query)))
          const rows = filtered.length === 0 && query !== '' ? [columns.map((_, cellIndex) => (cellIndex === 0 ? '无匹配项' : ''))] : filtered
          const captionValue = resolve(props.caption)
          const captionText = [
            captionValue ? String(captionValue) : '',
            query !== '' ? `已过滤 ${filtered.length}/${allRows.length} 行` : '',
          ].filter((part) => part !== '').join(' · ')
          return h(
            'div',
            { key, className: 'miopiik-enter', 'data-iui-table': String(filtered.length), 'data-iui-table-filtered': query === '' ? undefined : '1', 'data-iui-table-cols': String(columns.length), style: { overflowX: 'auto', maxWidth: '100%' } },
            h(
              'table',
              { 'aria-label': captionText === '' ? `数据表，${rows.length} 行 ${columns.length} 列` : captionText, style: { width: '100%', borderCollapse: 'collapse', fontSize: 12, color: C.text } },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  ...columns.map((column, index) =>
                    h('th', { key: `h${index}`, scope: 'col', style: { textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.border}`, color: C.muted, fontWeight: 500 } }, String(column)),
                  ),
                ),
              ),
              h(
                'tbody',
                null,
                ...rows.map((row, rowIndex) =>
                  h(
                    'tr',
                    { key: `r${rowIndex}` },
                    ...columns.map((_, cellIndex) =>
                      h('td', { key: `c${cellIndex}`, style: { padding: '6px 8px', borderBottom: `1px solid ${C.border}` } }, cellText(Array.isArray(row) ? row[cellIndex] : '')),
                    ),
                  ),
                ),
              ),
            ),
            query === ''
              ? (captionText !== '' ? h('div', { style: { fontSize: 10, color: C.muted, paddingTop: 4 } }, captionText) : null)
              // 过滤结果用 live region 播报，读屏用户能听到行数变化
              : h('div', { role: 'status', 'aria-live': 'polite', style: { fontSize: 10, color: C.muted, paddingTop: 4 } }, captionText),
          )
        }
        if (item.type === 'row' || item.type === 'column') {
          const isRow = item.type === 'row'
          return h(
            'div',
            {
              key,
              'data-iui-container': item.type,
              style: { display: isRow ? 'grid' : 'flex', gridTemplateColumns: isRow ? `repeat(${Math.max(1, item.children.length)}, minmax(0, 1fr))` : undefined, flexDirection: isRow ? undefined : 'column', gap: Number(props.gap ?? 10) },
            },
            ...item.children.map((child, index) => node(child, `${key}-${index}`)),
          )
        }
        if (item.type === 'chart') {
          const series = resolve(props.series)
          const rows = IUI_AST.chartMatrix(series)
          const kind = String(props.kind ?? 'bar')
          const source = resolve(props.source)
          return h(
            'div',
            { key, className: 'miopiik-enter', 'data-iui-chart': kind, style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            rows === null
              ? h('div', { 'data-iui-chart-empty': '1', role: 'status', style: { fontSize: 12, color: C.muted, padding: '18px 0' } }, '暂无有效图表数据')
              : renderChart([{ label: '项' }, { label: '值' }], rows, kind === 'line' || kind === 'donut' ? kind : 'bar', chartSummary(rows, kind === 'line' || kind === 'donut' ? kind : 'bar')),
            textOf(source) === '' ? null : h('div', { style: { fontSize: 10, color: C.muted } }, `来源：${textOf(source)}`),
          )
        }
        if (item.type === 'details') return h(IuiDetails, { key, item, render: node, resolve })
        if (item.type === 'button') return h(IuiCopyAction, { key, item, resolve })
        return null
      }
      return h(
        'div',
        // 流式分片期间不挂入场动画：逐分片重挂载会让淡入闪成频闪
        { className: streaming === true ? undefined : 'miopiik-enter', 'data-iui-output': 'ok', 'data-iui-format': format ?? 'json', 'data-iui-degraded': String(degradedCount), 'data-iui-streaming': streaming === true ? '1' : undefined, style: { display: 'flex', flexDirection: 'column', gap: 10, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 } },
        ast.title ? h('div', { style: { fontSize: 13, fontWeight: 600 } }, ast.title) : null,
        node(ast.root, 'root'),
      )
    }

    /** details 折叠容器：展开状态是组件本地 React state——IuiSheet 重渲染（切场景/改滑杆）不会重置。 */
    function IuiDetails({ item, render, resolve }) {
      const [open, setOpen] = React.useState(false)
      const props = item.props ?? {}
      const rawLabel = resolve === undefined ? props.label : resolve(props.label)
      const label = rawLabel === undefined || rawLabel === null || String(rawLabel) === '' ? '详情' : String(rawLabel)
      const bodyId = 'iui-details-' + String(item.id ?? 'root').replace(/[^A-Za-z0-9_-]/gu, '')
      const children = Array.isArray(item.children) ? item.children : []
      return h(
        'div',
        { 'data-iui-details': open ? 'open' : 'closed', style: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 } },
        h('button', {
          type: 'button',
          className: 'miopiik-ctl',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': bodyId,
          onClick: () => setOpen((value) => !value),
          style: { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', color: C.text, padding: '3px 9px', fontSize: 12, lineHeight: '18px', cursor: 'pointer' },
        }, `${open ? '▾' : '▸'} ${label}`),
        open
          ? h('div', { id: bodyId, 'data-iui-details-body': '1', style: { display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 2, minWidth: 0 } }, ...children.map((child, index) => render(child, `${item.id ?? 'details'}-${index}`)))
          : null,
      )
    }

    /** button：唯一宿主授权动作 copy（仅用户点击后写剪贴板）；状态本地，role=status 播报。 */
    function IuiCopyAction({ item, resolve }) {
      const [status, setStatus] = React.useState('idle')
      const props = item.props ?? {}
      const action = props.action
      const rawLabel = resolve === undefined ? props.label : resolve(props.label)
      const label = rawLabel === undefined || rawLabel === null || String(rawLabel) === '' ? '复制' : String(rawLabel)
      const done = resolve === undefined ? props.done : resolve(props.done)
      const unsupported = resolve === undefined ? props.unsupported : resolve(props.unsupported)
      const statusText = status === 'ok'
        ? (done === undefined || done === null || String(done) === '' ? '已复制' : String(done))
        : status === 'unsupported'
          ? (unsupported === undefined || unsupported === null || String(unsupported) === '' ? '当前不支持此动作' : String(unsupported))
          : ''
      const copy = () => {
        // 只实现 copy：任何其他 action 一律按不支持处理（AST 校验器已先拒绝）。
        if (action !== 'copy') {
          setStatus('unsupported')
          return
        }
        let payload
        try {
          const value = resolve(props.value)
          payload = typeof value === 'string' ? value : JSON.stringify(value)
          if (typeof payload !== 'string') throw new Error('无法序列化为字符串')
          // 契约预算对绑定载荷同样生效：超限直接按不支持处理，不写剪贴板（done 只是 UI 文案，不拼 payload）
          if (payload.length > IUI_AST.LIMITS.stateBytes) throw new Error('复制载荷超出预算')
        } catch {
          setStatus('unsupported')
          return
        }
        let clipboard = null
        try {
          clipboard = typeof navigator === 'undefined' ? null : navigator.clipboard
        } catch {
          clipboard = null
        }
        if (clipboard === null || clipboard === undefined || typeof clipboard.writeText !== 'function') {
          setStatus('unsupported')
          return
        }
        try {
          Promise.resolve(clipboard.writeText(payload)).then(() => setStatus('ok'), () => setStatus('unsupported'))
        } catch {
          setStatus('unsupported')
        }
      }
      const marked = status === 'ok' || status === 'unsupported' ? status : undefined
      return h(
        'div',
        { 'data-iui-action-wrap': '1', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 } },
        h('button', {
          type: 'button',
          className: 'miopiik-ctl',
          'data-iui-action': 'copy',
          onClick: copy,
          style: { border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', color: C.text, padding: '3px 10px', fontSize: 12, lineHeight: '18px', cursor: 'pointer' },
        }, label),
        h('span', {
          role: 'status',
          'aria-live': 'polite',
          'data-iui-action-status': marked,
          style: { fontSize: 11, lineHeight: '16px', minHeight: 16, color: status === 'unsupported' ? C.muted : TONE_COLORS.success[1] },
        }, statusText),
      )
    }
    function readStatePath(source, path) {
      let cursor = source
      for (const part of String(path).split('.')) {
        if (cursor === null || typeof cursor !== 'object') return undefined
        cursor = cursor[part]
      }
      return cursor
    }
    function writeStatePath(source, path, value) {
      const parts = String(path).split('.')
      const clone = Array.isArray(source) ? [...source] : { ...source }
      let cursor = clone
      for (let index = 0; index < parts.length - 1; index += 1) {
        const part = parts[index]
        const child = cursor[part]
        cursor[part] = child !== null && typeof child === 'object' ? (Array.isArray(child) ? [...child] : { ...child }) : {}
        cursor = cursor[part]
      }
      cursor[parts[parts.length - 1]] = value
      return clone
    }
    function sameValue(a, b) {
      if (a === b) return true
      try {
        return JSON.stringify(a) === JSON.stringify(b)
      } catch {
        return false
      }
    }

    const TONE_COLORS = {
      neutral: ['rgba(127,127,127,0.14)', C.text],
      info: ['rgba(65,118,230,0.16)', C.brand],
      accent: ['rgba(65,118,230,0.16)', C.brand],
      success: ['rgba(46,160,67,0.16)', '#2ea043'],
      warning: ['rgba(210,153,34,0.18)', '#b08800'],
      danger: ['rgba(218,54,51,0.16)', '#d1242f'],
    }

    const HTML_FRAME_MIN = 120
    const HTML_FRAME_MAX = 1600

    /** 沙箱文档帧：高度按内容自动收紧（rc.14）。sandbox 只加 allow-same-origin、绝不加 allow-scripts——
     *  文档里的 JS 仍然一行都不执行，父页面仅获得「读尺寸」的能力。 */
    function IuiHtmlFrame(props) {
      const frameRef = React.useRef(null)
      const [frameHeight, setFrameHeight] = React.useState(props.initial)
      const measure = React.useCallback((event) => {
        // onLoad 事件里拿 currentTarget（ref 在某些宿主渲染器里不可用），挂载期用 ref。
        const frame = (event !== null && event !== undefined && event.currentTarget) || frameRef.current
        if (frame === null || frame === undefined) return
        try {
          const inner = frame.contentDocument
          if (inner === null || inner === undefined) return
          const root = inner.documentElement
          const body = inner.body
          // 直接把 scrollHeight 当内容高度是错的：内容不足时 html 会被视口撑满，
          // scrollHeight 就等于当前帧高（实测高提示 900 时永远收不回来）。
          // 先把帧临时压到 0 让内容自然定型，量完立刻还原——同一帧内完成，不产生可见闪烁。
          const previous = frame.style.height
          frame.style.height = '0px'
          const next = Math.max(
            root === null ? 0 : root.scrollHeight,
            body === null ? 0 : body.scrollHeight,
            body === null ? 0 : body.getBoundingClientRect?.().height ?? 0,
          )
          frame.style.height = previous
          if (next > 0) {
            const applied = Math.min(HTML_FRAME_MAX, Math.max(HTML_FRAME_MIN, Math.ceil(next)))
            // 同时写 DOM 与 state：DOM 立即生效（不依赖一次重渲染），state 保证后续重渲染不被初始值覆盖。
            frame.style.height = applied + 'px'
            setFrameHeight(applied)
          }
        } catch {
          // 读不到尺寸（跨源/未就绪）：保持初始高度，不影响文档本身
        }
      }, [])
      React.useEffect(() => {
        measure()
        if (typeof setTimeout !== 'function') return undefined
        // 字体与 data: 图片可能在 load 之后才定高，补两次
        const timers = [setTimeout(measure, 120), setTimeout(measure, 600)]
        return () => {
          for (const timer of timers) clearTimeout(timer)
        }
      }, [measure])
      return h('iframe', {
        ref: frameRef,
        'data-miopiik-html-doc': '1',
        sandbox: 'allow-same-origin',
        srcdoc: props.doc,
        title: props.title,
        loading: 'lazy',
        onLoad: measure,
        style: { ...props.frameStyle, height: frameHeight },
      })
    }

    /** ```html 沙箱文档（F-42）：完整静态 HTML 经 iframe 渲染——JS 一行不执行（浏览器引擎级强制），
     *  CSP 强制零网络；脚本块双保险剔除；高度自动按内容收紧（<!-- height: 480 --> 仅作首次绘制高度）；
     *  超出 256KB 预算降级为提示文本。
     *  风格统一：渲染时从宿主采样设计令牌，注入 mi-* 预设样式（文档自有 <style> 在后，永远能覆盖预设）。 */
    function renderHtmlBlock(raw) {
      if (typeof raw !== 'string' || raw.trim() === '') return null
      if (raw.length > 262144) {
        return h('div', { 'data-miopiik-html-fallback': 'oversize', style: { fontSize: 12, color: C.muted } }, '（HTML 文档超出 256KB 预算，未渲染）')
      }
      const hint = /<!--\s*height:\s*([0-9]{2,4})\s*-->/.exec(raw.slice(0, 600))
      const initial = Math.min(HTML_FRAME_MAX, Math.max(HTML_FRAME_MIN, hint === null ? 320 : Number(hint[1])))
      const stripped = raw.replace(/<script[\s\S]*?<\/script\s*>/giu, '')
      const titleMatch = /<title>([\s\S]{0,120}?)<\/title>/iu.exec(stripped)
      const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">'
      const theme = FRAME_THEME.readHostTheme(typeof document === 'undefined' ? null : document)
      const injection = csp + FRAME_THEME.framePresetStyle(theme)
      const doc = /<head[^>]*>/iu.test(stripped)
        ? stripped.replace(/<head([^>]*)>/iu, (match) => match + injection)
        : /<html[^>]*>/iu.test(stripped)
          ? stripped.replace(/<html([^>]*)>/iu, (match) => match + '<head>' + injection + '</head>')
          : injection + stripped
      // srcdoc 是「属性值 → 文档」的二次解析：再转义一次会让 &lt; 变成字面量、
      // 并把 class="x" 洗成未加引号的 class=&quot;x&quot;（类名带引号 → 所有 class 选择器静默失效）。
      // 直接交给 srcdoc（setAttribute 不做实体解码），文档里的实体与引号原样生效。
      return h(IuiHtmlFrame, {
        doc,
        title: titleMatch === null ? '内嵌 HTML 文档（无脚本沙箱）' : String(titleMatch[1]).trim(),
        initial,
        frameStyle: { width: '100%', border: `1px solid ${theme.border}`, borderRadius: theme.rlg, background: 'transparent', display: 'block', minWidth: 0, maxWidth: '100%' },
      })
    }

    /** 嫁接专用的纯 DOM 工厂：与 renderInlinePrimitive 同视觉，但产出 document 节点（ graft 后插入原生 Markdown 的 DOM）。 */
    function renderInlineDom(kind, payload) {
      if (typeof document === 'undefined' || document === null || typeof document.createElement !== 'function') return null
      if (kind === 'icon') {
        const name = String(payload ?? '').trim()
        const span = document.createElement('span')
        span.setAttribute('data-iui-icon', name)
        span.setAttribute('role', 'img')
        span.setAttribute('aria-label', name)
        span.style.margin = '0 2px'
        span.textContent = { check: '✓', alert: '!', dot: '•', 'arrow-right': '→', spark: '✳', chart: '▤', layers: '▦', shield: '⛨', clock: '◷', inbox: '▣', info: 'ℹ' }[name] ?? '•'
        return span
      }
      if (kind === 'code') {
        const code = document.createElement('code')
        code.style.fontFamily = 'ui-monospace, monospace'
        code.style.fontSize = '12px'
        code.style.background = 'rgba(127,127,127,0.14)'
        code.style.borderRadius = '4px'
        code.style.padding = '0 4px'
        code.textContent = String(payload ?? '')
        return code
      }
      // badge: tone:文本；tone 省略时按 neutral（与 readInline 同语义）
      const raw = String(payload ?? '').trim()
      const match = /^(neutral|success|warning|danger):([\s\S]+)$/u.exec(raw)
      const tone = match === null ? 'neutral' : match[1]
      const label = match === null ? raw : match[2].trim()
      const colors = TONE_COLORS[tone] ?? TONE_COLORS.neutral
      const badge = document.createElement('span')
      badge.setAttribute('data-iui-badge', tone)
      badge.style.display = 'inline-block'
      badge.style.padding = '0 6px'
      badge.style.borderRadius = '999px'
      badge.style.fontSize = '11px'
      badge.style.lineHeight = '18px'
      badge.style.background = colors[0]
      badge.style.color = colors[1]
      badge.textContent = label
      return badge
    }

    function renderInlinePrimitive(node) {
      const props = node?.props ?? {}
      if (node?.type === 'text') return h('span', null, String(props.text ?? ''))
      if (node?.type === 'badge') {
        const tone = TONE_COLORS[props.tone] ?? TONE_COLORS.neutral
        return h('span', { 'data-iui-badge': String(props.tone ?? 'neutral'), style: { display: 'inline-block', padding: '0 6px', borderRadius: 999, fontSize: 11, lineHeight: '18px', background: tone[0], color: tone[1] } }, String(props.text ?? ''))
      }
      if (node?.type === 'icon') return h('span', { 'data-iui-icon': String(props.name ?? ''), role: 'img', 'aria-label': String(props.label ?? props.name ?? '') }, { check: '✓', alert: '!', dot: '•', 'arrow-right': '→', spark: '✳', chart: '▤', layers: '▦', shield: '⛨', clock: '◷', inbox: '▣', info: 'ℹ' }[props.name] ?? '•')
      if (node?.type === 'code') return h('code', { style: { fontFamily: 'ui-monospace, monospace', fontSize: 12, background: 'rgba(127,127,127,0.14)', borderRadius: 4, padding: '0 4px' } }, String(props.text ?? ''))
      if (node?.type === 'link') return h('a', { href: String(props.href ?? ''), target: '_blank', rel: 'noreferrer noopener', style: { color: C.brand, textDecoration: 'underline' } }, String(props.text ?? ''))
      if (node?.type === 'emphasis') return h(props.strong === false ? 'em' : 'strong', null, String(props.text ?? ''))
      return h('span', null, '')
    }

    function readIuiFence(raw) {
      const text = String(raw ?? '').trim()
      if (text === '') return { ok: false, errors: ['空内容'], format: 'ml' }
      if (text.startsWith('{')) {
        let parsed = null
        try {
          parsed = JSON.parse(text)
        } catch {
          return { ok: false, errors: ['不是合法 JSON'], format: 'json' }
        }
        if (parsed === null || typeof parsed !== 'object') return { ok: false, errors: ['AST 必须是对象'], format: 'json' }
        // 历史消息：旧 ink-view 的七 Widget spec（{widget,...}）只读映射到新 AST
        if (typeof parsed.widget === 'string' && parsed.root === undefined) {
          const adopted = LEGACY_WIDGETS.adoptLegacySpec(parsed)
          if (!adopted.ok) return { ok: false, errors: adopted.errors, format: 'legacy', degraded: [], fallback: adopted.fallback }
          return { ok: true, doc: adopted.doc, format: 'legacy', degraded: [] }
        }
        return { ok: true, doc: parsed, format: 'json', degraded: [] }
      }
      const parsed = MIOPIIK_ML.parseMiopiikMl(text)
      return parsed.ok
        ? { ok: true, doc: parsed.doc, format: 'ml', degraded: parsed.degraded }
        : { ok: false, errors: parsed.errors, format: 'ml', degraded: parsed.degraded }
    }
