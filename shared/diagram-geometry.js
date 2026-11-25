/**
 * 泳道图布线几何（纯函数，px 或逻辑坐标同构）。
 *
 * 分工：renderer 只负责把 DOM 摆出来并（真实浏览器里）测出锚点矩形；
 * 本文件拿到 anchors 后计算全部贝塞尔路径、箭头端点与标签坐标。
 * 正向边走行内直接曲线；反向边统一走底部弧线——避开一切中间药丸、
 * 与同对的正向边天然分离（虚线不再被实线盖住）。
 */

/** 同列（cx 相同）视为纵向连线；方向由 cy 决定。 */
const SAME_COLUMN_EPSILON = 0.5

/**
 * @param {Array} edges 校验后的 edge AST 节点
 * @param {Object} anchors { [id]: { cx, cy, halfW, halfH } }，与 width/height 同坐标空间
 * @param {number} laneWidth 单列宽度（同坐标空间），用于判断跨列正向边是否绕行
 * @returns {{ arcs: Array<{ d, dashed, label, labelX, labelY }>, backwardDrop: number }}
 *   backwardDrop：底部弧线需要的额外容器高度（0 表示没有反向边）
 */
export function diagramEdges(edges, anchors, laneWidth) {
  const arcs = []
  let backwardDrop = 0
  const gap = 3
  for (const edge of edges) {
    const p = edge.props ?? {}
    const a = anchors[p.from]
    const b = anchors[p.to]
    if (a === undefined || b === undefined || p.from === p.to) continue
    const label = typeof p.label === 'string' && p.label.trim() !== '' ? p.label : null
    const dashed = p.kind === 'dashed'
    if (Math.abs(b.cx - a.cx) < SAME_COLUMN_EPSILON) {
      const downward = b.cy >= a.cy
      const sy = downward ? a.cy + a.halfH + gap : a.cy - a.halfH - gap
      // 防塌陷守卫只对向下方向生效：向上连线的 ey 天然小于 sy
      const ey = downward ? Math.max(b.cy - b.halfH - gap - 1, sy + 8) : b.cy + b.halfH + gap + 1
      arcs.push({ d: `M ${a.cx},${sy} L ${b.cx},${ey}`, dashed, label, labelX: a.cx, labelY: (sy + ey) / 2 + (downward ? -7 : 13) })
      continue
    }
    const forward = b.cx > a.cx
    const dx = Math.sign(b.cx - a.cx)
    const sx = a.cx + dx * (a.halfW + gap)
    const ex = b.cx - dx * (b.halfW + gap + 1)
    const sy = a.cy
    const ey = b.cy
    const sameRow = Math.abs(b.cy - a.cy) < 20
    const spanLanes = Math.abs(b.cx - a.cx) / Math.max(1, laneWidth)
    if (forward && !(sameRow && spanLanes > 1.5)) {
      // 正向且不需要绕行：行内缓曲线
      const c1x = sx + (ex - sx) * 0.25
      const c2x = sx + (ex - sx) * 0.75
      const labelY = sameRow ? Math.min(a.cy - a.halfH, b.cy - b.halfH) - 7 : (sy + ey) / 2 - 7
      arcs.push({ d: `M ${sx},${sy} C ${c1x},${sy} ${c2x},${ey} ${ex},${ey}`, dashed, label, labelX: (sx + ex) / 2, labelY })
      continue
    }
    // 反向边（或跨多列同行正向边）：统一走底部弧线。
    // 取两端行底以下 40px 为弧顶参照，确保低于一切药丸；容器按需加高。
    const yc = Math.max(a.cy, b.cy) + 40
    if (yc + 4 > backwardDrop) backwardDrop = yc + 4
    const c1x = sx + (ex - sx) * 0.2
    const c2x = sx + (ex - sx) * 0.8
    arcs.push({ d: `M ${sx},${sy} C ${c1x},${yc} ${c2x},${yc} ${ex},${ey}`, dashed, label, labelX: (sx + ex) / 2, labelY: yc + 13 })
  }
  return { arcs, backwardDrop }
}

/** Fit edge captions into the canvas and give nearby captions separate rows where space permits. */
export function placeDiagramCaptions(arcs, width, height) {
  const placed = []
  const maxWidth = Math.max(1, Math.min(120, width * 0.33))
  return arcs.map((arc) => {
    if (arc.label === null) return arc
    const textWidth = [...arc.label.slice(0, 160)].reduce((total, char) => total + (char.charCodeAt(0) < 128 ? 6 : 10), 0)
    const halfWidth = Math.min(textWidth, maxWidth) / 2
    const halfHeight = Math.min(height / 2, Math.ceil(textWidth / maxWidth) * 6.5)
    const labelX = Math.min(width - halfWidth, Math.max(halfWidth, arc.labelX))
    const limitY = (y) => Math.min(height - halfHeight, Math.max(halfHeight, y))
    const step = 2 * halfHeight + 3
    const choices = [0, -step, step, -2 * step, 2 * step].map((offset) => limitY(arc.labelY + offset))
    const collision = (y) => placed.some((box) => Math.abs(box.x - labelX) < box.halfWidth + halfWidth + 2
      && Math.abs(box.y - y) < box.halfHeight + halfHeight + 2)
    const labelY = choices.find((y) => !collision(y)) ?? choices[0]
    placed.push({ x: labelX, y: labelY, halfWidth, halfHeight })
    return { ...arc, labelX, labelY }
  })
}

/** 近似锚点（无实测环境用）：等宽列中心 + 定高药丸。 */
export function diagramFallbackAnchors(slots, laneCount, head, pill, gap) {
  const anchors = {}
  slots.forEach((laneNodes, li) => {
    laneNodes.forEach((node, si) => {
      anchors[node.props?.id] = {
        cx: ((li + 0.5) / laneCount) * 360,
        cy: head + si * (pill + gap) + pill / 2,
        halfW: 40,
        halfH: pill / 2,
      }
    })
  })
  return anchors
}
