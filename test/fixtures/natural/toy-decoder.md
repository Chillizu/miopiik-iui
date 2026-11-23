先追加「猫」或「狗」，再对照注意力和输出概率。这两个词的 **K 都是 2**，所以注意力分配相同。它们的 V 分别是 2 和 −1，会把加权结果推向不同方向。

```iui
<ui density="auto" fallback="从「我 → 爱」开始。只输出一步概率，暂不自动采样。">
  <state name="vocab" value='["我","爱","看","猫","狗","。"]'/>
  <state name="keys" value='[0,1,1,2,2,0]'/>
  <state name="values" value='[1,0,1,2,-1,0]'/>
  <state name="head" value='[[0.1,-0.4],[0,-0.6],[0.5,-0.2],[2,0.3],[-1,1],[0.8,-0.2]]'/>
  <state name="tokens" value='[0,1]'/>
  <state name="temperature" value="1"/>
  <derive name="count" expr="len($state.tokens)"/>
  <derive name="last" expr="at($state.tokens, $state.count - 1)"/>
  <derive name="query" expr="at($state.keys, $state.last)"/>
  <derive name="names" expr="gather($state.vocab, $state.tokens)"/>
  <derive name="keySeq" expr="gather($state.keys, $state.tokens)"/>
  <derive name="valueSeq" expr="gather($state.values, $state.tokens)"/>
  <derive name="scores" expr="scale($state.keySeq, $state.query)"/>
  <derive name="weights" expr="softmax($state.scores)"/>
  <derive name="hidden" expr="dot($state.weights, $state.valueSeq)"/>
  <derive name="shownHidden" expr="at(roundEach([$state.hidden], 4), 0)"/>
  <derive name="logits" expr="matvec($state.head, [$state.hidden, 1])"/>
  <derive name="probs" expr="softmax(scale($state.logits, 1 / $state.temperature))"/>
  <derive name="sequence" expr='join($state.names, " → ")'/>
  <derive name="attentionRows" expr="zip($state.names, $state.keySeq, $state.valueSeq, $state.scores, roundEach($state.weights, 4))"/>
  <derive name="probRows" expr="zip($state.vocab, roundEach($state.logits, 4), roundEach(scale($state.probs, 100), 2))"/>

  <row>
    <metric label="当前序列" value="$state.sequence" weight="primary"/>
    <metric label="末词的 Q" value="$state.query"/>
    <metric label="加权结果 h" value="$state.shownHidden" weight="primary"/>
  </row>
  <row>
    <button label="追加「看」" action="append" bind="$state.tokens" value="2" max="6"/>
    <button label="追加「猫」" action="append" bind="$state.tokens" value="3" max="6"/>
    <button label="追加「狗」" action="append" bind="$state.tokens" value="4" max="6"/>
    <button label="追加「。」" action="append" bind="$state.tokens" value="5" max="6"/>
    <button label="撤销末词" action="pop" bind="$state.tokens" min="2"/>
    <button label="重置序列" action="reset" bind="$state.tokens"/>
  </row>

  <table columns='["当前位置","K","V","Q·K","注意力权重"]' rows="$state.attentionRows" caption="末词对当前序列的自注意力"/>
  <slider label="输出温度" bind="$state.temperature" min="0.25" max="2" step="0.25"/>
  <table columns='["候选词","原始 logit","下一词概率 (%)"]' rows="$state.probRows" caption="六个候选词经过 softmax 的概率"/>
</ui>
```

这里取词嵌入的第一维作为 Q 和 K，第二维作为 V。输出层沿用「猫」的 2h + 0.3、「狗」的 1 − h 和「。」的 0.8h − 0.2。「我、爱、看」使用为这个示例补充的输出系数。温度只作用于输出分布，所以调整它时，注意力和加权结果 h 都应保持原值。
