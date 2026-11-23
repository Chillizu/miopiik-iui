import test from 'node:test'
import assert from 'node:assert/strict'
import { localActionValue, validateAst, writeStatePath } from '../shared/iui-ast.js'
import { parseMiopiikMl } from '../shared/miopiik-ml.js'

test('local buttons bind to owned state without adding a clipboard or network action', () => {
  const parsed = parseMiopiikMl(`<ui><state name="tokens" value="[0,1]"/>
    <button label="追加" action="append" bind="$state.tokens" value="3" max="4"/>
    <button label="撤销" action="pop" bind="$state.tokens" min="2"/>
    <button label="复位" action="reset" bind="$state.tokens"/>
    <button label="清空" action="set" bind="$state.tokens" value="[]"/>
    <button label="复制" action="copy" value="文本"/>
  </ui>`)
  assert.equal(parsed.ok, true)
  const { ast, degraded } = validateAst(parsed.doc)
  assert.equal(degraded, 0)
  const [append, pop, reset, set, copy] = ast.root.children.map(node => node.props)
  let state = ast.state
  function fire(props) {
    const next = localActionValue(state, ast.state, props, props.value)
    if (next !== undefined) state = writeStatePath(state, 'tokens', next)
  }
  fire(pop)
  assert.deepEqual(state.tokens, [0, 1])
  fire(append)
  assert.deepEqual(state.tokens, [0, 1, 3])
  fire(append)
  fire(append)
  assert.deepEqual(state.tokens, [0, 1, 3, 3])
  fire(pop)
  assert.deepEqual(state.tokens, [0, 1, 3])
  fire(set)
  assert.deepEqual(state.tokens, [])
  fire(reset)
  assert.deepEqual(state.tokens, [0, 1])
  assert.equal(localActionValue(state, ast.state, copy, copy.value), undefined)
  assert.deepEqual(ast.state.tokens, [0, 1])
})

test('invalid or program-external button actions degrade locally and cannot collide with derived paths', () => {
  const parsed = parseMiopiikMl(`<ui><state name="tokens" value="[0,1]"/>
    <derive name="next" expr="42"/>
    <button label="写下一值" action="set" bind="$state.next" value="2"/>
    <button label="超出上限" action="append" bind="$state.tokens" value="1" max="129"/>
    <button label="不安全绑定" action="pop" bind="$state.__proto__.sample"/>
    <button label="无值" action="append" bind="$state.tokens"/>
    <button label="不允许" action="send" value="1"/>
  </ui>`)
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 5)
  assert.equal(checked.derivePlan.length, 0)
  assert.equal(checked.ast.root.children.filter(node => node.type === 'button').length, 1)
})
