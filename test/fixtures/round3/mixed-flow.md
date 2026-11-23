先说结论：命中率从 60% 提到 80%，后台压力大约减半。这不是精确预测，只是按同样请求量做的比例估算。

```iui
<ui density="compact" title="后台压力对比" fallback="120 请求 → 60 请求">
  <row>
    <metric label="命中率 60%" value="120" unit=" 请求"/>
    <metric label="命中率 80%" value="60" unit=" 请求" tone="success"/>
  </row>
</ui>
```

为什么收益这么大：每 300 个请求里，命中率每 10 个百分点就是 30 个请求被缓存挡在后台之外。

```iui
<ui density="inline" title="缓存挡下的请求占比" fallback="60% 时挡下 180，80% 时挡下 240">
  <progress label="挡下请求占比" value="80" max="100" tone="success"/>
  <p><text>300 个请求中，约 </text><b text="240" strong="true"/><text> 个由缓存直接完成。</text></p>
</ui>
```

实际收益还要看缓存一致性和失效成本，别只看命中率。
