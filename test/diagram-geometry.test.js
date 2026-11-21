import test from 'node:test'
import assert from 'node:assert/strict'

import { diagramEdges, diagramFallbackAnchors } from '../shared/diagram-geometry.js'

// 合成锚点：与真实药丸同构（cx/cy 为中心，halfW/halfH 为半宽高）
const anchors = {
  a: { cx: 100, cy: 50, halfW: 40, halfH: 22 },
  b: { cx: 300, cy: 50, halfW: 40, halfH: 22 },
  c: { cx: 300, cy: 150, halfW: 40, halfH: 22 },
  e: { cx: 900, cy: 50, halfW: 40, halfH: 22 },
}

test('diagramEdges：正向相邻边端点贴源/目标药丸边缘，行内缓曲线', () => {
  const { arcs, backwardDrop } = diagramEdges([{ props: { from: 'a', to: 'b' } }], anchors, 200)
  assert.equal(arcs.length, 1)
  assert.match(arcs[0].d, /^M 143,50 /u, '起点应为源药丸右缘外 3px')
  assert.match(arcs[0].d, / 256,50$/u, '终点应停在目标药丸左缘外 1px')
  assert.equal(arcs[0].dashed, false)
  assert.equal(backwardDrop, 0, '正向相邻边不需要底部空间')
})

test('diagramEdges：反向边走底部弧线，与同对正向边分离；dashed 保留', () => {
  const { arcs, backwardDrop } = diagramEdges([{ props: { from: 'b', to: 'a', kind: 'dashed', label: '发布' } }], anchors, 200)
  assert.equal(arcs.length, 1)
  assert.equal(arcs[0].dashed, true, '虚线语义必须保留在路径上')
  assert.match(arcs[0].d, /^M 257,50 /u, '反向边从源药丸左缘出发')
  assert.match(arcs[0].d, / 144,50$/u, '回到目标药丸右缘')
  assert.match(arcs[0].d, /,90 /u, '控制点应抬到行底以下 40px 的底部弧线')
  assert.ok(backwardDrop >= 94, '底部弧线需要容器留出空间')
  assert.equal(arcs[0].label, '发布')
  assert.ok(Math.abs(arcs[0].labelY - 103) < 0.01, '反向边标签应在弧线下方')
})

test('diagramEdges：同列双向纵线方向感知，标签错开', () => {
  const down = diagramEdges([{ props: { from: 'b', to: 'c', label: '下' } }], anchors, 200).arcs[0]
  assert.match(down.d, /^M 300,75 L 300,124$/u)
  assert.ok(Math.abs(down.labelY - 92.5) < 0.01, '下行标签在线上方')

  const up = diagramEdges([{ props: { from: 'c', to: 'b', label: '上' } }], anchors, 200).arcs[0]
  assert.match(up.d, /^M 300,125 L 300,76$/u)
  assert.ok(Math.abs(up.labelY - 113.5) < 0.01, '上行标签在线下方')
})

test('diagramEdges：跨多列同行正向边绕底部，不穿中间药丸', () => {
  const { arcs, backwardDrop } = diagramEdges([{ props: { from: 'a', to: 'e' } }], anchors, 200)
  assert.equal(arcs.length, 1)
  assert.match(arcs[0].d, /,90 /u, '跨列同行也应走底部弧线')
  assert.ok(backwardDrop >= 94)
})

test('diagramEdges：未知引用与自环直接跳过', () => {
  const { arcs } = diagramEdges([
    { props: { from: 'a', to: 'ghost' } },
    { props: { from: 'a', to: 'a' } },
    { props: { from: 'a', to: 'b' } },
  ], anchors, 200)
  assert.equal(arcs.length, 1)
})

test('diagramFallbackAnchors：等宽列中心 + 定高药丸，行距 58', () => {
  const slots = [[{ props: { id: 'x' } }], [{ props: { id: 'y' } }, { props: { id: 'z' } }]]
  const fallback = diagramFallbackAnchors(slots, 2, 30, 44, 14)
  assert.equal(fallback.x.cx, 90)
  assert.equal(fallback.x.cy, 52)
  assert.equal(fallback.y.cx, 270)
  assert.equal(fallback.z.cy, 52 + 58)
  assert.equal(fallback.z.halfH, 22)
})
