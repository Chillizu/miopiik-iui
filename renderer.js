/**
 * Standalone IUI renderer extracted from the verified MiOpIIk RC.
 * Scope: React h/React, IUI_AST, MIOPIIK_ML, C, SANS. No legacy Widget/Ink deps.
 * This source is bundled verbatim into client.js by tools/build.mjs.
 */
    function svgCanvas(width, height, children, label, { drawing = false, describedBy, fluid = false, x = 0, y = 0 } = {}) {
      return h(
        'svg',
        {
          viewBox: `${x} ${y} ${width} ${height}`,
          width,
          height,
          preserveAspectRatio: 'xMidYMid meet',
          role: 'img',
          'aria-label': label === undefined || label === '' ? undefined : label,
          'aria-describedby': describedBy,
          'data-iui-drawing': drawing ? '1' : undefined,
          style: { display: 'block', width: fluid ? '100%' : undefined, maxWidth: '100%', height: 'auto', margin: '0 auto', overflow: drawing ? 'hidden' : 'visible' },
        },
        ...children,
      )
    }

    const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

    const DRAWING_COLORS = {
      text: C.text,
      muted: C.muted,
      border: C.border,
      surface: 'var(--dsw-alias-bg-layer-1, transparent)',
      accent: C.brand,
      neutral: C.idle,
      success: C.success,
      warning: C.warn,
      danger: C.error,
      info: C.brand,
      none: 'none',
    }
    const DRAWING_TAGS = { rect: 'rect', circle: 'circle', line: 'line', path: 'path', label: 'text' }

    // A checked drawing survives local interactions. Keep its fixed SVG attributes without retaining old drawings.
    const drawingShapePlans = new WeakMap()

    function getDrawingShapePlan(child) {
      const cached = drawingShapePlans.get(child)
      if (cached !== undefined) return cached
      const bindings = Object.entries(child.props).flatMap(([key, value]) => {
        const { scope } = IUI_AST.readBinding(value)
        return scope === undefined ? [] : [{ key, scope }]
      })
      const calculated = child.geometryExpressions !== undefined
      const dynamic = calculated || bindings.some(({ key }) => key !== 'when' && key !== 'is' && key !== 'weight')
      const plan = {
        props: dynamic ? undefined : IUI_AST.drawingProps(child.type, child.props),
        animated: calculated || bindings.some(({ scope }) => scope === 'state'),
      }
      drawingShapePlans.set(child, plan)
      return plan
    }

    function fitDrawingFrame(children, width, height) {
      const frame = { x: 0, y: 0, right: width, bottom: height }
      // Fit modest overhangs across every view. A stray distant coordinate should not shrink the scene.
      const extraX = width / 4
      const extraY = height / 4
      for (const child of children.flatMap((part) => part.type === 'view' ? part.children : [part])) {
        if (child.type !== 'rect' && child.type !== 'circle' && child.type !== 'line') continue
        const shape = getDrawingShapePlan(child).props
        if (shape == null) continue
        let bounds
        if (child.type === 'rect') bounds = [shape.x, shape.y, shape.x + shape.width, shape.y + shape.height]
        else if (child.type === 'circle') bounds = [shape.cx - shape.r, shape.cy - shape.r, shape.cx + shape.r, shape.cy + shape.r]
        else bounds = [Math.min(shape.x1, shape.x2), Math.min(shape.y1, shape.y2), Math.max(shape.x1, shape.x2), Math.max(shape.y1, shape.y2)]
        const [left, top, right, bottom] = bounds
        if (left < -extraX || top < -extraY || right > width + extraX || bottom > height + extraY) continue
        const inset = Math.ceil((shape.strokeWidth ?? 1.5) / 2)
        if (left < 0) frame.x = Math.min(frame.x, left - inset)
        if (top < 0) frame.y = Math.min(frame.y, top - inset)
        if (right > width) frame.right = Math.max(frame.right, right + inset)
        if (bottom > height) frame.bottom = Math.max(frame.bottom, bottom + inset)
      }
      return frame
    }

    function renderDrawingShape(child, key, { resolve, scope, visible, streaming, frame }) {
      if (!Object.hasOwn(DRAWING_TAGS, child.type) || !visible(child)) return null
      const plan = streaming === true ? null : getDrawingShapePlan(child)
      const props = plan?.props !== undefined ? plan.props : IUI_AST.drawingProps(child.type, child.props, resolve, (attribute) => {
        const expression = child.geometryExpressions?.[attribute]
        if (expression === undefined) return undefined
        const result = IUI_EXPR.evaluateExpr(expression, scope)
        return result.ok ? result.value : null
      })
      if (props === null) return null
      const { fill, stroke, strokeWidth, text, size, align, ...geometry } = props
      if (child.type === 'label') {
        const fontSize = size ?? 13
        let textAnchor = align ?? 'start'
        const x = geometry.x
        if (frame !== null && x >= frame.x && x <= frame.right && textAnchor !== 'middle') {
          // Keep near-edge labels readable using a conservative advance estimate.
          const advance = [...text].reduce((width, char) => width + (char.charCodeAt(0) < 128 ? 0.62 : 1), 0) * fontSize
          if (textAnchor === 'start' && x + advance > frame.right && x - advance >= frame.x) textAnchor = 'end'
          else if (textAnchor === 'end' && x - advance < frame.x && x + advance <= frame.right) textAnchor = 'start'
        }
        return h('text', { key, ...geometry, fill: DRAWING_COLORS[fill ?? 'text'], fontSize, fontFamily: SANS, textAnchor }, text)
      }
      const outline = child.type === 'rect' || child.type === 'circle' ? 'border' : 'accent'
      const strokeColor = stroke ?? (fill === undefined || fill === 'none' ? outline : 'none')
      const animated = plan?.animated && (child.type === 'rect' || child.type === 'circle')
      return h(DRAWING_TAGS[child.type], {
        key,
        ...geometry,
        className: animated ? 'miopiik-shape-motion' : undefined,
        fill: DRAWING_COLORS[fill ?? 'none'],
        stroke: DRAWING_COLORS[strokeColor],
        strokeWidth: strokeWidth ?? 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      })
    }

    function IuiDrawing({ item, resolve, scope, visible, streaming, adaptive, weight }) {
      const [choice, choose] = React.useState(null)
      const captionId = React.useId()
      const weightStyle = weight === undefined ? {} : WEIGHT_STYLE[weight]
      const viewport = IUI_AST.drawingProps('drawing', item.props, resolve)
      const frame = React.useMemo(() => {
        if (!adaptive || viewport === null) return null
        if (streaming === true) return { x: 0, y: 0, right: viewport.width, bottom: viewport.height }
        return fitDrawingFrame(item.children, viewport.width, viewport.height)
      }, [adaptive, item.children, streaming, viewport?.width, viewport?.height])
      if (viewport === null) return h('div', { 'data-iui-drawing-invalid': '1', 'data-iui-weight': weight, style: { color: C.muted, ...weightStyle } }, '示意图暂不可用')

      const options = []
      let hasViews = false
      for (const [index, child] of item.children.entries()) {
        if (child.type !== 'view') continue
        hasViews = true
        if (!visible(child)) continue
        const props = IUI_AST.drawingProps('view', child.props, resolve)
        if (props !== null) options.push({ index, ...props })
      }
      const selected = options.find(({ index }) => index === choice) ?? options[0]
      const caption = selected?.caption
      const shapeContext = { resolve, scope, visible, streaming, frame }
      const shapes = item.children.flatMap((child, index) => {
        if (child.type !== 'view') return renderDrawingShape(child, index, shapeContext)
        if (selected?.index !== index) return []
        return child.children.map((shape, order) => renderDrawingShape(shape, `${index}-${order}`, shapeContext))
      }).filter(Boolean)

      const graphLabel = selected === undefined ? viewport.label : `${viewport.label} · ${selected.label}`
      const width = frame === null ? viewport.width : frame.right - frame.x
      const height = frame === null ? viewport.height : frame.bottom - frame.y
      const aspect = width / height
      // ViewBox dimensions describe geometry. A wide drawing can grow with its column.
      const fluid = adaptive && aspect >= 1.5
      const visualWidth = fluid ? Math.max(width, Math.round(aspect * 340)) : width
      const graph = shapes.length === 0
        ? h('div', { 'data-iui-drawing-invalid': '1', style: { color: C.muted } }, graphLabel)
        : svgCanvas(width, height, shapes, graphLabel, { drawing: true, fluid, x: frame?.x, y: frame?.y, describedBy: caption === undefined ? undefined : captionId })
      const layout = { minWidth: 0, maxWidth: '100%', ...weightStyle }
      const visualLayout = { width: visualWidth, margin: '0 auto' }
      if (!hasViews) return h('div', { 'data-iui-weight': weight, style: fluid ? { ...layout, ...visualLayout } : layout }, graph)
      return h('figure', {
        'data-iui-drawing-comparison': '1',
        'data-iui-weight': weight,
        style: { ...layout, ...visualLayout, display: 'flex', flexDirection: 'column', gap: 6 },
      },
      options.length > 1 ? h('div', { className: 'miopiik-choices', role: 'group', 'aria-label': `对照视图：${viewport.label}` },
        ...options.map((option) => {
          const active = option.index === selected?.index
          return h('button', {
            key: option.index,
            type: 'button',
            className: 'miopiik-ctl miopiik-choice',
            'data-iui-drawing-option': String(option.index),
            'aria-pressed': active,
            disabled: streaming === true,
            onClick: () => choose(option.index),
          }, option.label)
        })) : null,
      graph,
      options.some((option) => option.caption !== undefined) ? h('figcaption', {
        id: captionId,
        'data-iui-drawing-caption': '1',
        'aria-live': 'polite',
        style: { fontSize: 12, lineHeight: '18px', color: C.muted },
      }, caption) : null)
    }

    function IuiViews({ item, render, resolve, visible, updateState, streaming, weight }) {
      const id = React.useId()
      const [choice, choose] = React.useState(null)
      const binding = IUI_AST.readBinding(item.props.bind)
      const bound = binding.scope === 'state'
      const current = bound ? resolve(item.props.bind) : choice
      const options = item.children.flatMap((pane, index) => {
        if (pane.type !== 'view' || !visible(pane)) return []
        const props = IUI_AST.drawingProps('view', pane.props, resolve)
        return props === null ? [] : [{ ...props, index, value: bound ? pane.props.value : index }]
      })
      const active = options.find(({ value }) => sameValue(value, current)) ?? options[0]
      if (active === undefined) return null
      const select = (option) => {
        if (streaming === true) return
        if (bound) updateState(binding.key, option.value)
        else choose(option.value)
      }
      const title = resolve(item.props.label)
      const useTabs = options.length > 1
      const focusOnKey = (event, index) => {
        if (streaming === true || !['Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length
        event.preventDefault()
        select(options[next])
        event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[next]?.focus()
      }
      return h('div', {
        'data-iui-views': '1', 'data-iui-weight': weight,
        style: { display: 'flex', flexDirection: 'column', minWidth: 0, gap: 9, ...WEIGHT_STYLE[weight] },
      },
      useTabs ? h('div', {
        className: 'miopiik-choices', role: 'tablist', 'aria-label': typeof title === 'string' ? title : '对照视图',
      }, ...options.map((option, index) => {
        const selected = option === active
        return h('button', {
          key: option.index, id: `${id}-tab-${option.index}`, type: 'button', role: 'tab',
          'aria-selected': selected, 'aria-controls': `${id}-panel-${option.index}`,
          tabIndex: selected ? 0 : -1, disabled: streaming === true, className: 'miopiik-ctl miopiik-choice',
          onClick: () => select(option), onKeyDown: (event) => focusOnKey(event, index),
        }, option.label)
      })) : null,
      ...options.map((option) => {
        const selected = option === active
        return h('section', {
          key: option.index, id: `${id}-panel-${option.index}`, role: useTabs ? 'tabpanel' : undefined,
          className: streaming === true ? undefined : 'miopiik-enter',
          'aria-labelledby': useTabs ? `${id}-tab-${option.index}` : undefined,
          'aria-label': useTabs ? undefined : option.label, tabIndex: useTabs && selected ? 0 : undefined,
          hidden: !selected, style: { display: selected ? 'flex' : 'none', flexDirection: 'column', minWidth: 0, gap: 7 },
        },
        ...(selected ? item.children[option.index].children.map((child, index) => render(child, `${option.index}-${index}`)) : []),
        selected && option.caption !== undefined ? h('div', { style: { color: C.muted, fontSize: 12, lineHeight: '18px' } }, option.caption) : null)
      }),
      )
    }

    /** 图表可访问摘要：读屏用户拿到的应是数据本身，而不只是"一张图"。 */
    function chartSummary(rows, kind, xUnit, yUnit) {
      const kindName = { bar: '柱状图', line: '折线图', donut: '占比图' }[kind] ?? '图表'
      const parts = rows.slice(0, 8).map(([label, value]) => `${label}${xUnit} ${value}${yUnit}`)
      const suffix = rows.length > 8 ? `，等共 ${rows.length} 项` : ''
      return `${kindName}：${parts.join('，')}${suffix}`
    }

    const chartNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

    function formatChartValue(value) {
      const magnitude = Math.abs(value)
      return magnitude > 0 && (magnitude < 0.01 || magnitude >= 1e9) ? value.toExponential(2) : chartNumber.format(value)
    }

    function renderRangeInput({ min, max, step, value, label, valueText, onChange }) {
      const span = max - min
      const ratio = Number.isFinite(span) ? (span > 0 ? (value - min) / span : 0)
        : (value / 2 - min / 2) / (max / 2 - min / 2)
      return h('span', { className: 'miopiik-range' },
        h('span', { className: 'miopiik-range-fill', 'aria-hidden': true, style: { transform: `translateY(-50%) scaleX(${ratio})` } }),
        h('input', {
          type: 'range', min, max, step, value,
          'aria-label': label, 'aria-valuetext': valueText,
          onChange: (event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(next)
          },
        }),
      )
    }

    const traceDashes = [undefined, '7 4', '2 3', '8 3 2 3']
    const normalizedCharts = new WeakMap()

    function normalizeChart(series, xScale, xUnit) {
      if (!Array.isArray(series)) return { rows: null, traces: null }
      const existing = normalizedCharts.get(series)
      if (existing !== undefined && existing.xScale === xScale && existing.xUnit === xUnit) return existing
      const rows = IUI_AST.chartMatrix(series, xScale, xUnit)
      const traces = rows === null && xScale === 'linear' ? IUI_AST.chartTraces(series, xUnit) : null
      const normalized = { xScale, xUnit, rows, traces }
      normalizedCharts.set(series, normalized)
      return normalized
    }

    function lineValueAt(rows, x) {
      if (x < rows[0][0] || x > rows.at(-1)[0]) return null
      const next = rows.findIndex(([coordinate]) => coordinate > x)
      if (next === -1) return rows.at(-1)[1]
      const [fromX, fromY] = rows[next - 1]
      const [toX, toY] = rows[next]
      if (x === fromX) return fromY
      const span = toX - fromX
      const fraction = Number.isFinite(span) ? (x - fromX) / span : (x / 2 - fromX / 2) / (toX / 2 - fromX / 2)
      return fromY * (1 - fraction) + toY * fraction
    }

    function prepareLineChart(rows, traces, width, linear, xUnit, yUnit, rawMarks) {
      const multiple = traces !== null
      const height = multiple ? 182 : 152
      const top = 22
      const bottom = height - 29
      const values = multiple ? traces.flatMap((trace) => trace.rows.map(([, value]) => value)) : rows.map(([, value]) => value)
      const magnitude = Math.max(...values.map(Math.abs)) || 1
      const scaled = values.map((value) => value / magnitude)
      const min = Math.min(0, ...scaled)
      const max = Math.max(0, ...scaled)
      const y = (value) => bottom - ((value - min) / (max - min || 1)) * (bottom - top)
      const toY = (value) => y(value / magnitude)
      const axisLabels = [min, max].map((value) => formatChartValue(value * magnitude))
      const left = multiple ? Math.min(66, 10 + Math.max(...axisLabels.map((value) => value.length)) * 7) : 9
      const right = Math.max(left, width - 9)
      const domain = multiple
        ? [...new Set(traces.flatMap((trace) => trace.rows.map(([x]) => x)))].sort((a, b) => a - b)
        : rows.map(([x], index) => linear ? x : index)
      const last = domain.length - 1
      const domainMin = domain[0]
      const domainMax = domain[last]
      const xMagnitude = Math.max(Math.abs(domainMin), Math.abs(domainMax)) || 1
      const firstX = domainMin / xMagnitude
      const span = domainMax / xMagnitude - firstX
      const toX = (value) => span === 0 ? width / 2 : left + (value / xMagnitude - firstX) / span * (right - left)
      const intervals = Math.min(last, Math.max(1, Math.floor((right - left) / 96)))
      const ticks = new Set(Array.from({ length: intervals + 1 }, (_, i) => Math.round(i * last / (intervals || 1))))
      if (linear) {
        ticks.clear()
        ticks.add(last)
        if (multiple) ticks.add(0)
        let priorX = toX(domainMax)
        const startX = toX(domainMin)
        for (let index = last - 1; index >= 0; index -= 1) {
          const x = toX(domain[index])
          if (priorX - x < 72 || (multiple && x - startX < 72)) continue
          ticks.add(index)
          priorX = x
        }
      }
      const labelLimit = Math.max(3, Math.min(15, Math.floor(width / (intervals + 1) / 11)))
      const baseline = y(0)
      const parts = []
      const guides = max === min ? [0] : [min, (min + max) / 2, max]
      if (multiple) {
        guides.forEach((value, index) => {
          const guide = y(value)
          parts.push(
            h('line', { key: `guide-${index}`, className: 'miopiik-chart-guide', x1: left, y1: guide, x2: right, y2: guide, strokeWidth: 1 }),
            h('text', { key: `scale-${index}`, x: left - 6, y: guide + 4, textAnchor: 'end', fontSize: 11, fill: C.muted, fontFamily: SANS }, formatChartValue(value * magnitude)),
          )
        })
        if (yUnit !== '') parts.push(h('text', { key: 'unit', x: left, y: 11, fontSize: 10, fill: C.muted, fontFamily: SANS }, yUnit.trim()))
      } else if (max !== min) {
        for (const division of [0, 1, 2, 3]) {
          const guide = y(min + (max - min) * division / 3)
          if (Math.abs(guide - baseline) < 2) continue
          parts.push(h('line', { key: `guide-${division}`, className: 'miopiik-chart-guide', x1: left, y1: guide, x2: right, y2: guide, strokeWidth: 1 }))
        }
      }
      parts.push(h('line', { key: 'axis', className: 'miopiik-chart-guide', x1: left, y1: baseline, x2: right, y2: baseline, stroke: C.border, strokeWidth: 1 }))
      const chartSeries = traces ?? [{ rows }]
      chartSeries.forEach((trace, traceIndex) => {
        const points = trace.rows.map(([x, value], index) => ({ x: toX(linear ? x : index), y: toY(value) }))
        const xy = points.map((point) => `${point.x},${point.y}`).join(' ')
        if (!multiple && span > 0) parts.push(h('polygon', { key: 'area', className: 'miopiik-chart-area', points: `${points[0].x},${baseline} ${xy} ${points.at(-1).x},${baseline}`, fill: 'none' }))
        parts.push(h('polyline', {
          key: `line-${traceIndex}`, points: xy, fill: 'none', stroke: C.brand, strokeWidth: 2,
          strokeDasharray: traceDashes[traceIndex], strokeLinecap: 'round', strokeLinejoin: 'round',
          'data-iui-chart-trace': trace.label, 'data-iui-trace-tone': multiple ? traceIndex : undefined,
          className: multiple ? 'miopiik-trace-stroke' : undefined,
        }))
        if (multiple) return
        points.forEach((point, index) => {
          const [x, value] = rows[index]
          const pointLabel = linear ? `${formatChartValue(x)}${xUnit}` : x
          parts.push(h('circle', { key: `dot-${index}`, cx: point.x, cy: point.y, r: 3, fill: C.brand }, h('title', null, `${pointLabel}：${value}`)))
          if (!ticks.has(index)) return
          const textAnchor = span === 0 ? 'middle' : index === 0 ? 'start' : index === last ? 'end' : 'middle'
          parts.push(h('text', { key: `val-${index}`, x: point.x, y: point.y - 8, fontSize: 11, fill: C.text, fontFamily: SANS, textAnchor }, formatChartValue(value)))
        })
      })
      for (const index of ticks) {
        const x = domain[index]
        const textAnchor = span === 0 ? 'middle' : index === 0 ? 'start' : index === last ? 'end' : 'middle'
        const pointLabel = linear ? `${formatChartValue(x)}${xUnit}` : rows[index][0]
        const chars = [...pointLabel]
        const tick = chars.length > labelLimit ? `${chars.slice(0, labelLimit - 1).join('')}…` : pointLabel
        parts.push(h('text', { key: `lab-${index}`, x: toX(x), y: height - 9, fontSize: 11, fill: C.muted, fontFamily: SANS, textAnchor }, tick))
      }
      const marks = (IUI_AST.chartMarks(rawMarks) ?? []).filter(([x]) => x >= domainMin && x <= domainMax)
      for (const [time] of marks) {
        const x = toX(time)
        parts.push(h('line', { key: `mark-${time}`, className: 'miopiik-chart-mark-tick', 'aria-hidden': true, x1: x, x2: x, y1: bottom + 1, y2: bottom + 7, strokeWidth: 2 }))
      }
      return { parts, chartSeries, domainMin, domainMax, toX, toY, height, top, bottom, marks }
    }

    function IuiLineChart({ rows, traces = null, label, xScale, xUnit, yUnit, cursor: externalCursor, scrub, onScrub, marks: rawMarks }) {
      const containerRef = React.useRef(null)
      const [width, setWidth] = React.useState(360)
      const [scrubValue, setScrubValue] = React.useState(undefined)
      React.useLayoutEffect(() => {
        const container = containerRef.current
        if (container === null) return
        let previousWidth
        const measure = () => {
          const measured = container.clientWidth
          if (measured <= 0 || measured === previousWidth) return
          previousWidth = measured
          setWidth(measured)
        }
        measure()
        if (typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(measure)
        observer.observe(container)
        return () => observer.disconnect()
      }, [])

      const linear = xScale === 'linear'
      const layout = React.useMemo(() => prepareLineChart(rows, traces, width, linear, xUnit, yUnit, rawMarks), [rows, traces, width, linear, xUnit, yUnit, rawMarks])
      const { chartSeries, domainMin, domainMax, parts, toX, toY, height, top, bottom, marks } = layout
      const multiple = traces !== null
      const scrubbable = scrub !== undefined && domainMax > domainMin && Number.isFinite(domainMax - domainMin)
      const chosen = onScrub === undefined ? scrubValue : externalCursor
      const controlValue = Math.min(domainMax, Math.max(domainMin, Number.isFinite(chosen) ? chosen : domainMin))
      const cursor = scrubbable && onScrub === undefined ? controlValue : externalCursor
      const chooseCursor = onScrub ?? setScrubValue
      const active = linear && Number.isFinite(cursor) && cursor >= domainMin && cursor <= domainMax
      const cursorParts = []
      const readings = active ? chartSeries.map((trace) => lineValueAt(trace.rows, cursor)) : []
      if (active) {
        const x = toX(cursor)
        cursorParts.push(h('line', { key: 'cursor', 'data-iui-chart-cursor': cursor, x1: x, x2: x, y1: top, y2: bottom, stroke: C.muted, strokeDasharray: '3 4' }))
        readings.forEach((value, index) => {
          if (value === null) return
          cursorParts.push(h('circle', {
            key: `marker-${index}`, 'data-iui-chart-marker': '1', 'data-iui-trace-tone': multiple ? index : undefined,
            className: multiple ? 'miopiik-chart-marker miopiik-trace-stroke' : 'miopiik-chart-marker',
            cx: x, cy: toY(value), r: 4.5, stroke: C.brand, strokeWidth: 2,
          }))
        })
      }
      const position = Number.isFinite(cursor) ? `${formatChartValue(cursor)}${xUnit}` : '未选择'
      const readingText = (value) => value === null ? '—' : `${formatChartValue(value)}${yUnit}`
      const legend = multiple ? h('div', {
        className: 'miopiik-trace-legend', role: 'list', 'aria-label': '曲线', 'data-iui-chart-readout': active ? 'multi' : undefined,
      }, ...traces.map((trace, index) => h('div', {
        key: trace.label, className: 'miopiik-trace-legend-item', role: 'listitem', 'data-iui-trace-tone': index,
      },
      h('span', { className: 'miopiik-trace-label' },
        h('svg', { width: 18, height: 8, 'aria-hidden': true }, h('line', { className: 'miopiik-trace-stroke', x1: 1, y1: 4, x2: 17, y2: 4, strokeWidth: 2, strokeDasharray: traceDashes[index] })),
        h('span', null, trace.label),
      ),
      active ? h('span', { className: 'miopiik-trace-value', 'data-iui-trace-value': trace.label, 'aria-label': readings[index] === null ? '无数据' : undefined }, readings[index] === null ? '—' : formatChartValue(readings[index])) : null,
      ))) : null
      const readout = scrubbable && !multiple ? readingText(readings[0] ?? null) : ''
      const currentMark = marks.find(([time]) => time === cursor)?.[1]
      const ariaValue = !active ? '图表未覆盖此时刻' : multiple
        ? traces.map((trace, index) => `${trace.label} ${readings[index] === null ? '无数据' : readingText(readings[index])}`).join('，')
        : readout
      return h('div', { ref: containerRef, style: { width: '100%', minWidth: 0 } },
        svgCanvas(width, height, [...parts, ...cursorParts], label, { fluid: true }),
        scrubbable ? h('div', { 'data-iui-chart-scrub': '1' },
          h('span', { className: 'miopiik-control-label' }, scrub, ' ', h('span', { className: 'miopiik-scrub-position' }, position)),
          multiple ? null : h('output', { className: 'miopiik-range-value', 'aria-live': 'off', 'data-iui-chart-readout': readings[0] }, readout),
          renderRangeInput({ min: domainMin, max: domainMax, step: 'any', value: controlValue, label: scrub, valueText: [position, currentMark, ariaValue].filter(Boolean).join('，'), onChange: chooseCursor }),
        ) : null,
        marks.length === 0 ? null : h('div', { className: 'miopiik-chart-marks', role: 'group', 'aria-label': '时间标记' },
          ...marks.map(([time, title]) => {
            const timestamp = h('span', { className: 'miopiik-chart-mark-time' }, `${formatChartValue(time)}${xUnit}`)
            return scrubbable ? h('button', {
              key: time, type: 'button', className: 'miopiik-ctl miopiik-choice miopiik-chart-mark',
              'data-iui-chart-mark': time, 'aria-current': time === cursor ? 'time' : undefined,
              onClick: () => chooseCursor(time),
            }, title, ' ', timestamp) : h('span', { key: time, className: 'miopiik-control-label' }, title, ' ', timestamp)
          }),
        ),
        legend,
      )
    }

    function renderChart(rows, kind, label, options) {
      if (kind === 'line') return h(IuiLineChart, { rows, label, ...options })
      const values = rows.map((row) => row[1])
      const max = Math.max(1, ...values)
      const labels = rows.map((row) => row[0])
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
                h('span', { title: String(values[index]), style: { color: C.muted } }, formatChartValue(values[index])),
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
            h('div', { title: String(values[index]), style: { fontSize: 10, color: C.text, lineHeight: '12px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, formatChartValue(values[index])),
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
    function isItemVisible(item, resolve, scope) {
      const itemProps = item?.props ?? {}
      if (itemProps.when === undefined) return true
      if (item.conditionExpression !== undefined) {
        const condition = IUI_EXPR.evaluateExpr(item.conditionExpression, scope)
        if (!condition.ok) return false
        return itemProps.is === undefined ? condition.value === true : sameValue(condition.value, resolve(itemProps.is))
      }
      const actual = resolve(itemProps.when)
      return itemProps.is === undefined ? Boolean(actual) : sameValue(actual, resolve(itemProps.is))
    }

    /** 手动密度保留原有边框。自动密度用于间距，外层沿正文流排版。 */
    const DENSITY_STYLE = {
      inline: { gap: 6, border: 'none', borderRadius: 0, padding: 0 },
      compact: { gap: 8, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 },
      panel: { gap: 10, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 },
    }

    const DENSITY_CONTROLS = new Set(['segmented', 'toggle', 'slider', 'input'])
    const DENSITY_STRUCTURES = new Set(['card', 'table', 'chart', 'steps', 'diagram', 'drawing', 'views'])

    /** Use the declared structure and ignore collapsed details so layout stays stable during interaction. */
    function inferDensity(root) {
      let controls = 0
      let structures = 0
      const visit = (item) => {
        if (item.type === 'details') return
        if (DENSITY_CONTROLS.has(item.type)) controls += 1
        if (DENSITY_STRUCTURES.has(item.type)) structures += 1
        for (const child of item.children) visit(child)
      }
      visit(root)
      if (controls >= 2 || structures >= 2) return 'panel'
      return structures === 1 ? 'compact' : 'inline'
    }

    const ROW_INTRINSIC = new Set(['badge', 'icon', 'button', 'toggle', 'segmented', 'details'])
    const ROW_MINIMUM = { drawing: 232, chart: 232, diagram: 232, views: 232, slider: 180, input: 180, card: 160 }

    function rowBasis(item) {
      if (item.type === 'table') return Infinity
      if (ROW_INTRINSIC.has(item.type)) return 0
      const minimum = ROW_MINIMUM[item.type] ?? 112
      const childBasis = Math.max(0, ...item.children.map(rowBasis))
      return Math.max(minimum, childBasis + (item.type === 'card' ? 24 : 0))
    }

    function flowItemStyle(item) {
      const basis = rowBasis(item)
      const visual = item.type === 'drawing' || item.type === 'chart' || item.type === 'diagram'
      const flex = basis === 0 ? '0 1 auto' : `${visual ? 3 : 1} 1 ${Number.isFinite(basis) ? `${basis}px` : '100%'}`
      return { flex, minWidth: 0, maxWidth: '100%' }
    }

    const WEIGHT_STYLE = {
      primary: { fontWeight: 600 },
      secondary: { fontWeight: 500 },
      optional: { fontWeight: 400 },
    }
    const METRIC_FONT_SIZE = { primary: 23, secondary: 18, optional: 16 }

    function weightOf(props) {
      return props !== null && props !== undefined && WEIGHT_STYLE[props.weight] !== undefined ? props.weight : undefined
    }

    /** 把 weight 落到节点自身的根元素：DOM 元素合并 style；组件元素透传 weight，由组件落在自己的根上。 */
    function applyWeight(element, weight) {
      if (element === null || element === undefined || weight === undefined) return element
      const weightStyle = WEIGHT_STYLE[weight]
      if (typeof element.type === 'string') {
        const props = element.props ?? {}
        const extra = { 'data-iui-weight': weight, style: { ...(props.style ?? {}), ...weightStyle } }
        if (typeof React.cloneElement === 'function') return React.cloneElement(element, extra)
        return { ...element, props: { ...props, ...extra } }
      }
      if (typeof React.cloneElement === 'function') return React.cloneElement(element, { weight })
      return { ...element, props: { ...(element.props ?? {}), weight } }
    }

    function IuiDiagram({ item, resolve, resolveText, visible, weight }) {
      // 泳道图：真实浏览器挂载后一次实测锚点（等比 1:1 坐标，箭头精确落在药丸边缘）；
      // stub / 无 DOM 环境回落到近似几何（360 逻辑坐标），保住测试通道与降级路径。
      const props = item.props ?? {}
      const str = (value) => (value === undefined || value === null ? '' : String(value))
      // 文本类属性走字面量回退解析；diagram 子树的 label/note 与主树同一套规则。
      const read = (value) => str(resolveText === undefined ? resolve(value) : resolveText(value))
      const kids = Array.isArray(item.children) ? item.children : []
      const lanes = []
      const notes = []
      const edges = []
      const freeNodes = []
      // 先过滤子树：隐藏 node 不进入布局/布线，引用隐藏 node 的 edge 一并跳过，
      // 隐藏 lane 若仍有可见 node 则忽略其分组（节点并入首列），无可见节点的列整列去掉。
      for (const child of kids) {
        if (child.type === 'lane') {
          const laneVisible = visible(child)
          const laneKids = Array.isArray(child.children) ? child.children : []
          const visibleNodes = laneKids
            .filter((laneChild) => laneChild?.type === 'node' && visible(laneChild))
            .map((laneChild) => ({
              ...laneChild,
              props: {
                ...(laneChild.props ?? {}),
                label: read(laneChild.props?.label),
                note: read(laneChild.props?.note),
              },
            }))
          if (!laneVisible) {
            freeNodes.push(...visibleNodes)
            continue
          }
          if (visibleNodes.length === 0) continue
          lanes.push({ ...child, props: { ...(child.props ?? {}), label: read(child.props?.label) }, children: visibleNodes })
        } else if (child.type === 'node') {
          if (!visible(child)) continue
          freeNodes.push({
            ...child,
            props: {
              ...(child.props ?? {}),
              label: read(child.props?.label),
              note: read(child.props?.note),
            },
          })
        } else if (child.type === 'edge') {
          if (!visible(child)) continue
          edges.push({ ...child, props: { ...(child.props ?? {}), label: read(child.props?.label) } })
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
      const titleText = read(props.title)
      const sourceText = read(props.source)
      const weightStyle = weight !== undefined ? WEIGHT_STYLE[weight] : undefined
      return h(
        'div',
        { className: 'miopiik-enter', 'data-iui-diagram': String(lanes.length), 'data-iui-weight': weightStyle === undefined ? undefined : weight, style: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...(weightStyle ?? {}) } },
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
                const nodeWeight = weightOf(cp)
                const nodeWeightStyle = nodeWeight === undefined ? undefined : WEIGHT_STYLE[nodeWeight]
                return h('div', { key: `node-${si}`, 'data-iui-diagram-node': String(cp.id ?? ''), 'data-iui-weight': nodeWeightStyle === undefined ? undefined : nodeWeight, style: { height: PILL, minWidth: 56, maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, border: `1px ${cp.tone === 'accent' ? 'dashed' : 'solid'} ${cp.tone ? toneColor : C.border}`, borderRadius: 8, padding: '2px 8px', boxSizing: 'border-box', textAlign: 'center', color: cp.tone ? toneColor : C.text, ...(nodeWeightStyle ?? {}) } },
                  h('div', { style: { fontSize: 11, lineHeight: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' } }, String(cp.label ?? '')),
                  String(cp.note ?? '') !== '' ? h('div', { style: { fontSize: 9, lineHeight: '11px', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' } }, String(cp.note)) : null)
              }),
            )),
          ),
          needsDrop ? h('div', { key: 'drop', style: { height: 48 } }) : null,
        ),
        titleText !== '' || sourceText !== '' ? h('div', { style: { fontSize: 10, color: C.muted } }, [titleText, sourceText !== '' ? `来源：${sourceText}` : ''].filter((part) => part !== '').join(' · ')) : null,
        ...notes.map((note, index) => h('div', { key: `note-${index}`, style: { fontSize: 10, color: C.muted } }, read(note.props?.text))),
      )
    }

    const RESERVED_STATE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
    function isRecordValue(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value)
    }

    /** 文档校验已确定依赖顺序。局部交互时只重算结果，不重新扫描、编译或排序节点。 */
    function deriveState(plan, baseState) {
      let state = baseState
      let errors = 0
      for (const { name, compiled } of plan) {
        const result = IUI_EXPR.evaluateExpr(compiled, { state })
        const next = result.ok ? writeStatePath(state, name, result.value) : state
        if (next === state) errors += 1
        state = next
      }
      return { state, errors }
    }

    function renderIuiNotice(text, props = {}) {
      const available = typeof text === 'string' && text.trim() !== ''
      return h('div', {
        role: 'status',
        style: { color: available ? C.text : C.muted, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
        ...props,
      }, available ? text.slice(0, IUI_AST.LIMITS.text) : '这部分内容暂不可用。')
    }

    function diagnosticText(messages) {
      return JSON.stringify(messages.slice(0, 8).map((message) => String(message).slice(0, 180)))
    }

    function renderIuiFallback({ fallback, format, errors, degraded, streaming }) {
      const diagnostics = [...(errors ?? []), ...(degraded ?? [])]
      const props = {
        'data-iui-output': 'invalid',
        'data-iui-format': format ?? 'ml',
        'data-iui-degraded': String(diagnostics.length),
        'data-iui-diagnostics': diagnosticText(diagnostics),
        'data-iui-streaming': streaming ? '1' : undefined,
      }
      if (streaming && (typeof fallback !== 'string' || fallback.trim() === '')) return h('span', { ...props, hidden: true })
      return renderIuiNotice(fallback, props)
    }

    function isComputationOnly(item) {
      if (item.type === 'derive') return true
      return (item.type === 'column' || item.type === 'row' || item.type === 'grid')
        && item.children.length > 0 && item.children.every(isComputationOnly)
    }

    function prepareIuiDocument(sample) {
      const checked = IUI_AST.validateAst(sample)
      // 依赖必须是**内容**而不是对象引用：正文每次渲染都会产生新对象，用引用会导致状态被重置。
      let sampleKey
      try {
        sampleKey = JSON.stringify(checked.ok ? { state: checked.ast.state, root: checked.ast.root } : sample)
      } catch {
        sampleKey = String(sample)
      }
      const adaptive = checked.ok && checked.ast.density === 'auto'
      const density = checked.ok ? (adaptive ? inferDensity(checked.ast.root) : checked.ast.density) : 'panel'
      const computationOnly = checked.ok && isComputationOnly(checked.ast.root)
      return { checked, sampleKey, density, adaptive, computationOnly }
    }

    function IuiSheet({ document, streaming }) {
      const { format, degraded } = document
      const { checked, sampleKey, density, adaptive, computationOnly } = React.useMemo(
        () => document.prepared ?? prepareIuiDocument(document.doc),
        [document],
      )
      const [state, setState] = React.useState(checked.ok ? checked.ast.state : {})
      // Keep disclosure state by position so conditional unmounting preserves it.
      const [openDetails, setOpenDetails] = React.useState(() => new Map())
      React.useEffect(() => {
        if (checked.ok) setState(checked.ast.state)
        // 只有文档内容变化（新块/流式分片）才重置展开态；同一文档的控件交互不得清空。
        setOpenDetails((prev) => (prev.size === 0 ? prev : new Map()))
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [sampleKey])
      const derived = React.useMemo(
        () => checked.ok && !computationOnly ? deriveState(checked.derivePlan, state) : { state, errors: 0 },
        [checked, computationOnly, state],
      )
      const parserDiagnostics = Array.isArray(degraded) ? degraded : []
      if (!checked.ok) return renderIuiFallback({ ...checked, format, degraded: parserDiagnostics, streaming })
      if (computationOnly) return renderIuiFallback({
        fallback: streaming ? '' : checked.ast.fallback,
        format, errors: ['片段只有派生状态，未提供可呈现内容'], degraded: parserDiagnostics, streaming,
      })
      const degradation = [...parserDiagnostics, ...checked.diagnostics]
      const degradedCount = parserDiagnostics.length + checked.degraded
      const ast = checked.ast
      // All bindings read the same state, including computed values.
      const scopedState = derived.state
      const deriveErrors = derived.errors
      const scope = { state: scopedState, data: {} }
      const resolve = (value) => IUI_AST.resolveValue(value, scope)
      const visible = (item) => isItemVisible(item, resolve, scope)
      const resolveDataset = (item, value) => {
        if (item.datasetExpression === undefined) return resolve(value)
        const result = IUI_EXPR.evaluateExpr(item.datasetExpression, scope)
        return result.ok ? result.value : undefined
      }
      const isTextScalar = (value) => typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value)
      const textOf = (value) => isTextScalar(value) ? String(value) : ''
      const resolveText = (value) => {
        // A whole-property reference is data; references quoted in prose remain authored text.
        const binding = IUI_AST.readBinding(value)
        if (binding.scope === undefined && typeof value === 'string' && /^\$(?:state|data)\.[A-Za-z0-9_.]+$/u.test(value)) return undefined
        const resolved = resolve(value)
        return isTextScalar(resolved) ? resolved : undefined
      }
      const fallbackNode = (text, key, tag) => typeof text === 'string' && text.trim() !== ''
        ? h(tag, { key, 'data-iui-node-fallback': '1', style: { overflowWrap: 'anywhere' } }, text)
        : null
      const toggleDetails = (detailsId) => {
        setOpenDetails((prev) => {
          const next = new Map(prev)
          next.set(detailsId, !(next.get(detailsId) === true))
          return next
        })
      }
      // 语义权重在 node() 出口统一落属性/视觉，分支内部不重复处理。
      const node = (item, key) => (item === null || item === undefined ? null : applyWeight(nodeRaw(item, key), weightOf(item.props)))
      const nodeRaw = (item, key) => {
        const props = item.props ?? {}
        // when/is：本地显隐（可选 is 做等值切换）。只读 $state，不执行任何表达式。
        if (!visible(item)) return null
        if (item.degraded === true) return fallbackNode(item.props.text, key, 'div')
        if (item.type === 'derive') return null
        if (item.type === 'text') {
          const text = resolveText(props.text)
          return text === undefined ? renderIuiNotice(item.fallback, { key, 'data-iui-binding-unavailable': '1' })
            : h('div', { key, style: { fontSize: 12, lineHeight: '18px', color: C.text } }, textOf(text))
        }
        if (item.type === 'divider') {
          const label = resolveText(props.label)
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
          const label = resolveText(props.label)
          const value = resolveText(props.value)
          const unit = resolveText(props.unit)
          const unavailable = value === undefined || value === null
          if (unavailable && item.fallback) return renderIuiNotice(item.fallback, { key, 'data-iui-binding-unavailable': '1' })
          const grouped = Number.isSafeInteger(value) && Math.abs(value) >= 1000
          const displayedValue = grouped ? chartNumber.format(value) : String(value)
          const displayedUnit = textOf(unit)
          const narrative = adaptive && typeof value === 'string' && !/^[+-]?\d[\d,.]*(?::\d\d?){0,2}%?$/u.test(value.trim())
          const delta = resolveText(props.delta)
          const described = resolveText(props.caption ?? props.note)
          return h(
            'div',
            { key, 'data-iui-metric': textOf(label), 'data-iui-metric-narrative': narrative ? '1' : undefined, style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, gridColumn: narrative ? '1 / -1' : undefined } },
            h('div', { className: 'miopiik-control-label' }, textOf(label)),
            h('div', { className: 'miopiik-metric-value', 'data-iui-binding-unavailable': unavailable ? '1' : undefined, 'aria-label': unavailable ? '结果暂不可用' : undefined, style: { fontSize: narrative ? 14 : METRIC_FONT_SIZE[props.weight] ?? 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: props.tone ? tone[1] : C.text } },
              unavailable ? '—' : displayedValue,
              unavailable || displayedUnit === '' ? null : h('span', { className: 'miopiik-metric-unit' }, displayedUnit),
            ),
            delta !== undefined && delta !== null && String(delta) !== ''
              ? h('div', { 'data-iui-delta': String(delta), style: { fontSize: 11, color: String(delta).startsWith('-') ? '#d1242f' : '#2ea043' } }, String(delta))
              : null,
            textOf(described) === '' ? null : h('div', { style: { fontSize: 10, color: C.muted } }, textOf(described)),
          )
        }
        if (item.type === 'segmented') {
          const label = resolveText(props.label)
          const binding = IUI_AST.readBinding(props.bind)
          const current = binding.scope === 'state' ? readStatePath(scopedState, binding.key) : undefined
          const options = Array.isArray(props.options) ? props.options : []
          const selectedIndex = options.findIndex((option) => sameValue(option?.value, current))
          return h(
            'div',
            { key, className: 'miopiik-choices', role: 'group', 'aria-label': label ? textOf(label) : undefined },
            label ? h('span', { className: 'miopiik-control-label' }, textOf(label)) : null,
            ...options.map((option, index) =>
              h(
                'button',
                {
                  key: `${key}-${index}`,
                  className: 'miopiik-ctl miopiik-choice',
                  type: 'button',
                  'aria-pressed': index === selectedIndex,
                  onClick: () => {
                    if (binding.scope !== 'state') return
                    setState((prev) => writeStatePath(prev, binding.key, option.value))
                  },
                },
                String(option.label ?? ''),
              ),
            ),
          )
        }
        if (item.type === 'toggle') {
          const label = resolveText(props.label)
          const binding = IUI_AST.readBinding(props.bind)
          const current = binding.scope === 'state' ? readStatePath(scopedState, binding.key) : undefined
          const on = current === true || current === 'true'
          const ariaLabel = label ? textOf(label) : '开关'
          return h(
            'div',
            { key, 'data-iui-toggle': on ? 'on' : 'off', style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
            label ? h('span', { className: 'miopiik-control-label' }, textOf(label)) : null,
            h(
              'button',
              {
                key: `${key}-ctl`,
                className: 'miopiik-ctl miopiik-switch',
                type: 'button',
                role: 'switch',
                'aria-checked': on,
                'aria-label': ariaLabel,
                onClick: () => {
                  if (binding.scope !== 'state') return
                  setState((prev) => writeStatePath(prev, binding.key, !on))
                },
              },
              h('span', { 'aria-hidden': true }),
            ),
          )
        }
        if (item.type === 'slider') {
          const label = resolveText(props.label)
          const unit = resolveText(props.unit)
          const binding = IUI_AST.readBinding(props.bind)
          const min = typeof props.min === 'number' && Number.isFinite(props.min) ? props.min : 0
          const max = typeof props.max === 'number' && Number.isFinite(props.max) && props.max > min ? props.max : Math.max(100, min + 1)
          const stepSize = typeof props.step === 'number' && Number.isFinite(props.step) && props.step > 0 ? props.step : 1
          const current = binding.scope === 'state' ? readStatePath(scopedState, binding.key) : undefined
          const raw = Number(current)
          const value = Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : min
          const ariaLabel = label ? textOf(label) : '数值'
          return h(
            'div',
            { key, 'data-iui-slider': String(value) },
            label ? h('span', { className: 'miopiik-control-label' }, textOf(label)) : null,
            h('span', { className: 'miopiik-range-value' }, `${value}${textOf(unit)}`),
            renderRangeInput({ min, max, step: stepSize, value, label: ariaLabel, onChange: (next) => {
              if (binding.scope === 'state') setState((prev) => writeStatePath(prev, binding.key, next))
            } }),
          )
        }
        if (item.type === 'input') {
          const label = resolveText(props.label)
          const binding = IUI_AST.readBinding(props.bind)
          const current = binding.scope === 'state' ? readStatePath(scopedState, binding.key) : undefined
          const ariaLabel = label ? textOf(label) : '文本输入'
          return h(
            'div',
            { key, 'data-iui-input': '1', style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
            label ? h('span', { className: 'miopiik-control-label' }, textOf(label)) : null,
            h('input', {
              key: `${key}-ctl`,
              type: 'text',
              value: current === undefined || current === null ? '' : String(current),
              maxLength: IUI_AST.LIMITS.text,
              placeholder: textOf(resolveText(props.placeholder)),
              'aria-label': ariaLabel,
              onChange: (event) => {
                if (binding.scope !== 'state') return
                setState((prev) => writeStatePath(prev, binding.key, event.target.value))
              },
            }),
          )
        }
        if (item.type === 'steps') {
          return h(
            'div',
            { key, className: 'miopiik-enter', 'data-iui-steps': String(item.children.length), style: { display: 'flex', flexDirection: 'column', minWidth: 0 } },
            ...item.children.map((child, index) => {
              if (child.degraded === true) return fallbackNode(child.props.text, `${key}-${index}`, 'div')
              const cp = child.props ?? {}
              const title = resolveText(cp.title)
              const note = resolveText(cp.note)
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
          const inline = (child, index) => applyWeight(inlineRaw(child, index), weightOf(child?.props ?? {}))
          const inlineRaw = (child, index) => {
            const key2 = `${key}-${index}`
            if (!visible(child)) return null
            if (child.degraded === true) return fallbackNode(child.props.text, key2, 'span')
            if (child.type === 'text') {
              const text = resolveText(child.props.text)
              return h('span', { key: key2, 'data-iui-binding-unavailable': text === undefined ? '1' : undefined }, text === undefined ? (child.fallback || '—') : textOf(text))
            }
            if (child.type === 'badge') {
              const text = resolveText(child.props.text)
              if (text === undefined) return fallbackNode(child.fallback, key2, 'span')
              const tone = TONE[child.props.tone] ?? TONE.neutral
              return h('span', { key: key2, 'data-iui-badge': String(child.props.tone ?? 'neutral'), style: { display: 'inline-block', padding: '0 6px', margin: '0 2px', borderRadius: 999, fontSize: 11, lineHeight: '18px', background: tone.bg, color: tone.fg } }, textOf(text))
            }
            if (child.type === 'emphasis') return h(child.props.strong === false ? 'em' : 'strong', { key: key2 }, textOf(resolveText(child.props.text)))
            if (child.type === 'code') return h('code', { key: key2, style: { fontFamily: 'ui-monospace, monospace', fontSize: 12, background: 'rgba(127,127,127,0.14)', borderRadius: 4, padding: '0 4px' } }, textOf(resolve(child.props.text)))
            // href 不参与绑定解析：链接目标保持静态白名单，避免状态数据变成任意跳转目标。
            if (child.type === 'link') return h('a', { key: key2, href: String(child.props.href ?? ''), target: '_blank', rel: 'noreferrer noopener', style: { color: C.brand, textDecoration: 'underline' } }, textOf(resolveText(child.props.text)))
            if (child.type === 'icon') return h('span', { key: key2, 'data-iui-icon': String(child.props.name ?? ''), role: 'img', 'aria-label': textOf(resolveText(child.props.label ?? child.props.name)), style: { margin: '0 2px' } }, ICON_GLYPH[child.props.name] ?? '•')
            return h('span', { key: key2 }, '')
          }
          return h(
            'div',
            { key, 'data-iui-inline': String(item.children.length), style: { display: 'block', fontSize: 13, lineHeight: '22px', color: C.text, overflowWrap: 'break-word' } },
            ...item.children.map(inline),
          )
        }
        if (item.type === 'badge') {
          const text = resolveText(props.text)
          if (text === undefined) return renderIuiNotice(item.fallback, { key, 'data-iui-binding-unavailable': '1' })
          const tone = TONE_COLORS[props.tone] ?? TONE_COLORS.neutral
          return h('span', { key, 'data-iui-badge': String(props.tone ?? 'neutral'), style: { display: 'inline-block', padding: '0 6px', borderRadius: 999, fontSize: 11, background: tone[0], color: tone[1] } }, textOf(text))
        }
        if (item.type === 'diagram') return h(IuiDiagram, { key, item, resolve, resolveText, visible })
        if (item.type === 'drawing') return h(IuiDrawing, { key, item, resolve, scope, visible, streaming, adaptive })
        if (item.type === 'views') return h(IuiViews, {
          key, item, resolve, visible, streaming,
          render: (child, index) => node(child, `${key}-${index}`),
          updateState: (path, value) => setState((prev) => writeStatePath(prev, path, value)),
        })
        if (item.type === 'callout') {
          const tone = String(props.tone ?? 'neutral')
          const color = (TONE_COLORS[tone] ?? TONE_COLORS.neutral)[1]
          const title = resolveText(props.title)
          const text = resolveText(props.text)
          const kids = item.children.map((child, index) => node(child, `${key}-${index}`)).filter(Boolean)
          if (!title && !text && kids.length === 0) return renderIuiNotice(item.fallback, { key, 'data-iui-binding-unavailable': '1' })
          return h(
            'div',
            { key, 'data-iui-callout': tone, style: { display: 'flex', flexDirection: 'column', gap: 6, borderLeft: `3px solid ${color}`, background: 'rgba(127,127,127,0.07)', borderRadius: 6, padding: '8px 10px' } },
            title ? h('div', { style: { fontSize: 12, fontWeight: 600, color } }, textOf(title)) : null,
            textOf(text) === '' ? null : h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.text } }, textOf(text)),
            ...kids,
          )
        }
        if (item.type === 'progress') {
          const label = resolveText(props.label)
          const shown = resolve(props.value)
          const numeric = Number(shown)
          const max = Number(props.max ?? 1)
          if (shown === undefined || shown === null || shown === '' || !Number.isFinite(numeric) || numeric < 0) {
            return renderIuiNotice(item.fallback, { key, 'data-iui-progress-unavailable': '1' })
          }
          const ratio = Math.min(1, numeric / (max === 0 ? 1 : max))
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
          const title = resolveText(props.title)
          const description = resolveText(props.description ?? props.text)
          return h(
            'div',
            { key, 'data-iui-empty': '1', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center', padding: '14px 0', color: C.muted } },
            props.icon ? h('div', { style: { fontSize: 18, lineHeight: '22px' } }, glyph[props.icon] ?? '•') : null,
            title ? h('div', { style: { fontSize: 12, fontWeight: 600, color: C.text } }, textOf(title)) : null,
            textOf(description) === '' ? null : h('div', { style: { fontSize: 11, lineHeight: '17px', maxWidth: 320 } }, textOf(description)),
          )
        }
        if (item.type === 'card') {
          const title = resolveText(props.title)
          const subtitle = resolveText(props.subtitle)
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
          const resolvedRows = resolveDataset(item, props.rows)
          const positional = props.columns === undefined
          const resolvedColumns = positional ? IUI_AST.positionalTableColumns(resolvedRows) : resolve(props.columns)
          const columnsValid = Array.isArray(resolvedColumns)
            && (positional || resolvedColumns.length >= 1)
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
            return renderIuiNotice(item.fallback, { key, 'data-iui-table-invalid': '1' })
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
          const captionValue = resolveText(props.caption)
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
              positional ? null : h(
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
                    ...columns.map((_, cellIndex) => {
                      const rowLabel = positional && cellIndex === 0
                      return h(rowLabel ? 'th' : 'td', { key: `c${cellIndex}`, scope: rowLabel ? 'row' : undefined, style: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, textAlign: rowLabel ? 'left' : undefined, fontWeight: rowLabel ? 500 : undefined } }, cellText(Array.isArray(row) ? row[cellIndex] : ''))
                    }),
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
          const isFlowRow = isRow && adaptive
          const isMetricColumn = !isRow && adaptive && item.children.length > 1 && item.children.every((child) => child.type === 'metric')
          const style = { gap: Number(props.gap ?? DENSITY_STYLE[density].gap) }
          if (isFlowRow) Object.assign(style, { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', minWidth: 0 })
          else if (isRow) Object.assign(style, { display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, item.children.length)}, minmax(0, 1fr))` })
          else if (isMetricColumn) Object.assign(style, { display: 'flex', flexWrap: 'wrap', minWidth: 0 })
          else Object.assign(style, { display: 'flex', flexDirection: 'column' })
          return h(
            'div',
            { key, 'data-iui-container': item.type, className: isMetricColumn ? 'miopiik-metric-row' : undefined, style },
            ...item.children.map((child, index) => {
              const childKey = `${key}-${index}`
              const content = node(child, childKey)
              return isFlowRow && content !== null ? h('div', { key: childKey, style: flowItemStyle(child) }, content) : content
            }),
          )
        }
        if (item.type === 'chart') {
          const series = resolveDataset(item, props.series)
          const kind = String(props.kind ?? 'bar')
          const xUnit = props.xScale === 'linear' ? textOf(resolveText(props.xUnit)).slice(0, 16) : ''
          const yUnit = textOf(resolveText(props.yUnit)).slice(0, 16)
          const { rows, traces } = normalizeChart(series, props.xScale, xUnit)
          if (rows === null && traces === null) return renderIuiNotice(item.fallback, { key, 'data-iui-chart-empty': '1' })
          const binding = IUI_AST.readBinding(props.bind)
          const linked = binding.scope === 'state'
          const chartOptions = {
            xScale: props.xScale, xUnit, yUnit, cursor: resolve(linked ? props.bind : props.cursor), scrub: props.scrub, marks: resolve(props.marks),
            onScrub: linked ? (value) => setState((prev) => writeStatePath(prev, binding.key, value)) : undefined,
          }
          const plot = traces === null
            ? renderChart(rows, kind, chartSummary(rows, kind, xUnit, yUnit), chartOptions)
            : h(IuiLineChart, {
              traces, ...chartOptions,
              label: `共享坐标折线图。${traces.map((trace) => `${trace.label}：${trace.rows.slice(0, 3).map(([x, y]) => `${x}${xUnit} ${y}${yUnit}`).join('，')}，共 ${trace.rows.length} 个数据点`).join('。')}`,
            })
          const source = resolveText(props.source)
          return h(
            'div',
            { key, className: 'miopiik-enter miopiik-chart-frame', 'data-iui-chart': kind, 'data-iui-chart-scale': props.xScale },
            plot,
            textOf(source) === '' ? null : h('div', { className: 'miopiik-chart-source' }, `来源：${textOf(source)}`),
          )
        }
        if (item.type === 'details') {
          return h(IuiDetails, {
            key,
            item,
            render: (child, index) => node(child, `${key}-${index}`),
            resolve,
            resolveText,
            open: openDetails.get(key) === true,
            onToggle: () => toggleDetails(key),
          })
        }
        if (item.type === 'button') {
          if (props.action === 'copy') return h(IuiCopyAction, { key, item, resolve, resolveText })
          const binding = IUI_AST.readBinding(props.bind)
          const value = resolve(props.value)
          const disabled = IUI_AST.localActionValue(state, ast.state, props, value) === undefined
          return h('button', {
            key,
            type: 'button',
            className: 'miopiik-ctl',
            'data-iui-action': props.action,
            disabled,
            onClick: () => setState((prev) => {
              const next = IUI_AST.localActionValue(prev, ast.state, props, value)
              return next === undefined ? prev : writeStatePath(prev, binding.key, next)
            }),
            style: { border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', color: disabled ? C.muted : C.text, padding: '3px 10px', fontSize: 12, lineHeight: '18px', alignSelf: 'start', cursor: disabled ? 'default' : 'pointer' },
          }, textOf(resolveText(props.label)))
        }
        return null
      }
      const frame = DENSITY_STYLE[adaptive ? 'inline' : density]
      const hasOutput = (item) => {
        if (!visible(item)) return false
        if (item.degraded === true) return textOf(item.props.text).trim() !== ''
        if (item.type === 'derive' || DENSITY_CONTROLS.has(item.type) || (item.type === 'button' && item.props.action !== 'copy')) return false
        if (['column', 'row', 'grid', 'card', 'paragraph', 'views', 'view'].includes(item.type)) return item.children.some(hasOutput)
        return true
      }
      if ((degradedCount > 0 || deriveErrors > 0) && !hasOutput(ast.root)) {
        return renderIuiFallback({ fallback: ast.fallback, format, errors: degradation, degraded: deriveErrors > 0 ? [String(deriveErrors) + ' derive errors'] : [], streaming })
      }
      return h(
        'div',
        // 流式分片期间不挂入场动画：逐分片重挂载会让淡入闪成频闪
        {
          className: streaming === true ? undefined : 'miopiik-enter',
          'data-iui-output': 'ok',
          'data-iui-format': format ?? 'json',
          'data-iui-degraded': String(degradedCount),
          'data-iui-diagnostics': degradation.length > 0 ? diagnosticText(degradation) : undefined,
          'data-iui-streaming': streaming === true ? '1' : undefined,
          'data-iui-density': density,
          'data-iui-surface': adaptive || density === 'inline' ? 'flow' : 'frame',
          'data-iui-derive-errors': String(deriveErrors),
          style: { display: 'flex', flexDirection: 'column', minWidth: 0, overflowWrap: 'anywhere', ...frame, gap: DENSITY_STYLE[density].gap },
        },
        // inline 密度嵌在正文里：标题用小号弱化样式，避免抢正文层级
        ast.title ? h('div', { style: density === 'inline' ? { fontSize: 11, fontWeight: 600, color: C.muted, lineHeight: '16px' } : { fontSize: 13, fontWeight: 600 } }, ast.title) : null,
        node(ast.root, 'root'),
        streaming !== true && (degradedCount > 0 || deriveErrors > 0) ? renderIuiNotice('部分内容暂不可用。', { 'data-iui-partial': '1', style: { color: C.muted, fontSize: '0.875em' } }) : null,
      )
    }

    /** A disclosure whose open state belongs to its IUI fragment. */
    function IuiDetails({ item, render, resolve, resolveText, open, onToggle, weight }) {
      const props = item.props ?? {}
      const rawLabel = resolveText === undefined ? (resolve === undefined ? props.label : resolve(props.label)) : resolveText(props.label)
      const label = rawLabel === undefined || rawLabel === null || String(rawLabel) === '' ? '详情' : String(rawLabel)
      const bodyId = React.useId()
      const children = Array.isArray(item.children) ? item.children : []
      const expanded = open === true
      const weightStyle = weight !== undefined ? WEIGHT_STYLE[weight] : undefined
      return h(
        'div',
        { 'data-iui-details': expanded ? 'open' : 'closed', 'data-iui-weight': weightStyle === undefined ? undefined : weight, style: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...(weightStyle ?? {}) } },
        h('button', {
          type: 'button',
          className: 'miopiik-ctl',
          'aria-expanded': expanded ? 'true' : 'false',
          'aria-controls': bodyId,
          onClick: () => {
            if (typeof onToggle === 'function') onToggle()
          },
          style: { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', color: C.text, padding: '3px 9px', fontSize: 12, lineHeight: '18px', cursor: 'pointer' },
        }, h('span', { 'aria-hidden': true }, expanded ? '▾' : '▸'), label),
        h('div', { id: bodyId, hidden: !expanded, 'data-iui-details-body': expanded ? '1' : undefined, style: { display: expanded ? 'flex' : 'none', flexDirection: 'column', gap: 8, paddingLeft: 2, minWidth: 0 } },
          ...(expanded ? children.map(render) : []),
        ),
      )
    }

    /**
     * 待复制载荷：字符串原样、其余 JSON 序列化。
     * 解析失败 → parsed:false（摘要显示 —）；超过 stateBytes → copyable:false（点击一律 unsupported，不假报成功）。
     */
    function copyPayloadOf(value) {
      let text = null
      try {
        const payload = typeof value === 'string' ? value : JSON.stringify(value)
        if (typeof payload === 'string') text = payload
      } catch {
        text = null
      }
      if (text === null) return { parsed: false, copyable: false, bytes: 0, text: null }
      const bytes = text.length
      return bytes > IUI_AST.LIMITS.stateBytes
        ? { parsed: true, copyable: false, bytes, text: null }
        : { parsed: true, copyable: true, bytes, text }
    }

    /** button：唯一宿主授权动作 copy（仅用户点击后写剪贴板）；状态本地，role=status 播报。 */
    function IuiCopyAction({ item, resolve, resolveText, weight }) {
      const [status, setStatus] = React.useState('idle')
      const props = item.props ?? {}
      const action = props.action
      const read = (value) => (resolveText === undefined ? resolve(value) : resolveText(value))
      const rawLabel = read(props.label)
      const label = rawLabel === undefined || rawLabel === null || String(rawLabel) === '' ? '复制' : String(rawLabel)
      const done = read(props.done)
      const unsupported = read(props.unsupported)
      // 可见摘要必须是「真实待复制内容」的可核对版本，不能拿 label 冒充。
      const value = resolve(props.value)
      const payload = copyPayloadOf(value)
      const kind = typeof value === 'string' ? '文本' : 'JSON'
      const summary = payload.copyable ? `待复制：${kind} · ${payload.bytes} 字符` : '待复制：—'
      const baseDone = done === undefined || done === null || String(done) === '' ? '已复制' : String(done)
      const statusText = status === 'ok'
        ? `${baseDone} · ${payload.bytes} 字符`
        : status === 'unsupported'
          ? (unsupported === undefined || unsupported === null || String(unsupported) === '' ? '当前不支持此动作' : String(unsupported))
          : ''
      const copy = () => {
        // 只实现 copy：任何其他 action 一律按不支持处理（AST 校验器已先拒绝）。
        if (action !== 'copy' || !payload.copyable) {
          setStatus('unsupported')
          return
        }
        let clipboard = null
        try {
          clipboard = typeof navigator === 'undefined' ? null : navigator.clipboard
        } catch {
          clipboard = null
        }
        // 剪贴板缺失/写入被拒（权限/焦点）→ unsupported；不读剪贴板、无网络、不假报成功。
        if (clipboard === null || clipboard === undefined || typeof clipboard.writeText !== 'function') {
          setStatus('unsupported')
          return
        }
        try {
          Promise.resolve(clipboard.writeText(payload.text)).then(() => setStatus('ok'), () => setStatus('unsupported'))
        } catch {
          setStatus('unsupported')
        }
      }
      const marked = status === 'ok' || status === 'unsupported' ? status : undefined
      const weightStyle = weight !== undefined ? WEIGHT_STYLE[weight] : undefined
      return h(
        'div',
        { 'data-iui-action-wrap': '1', 'data-iui-weight': weightStyle === undefined ? undefined : weight, style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0, ...(weightStyle ?? {}) } },
        h('button', {
          type: 'button',
          className: 'miopiik-ctl',
          'data-iui-action': 'copy',
          'data-iui-copy-bytes': payload.parsed ? String(payload.bytes) : undefined,
          onClick: copy,
          style: { border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', color: C.text, padding: '3px 10px', fontSize: 12, lineHeight: '18px', cursor: 'pointer' },
        }, label),
        h('span', {
          'data-iui-copy-summary': '1',
          style: { fontSize: 10, lineHeight: '16px', color: C.muted },
        }, summary),
        payload.copyable ? h('details', { style: { fontSize: 11, minWidth: 0, maxWidth: '100%' } },
          h('summary', { style: { color: C.text, cursor: 'pointer' } }, '预览复制内容'),
          h('pre', { 'data-iui-copy-preview': '1', style: { margin: '4px 0', padding: 6, maxHeight: 144, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, payload.text),
        ) : null,
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
    const writeStatePath = IUI_AST.writeStatePath
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

    function readIuiFence(text, streaming) {
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
      const parsed = MIOPIIK_ML.parseMiopiikMl(text, { streaming })
      return parsed.ok
        ? { ok: true, doc: parsed.doc, format: 'ml', degraded: parsed.degraded }
        : { ...parsed, format: 'ml' }
    }

    // Keep only recently replayed completed blocks. Open streams do not retain their prefixes.
    const IUI_FENCE_CACHE_LIMIT = 24
    const IUI_FENCE_CACHE_CHARS = 160_000
    const IUI_FENCE_MAX_CACHEABLE = 24_000
    const iuiFenceCache = new Map()
    let iuiFenceCacheChars = 0
    const MemoIuiSheet = typeof React.memo === 'function' ? React.memo(IuiSheet) : IuiSheet

    function readCompletedIuiFence(text) {
      const cached = iuiFenceCache.get(text)
      if (cached !== undefined) {
        iuiFenceCache.delete(text)
        iuiFenceCache.set(text, cached)
        return cached
      }
      const parsed = readIuiFence(text, false)
      if (!parsed.ok || text.length > IUI_FENCE_MAX_CACHEABLE) return parsed
      const prepared = prepareIuiDocument(parsed.doc)
      const document = { ok: true, format: parsed.format, degraded: parsed.degraded, prepared }
      if (!prepared.checked.ok) return document
      while (iuiFenceCache.size >= IUI_FENCE_CACHE_LIMIT || iuiFenceCacheChars + text.length > IUI_FENCE_CACHE_CHARS) {
        const oldest = iuiFenceCache.keys().next().value
        iuiFenceCache.delete(oldest)
        iuiFenceCacheChars -= oldest.length
      }
      iuiFenceCache.set(text, document)
      iuiFenceCacheChars += text.length
      return document
    }

    function renderIuiFence(raw, streaming = false) {
      try {
        const text = String(raw ?? '').trim()
        const document = streaming ? readIuiFence(text, true) : readCompletedIuiFence(text)
        return document.ok
          ? h(MemoIuiSheet, { document, streaming })
          : renderIuiFallback({ ...document, streaming })
      } catch {
        return renderIuiFallback({ errors: ['IUI parse failed'], streaming })
      }
    }
