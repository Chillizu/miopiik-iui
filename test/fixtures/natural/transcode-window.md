**默认的两个小时只能清掉 80 个任务。** 队列里有 180 个待转码文件，平均每个占用一个工作槽 6 分钟。要在两小时内清完，至少需要 9 个并行槽。

```iui
<ui density="auto" title="试算转码窗口" fallback="4 个工作槽每 2 小时完成约 80 个任务，剩余 100 个。">
  <state name="r" value='{"hours":2,"slots":4}'/>
  <derive name="d.done" expr="min(180, $state.r.hours * 10 * $state.r.slots)"/>
  <derive name="d.remaining" expr="180 - $state.d.done"/>
  <derive name="d.backlog" expr="$state.d.remaining &gt; 0"/>
  <segmented label="可用时间" bind="$state.r.hours" options='[{"label":"2 小时","value":2},{"label":"4 小时","value":4}]'/>
  <slider label="并行工作槽" bind="$state.r.slots" min="1" max="12" step="1"/>
  <progress label="可处理任务" value="$state.d.done" max="180"/>
  <metric label="剩余任务" value="$state.d.remaining" unit=" 个" weight="primary"/>
  <p when="$state.d.backlog"><badge text="有积压" tone="warning"/> 下个窗口仍需处理剩余文件。</p>
  <p when="$state.d.remaining" is="0"><badge text="预计清空" tone="success"/> 当前窗口可处理完整批次。</p>
  <details label="查看任务流">
    <diagram title="批次转码" source="按给定耗时估算">
      <node id="queue" label="待转码" note="180 个"/>
      <node id="completed" label="本窗口处理" note="$state.d.done"/>
      <node id="carry" label="下窗口积压" note="$state.d.remaining" when="$state.d.backlog"/>
      <edge from="queue" to="completed"/>
      <edge from="queue" to="carry" kind="dashed"/>
    </diagram>
  </details>
</ui>
```

实际安排时给长文件和重试留余量。若必须在两小时内完成，先确认机器能稳定支撑至少 9 个并行槽。
