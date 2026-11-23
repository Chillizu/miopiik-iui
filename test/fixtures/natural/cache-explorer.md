**回源从 120 次降到 60 次。** 按 {{badge:neutral:300 次请求}} 估算，命中率从 60% 到 80% 时，后台处理的请求数减半。

```iui
<ui density="auto" fallback="300 次请求，命中率 80% 时预计回源 60 次。">
  <state name="hit" value="80"/>
  <derive name="origin" expr="round(300 * (100 - $state.hit) / 100)"/>
  <slider label="缓存命中率" bind="$state.hit" min="50" max="100" step="5" unit="%"/>
  <metric label="预计回源" value="$state.origin" unit=" 次" weight="primary"/>
  <details label="查看计算口径">
    <p>回源次数 = 300 ×（1 − 命中率），结果取整。这里假定所有请求都能先查缓存。</p>
  </details>
</ui>
```

排查机器是否能缩容时，再看**回源请求的平均成本**。如果新命中的是便宜请求，CPU 降幅可能小于 50%。
