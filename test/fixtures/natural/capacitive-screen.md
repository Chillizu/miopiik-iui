**手指隔着玻璃也能被检测到。** 以自电容检测为例，手指靠近电极时形成额外的电容耦合。控制器比较电极和静止基线的读数，就能寻找变化最大的区域。

```iui
<ui density="auto" fallback="触摸时，手指与屏幕电极之间的耦合使自电容读数升高。">
  <state name="touch" value="false"/>
  <state name="x" value="55"/>
  <derive name="capacitance" expr="$state.touch ? 4.0 : 3.2"/>
  <derive name="lead" expr="$state.x + 11"/>
  <row>
    <toggle label="手指触碰屏幕" bind="$state.touch"/>
    <metric label="电极自电容（示意）" value="$state.capacitance" unit=" pF" weight="primary"/>
  </row>
  <slider label="触点横向位置" bind="$state.x" min="36" max="74" step="1"/>
  <drawing width="360" height="210" label="手机正视和自电容屏剖面。切换触碰可看到手指与感应电极之间新增的耦合。">
    <rect x="14" y="25" width="82" height="156" rx="14" fill="surface" stroke="border"/>
    <rect x="23" y="37" width="64" height="120" rx="7" fill="none" stroke="border"/>
    <line x1="46" y1="166" x2="64" y2="166" stroke="muted" stroke-width="2"/>
    <label x="55" y="198" text="手机正视" size="12" align="middle" fill="muted"/>
    <circle cx="$state.x" cy="96" r="9" fill="none" stroke="muted" when="$state.touch" is="false"/>
    <circle cx="$state.x" cy="96" r="9" fill="accent" when="$state.touch"/>
    <line x1="$state.lead" y1="96" x2="118" y2="106" stroke="muted"/>

    <rect x="118" y="106" width="228" height="24" rx="4" fill="surface" stroke="border"/>
    <rect x="118" y="132" width="228" height="36" rx="4" fill="surface" stroke="border"/>
    <rect x="181" y="137" width="93" height="7" rx="3" fill="info"/>
    <rect x="118" y="170" width="228" height="11" rx="4" fill="surface" stroke="border"/>
    <label x="337" y="123" text="盖板玻璃" size="11" align="end" fill="text"/>
    <label x="337" y="151" text="感应电极" size="11" align="end" fill="text"/>
    <label x="232" y="198" text="屏幕剖面" size="12" align="middle" fill="muted"/>

    <path d="M 253 25 C 263 34 258 47 250 58 L 228 95 Q 223 104 214 102 Q 203 100 204 88 L 219 36 Q 223 24 235 22 Q 246 19 253 25 Z" fill="surface" stroke="accent" when="$state.touch"/>
    <circle cx="217" cy="105" r="3" fill="accent" when="$state.touch"/>
    <path d="M 210 108 Q 193 118 190 136" fill="none" stroke="accent" stroke-width="1.5" when="$state.touch"/>
    <path d="M 217 109 Q 218 125 218 136" fill="none" stroke="accent" stroke-width="1.5" when="$state.touch"/>
    <path d="M 224 108 Q 244 118 248 136" fill="none" stroke="accent" stroke-width="1.5" when="$state.touch"/>
    <label x="278" y="75" text="手指" size="12" fill="accent" when="$state.touch"/>
    <label x="232" y="78" text="未触碰" size="12" align="middle" fill="muted" when="$state.touch" is="false"/>
  </drawing>
</ui>
```

左图中的触点可以横向移动，右边仍画的是同一种电极剖面。3.2 和 4.0 pF 是演示读数。真实屏幕会轮询整片电极阵列，并从相邻电极的变化估算触点位置。
