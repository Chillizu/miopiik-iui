# IUI 局部程序与绘图

MiOpIIk IUI 在 DSH 聊天中渲染声明式程序。控件触发局部状态转换，派生表达式重算，文字、表格、图表和图形从同一份结果更新。每个片段有独立的状态与预算。

## 交互和计算

| 动作 | 作用 |
| --- | --- |
| `set` | 将 `value` 写到 `bind` |
| `append` | 把 `value` 加到数组末尾，`max` 缺省为 32，最多 128 项 |
| `pop` | 删除数组的末项，保留至少 `min` 项，缺省为 0 |
| `reset` | 恢复 `bind` 对应的初始值 |
| `copy` | 用户点击后将 `value` 写入剪贴板 |

局部动作沿用 `$state.*` 绑定。写入经过原有状态预算，派生路径为只读。输出超出预算时保留上一个状态。

`slider` 或带 `scrub` 的线性折线可写 `play="6"`，让读者点击播放，用 6 秒走完时间范围。其余图形和读数可共用这一个时刻。时长范围为 0.5–60 秒。暂停后可继续，拖动滑杆或选择阶段点会停在指定时刻，抵达终点可重播。离开页面时暂停，返回后由读者重新播放。

`metric.value`、`metric.delta`、`progress.value` 和 `progress.max` 支持现有的字面量和状态绑定，也可以写引用 `$state` 的纯算式。例如 `<metric label="通过率" value="round($state.passed / $state.total * 100, 1)" unit="%"/>`。一项计算由多个图形或读数引用时，可以用 `derive` 给它命名。无效的求值结果显示为不可用，进度的上限必须是正数。

在绑定了本地状态的 `views` 内，可以让不同 `view` 提供同名 `derive`。根据绑定值选中的情景参与计算，页面其他图和读数都能读取它的结果。共用公式可放在外层，也可引用当前情景的结果。初始化选择时使用某个 `view.value`。同一情景内的重复名、可同时激活的冲突路径和依赖环仍会有对应诊断。

- `len(a)`、`at(a,i)`、`gather(a,indices)` 和 `join(a,separator)` 适合序列。索引从零开始。
- `dot(a,b)`、`matvec(m,v)`、`scale(a,k)`、`softmax(a)` 和 `roundEach(a,n)` 适合数值计算。softmax 使用减最大值的形式归一化，矩阵最多 4,096 个元素。
- `zip(a,b,…)` 将 2–6 个等长数组按位置合成二维表格。数组每维最多 128 项，求值另有运算次数与结果预算。
- `sqrt(x)` 可计算非负数的平方根，`hypot(x,y)` 可计算平面位移的长度。`x^n` 是数学乘方，由右至左结合。三角函数以弧度为单位，`atan2(y,x)*180/pi` 将方向换算成度数。输入和结果均须为有限数。

[微型 Transformer 回复](../test/fixtures/natural/toy-decoder.md)允许连续追加 token、撤销或复位。它用教学参数计算末 token 的注意力和所属词表的下一 token 概率。调温度只影响输出分布；追加 token 改变上下文，触发注意力与输出重算。

## 自定义绘图

`drawing` 用固定逻辑画布和主题色组合矩形、圆、线、平面路径和文字。几何参数、颜色与文字可以读绑定，元素用 `when` / `is` 显隐。SVG 路径由语法、数值和长度检查；宿主统一决定比例、裁剪和颜色。

| 元素 | 常用参数 |
| --- | --- |
| `drawing` | `width height label` |
| `rect` | `x y width height rx` |
| `circle` | `cx cy r` |
| `line` | `x1 y1 x2 y2` |
| `path` | `d` |
| `label` | `x y text size align` |

位置可以写成一对 `[x,y]`。`rect`、`circle` 和 `label` 读 `at`，`line` 读 `from` 和 `to`，`path` 读 2–32 个点的 `points` 并画成折线。标签可以用 `dx` 和 `dy` 从共用点旁移。位置可填 JSON 数组、完整绑定或引用本地状态的表达式。同一个图元使用一套坐标写法。

`polar(center, radius, angle)` 从中心、半径和角度得到一个点。`rotate(point, center, angle)` 把已有点绕中心旋转。输入的点和返回结果都是 `[x,y]`，角度用弧度。画布向下为正，正角在屏幕上顺时针。半径可用负数表示中心另一侧的端点。把移动的端点写成一项 `derive`，线段、圆点、标签和读数就能引用同一位置。

```xml
<state name="start" value="[40,80]"/>
<state name="target" value="[160,40]"/>
<drawing width="210" height="100" label="路径与目的地">
  <path points='[$state.start,[100,80],$state.target]' stroke="accent"/>
  <circle at="$state.target" r="5" fill="accent"/>
  <label at="$state.target" dy="-12" align="middle" text="目的地"/>
</drawing>
```

`fill` 和 `stroke` 使用 `text`、`muted`、`border`、`surface`、`accent`、`neutral`、`success`、`warning`、`danger`、`info` 或 `none`。用 `stroke="$state.online ? 'success' : 'border'"` 可让描边随状态变化，求值后仍从同一组主题色选取。用 `stroke-width` 指定线宽，`opacity` 接收 0–1 的数字或绑定。

同一幅 `drawing` 可包含最多六个 `<view label="条件" caption="图注">`。直接放在 `drawing` 下的形状始终共用，`view` 容纳该条件的图形。一个可用视图直接呈现图和图注。至少两个可用视图时，宿主在图旁显示切换选项。独立使用时默认显示第一个可用条件。按声明顺序绘制，共享和各条件合计最多声明 64 个图元。直线的 `stroke-dasharray` 可用有界的数字列表，例如 `"3 4"`。

`drawing` 和 `views` 都能用 `bind="$state.mode"` 共享当前选择。绑定时声明 2–6 个视图，每个 `view` 的 `value` 使用不同的 JSON 标量，并把一个可用值设为初始状态。选择器、外部操作、图形和读数共读这份状态。只需更新共享图形时，视图可以只提供标题和图注。

`density="auto"` 的完整回复会把略超边缘的静态图形收入画幅。路径和贴边文字使用浏览器的实际几何边界，结果在同一份绘图的交互中复用。静态绘图按共享图层与各个视图的总范围收紧过大的上下留白，切换时画幅、位置和比例一致。含动态几何或 `repeat` 的绘图沿用原画幅高度。带 `x`、`y` 的绘图内 `text` 沿用 `label` 的文字、绑定和几何规则。

在自适应绘图中，当前 `view` 的标注会替换同坐标、同对齐方式的共享标注。相邻标注叠在一起时，可在画幅内小幅上下让位。引线、图形、标注的横坐标和对齐方式保持作者声明所表达的关系。

自适应列会把连续读数组成一行，宽度不足时自动换行。读数紧随绘图时，读数组居中靠近图注。正文和控件仍按声明顺序呈现。

当适配后的标注在屏幕上小于 11 像素时，读者可以用「放大图解」在局部查看。放大沿用同一个画幅和视图状态，按比例把标注放到至少 12 像素，并允许在图内滚动。按 Esc 或选择「恢复原比例」可回到内嵌视图。

`repeat` 在 `drawing` 或绘图的 `view` 内复用一组图元。`items` 接收 JSON 数组、完整绑定或返回数组的纯表达式。模板内用 `$data.item` 读取当前项，`$data.index` 从零开始。坐标、文字和 `when` 条件也可以结合 `$state`。重复图元沿用共享画幅。每个视图连同共享图元最多展开 64 个图元。超限的重复组显示提示，普通图元仍可阅读。

```xml
<repeat items='[{"x":40,"name":"入口"},{"x":160,"name":"出口"}]'>
  <circle cx="$data.item.x" cy="38" r="5" fill="accent"/>
  <label x="$data.item.x" y="60" text="$data.item.name" align="middle"/>
</repeat>
```

`chart.series` 与 `table.rows` 支持 `derive` 所用的纯表达式，例如 `series='[["当前",$state.cap],["参考",100]]'`。求值后仍按图表和表格预算进行校验。无法计算的节点可写 `fallback="一句话说明这部分"`，保留自然语言解释。

`chart kind="interval"` 给持续时段和数值范围共用一条轴。每项是 `[轨道, 起点, 终点, 标签, 可选主题色]`，最多 8 条轨道、60 个区间。同一轨道里重叠的区间会排在不同行。可用 `domain="[0,6]"` 给不同状态提供共同的基准范围。数据超出基准时，横轴会扩展到完整范围。省略时从所有起止值求范围。`series` 可读同一份本地状态或派生结果。选中区间会显示完整标签及起止值。

区间图和线性折线可共用一条时间线。用 `marks='[[0,"开始"],[2,"条件改变"]]'` 标记阶段，只显示轴范围内的标记。用 `cursor="$state.time"` 跟随另一处控件，或者用 `scrub="观察时刻"` 自带滑轨。滑轨可用 `bind="$state.time"` 同步其他图和读数，`play="6"` 提供由读者启动的播放。区间图也接受单独的 `bind`，可点区间起点或阶段标签更新同一时刻。区间在起点高亮，到终点解除高亮。超出图的时间范围时，轴上不显示游标。

[电容屏示例](../test/fixtures/natural/capacitive-screen.md)组合手机正视图、盖板与电极剖面。触摸前后的 pF 读数为教学示意。互电容与自电容测量方式各有不同的量和变化方向。[Infineon 电容触摸传感设计指南](https://www.infineon.com/dgdl/Infineon-AN234185_PSOC_4_CAPSENSE_touchpad_design_guide-ApplicationNotes-v03_00-EN.pdf?fileId=8ac78c8c8e7ead30018ee43d60a1036a)

## 候选验收

两份示例在 DSH 0.2.2-rc.1 的独立 Web profile 中回放，覆盖 1,280、420 和 360 像素宽度。解码器在追加猫、追加狗和撤销分支重算，并在单独调温时保持注意力不变。电容屏示例的触点和触摸反馈可在浏览器内操作。

生成测试统一走 `deepseek-official/deepseek-flash`（DeepSeek V4.1 Flash）。原题生成的手机可以切换壁纸，普通短答保持纯文字。包含坐标绑定提示的电容屏题生成了联动触点和相邻单元条形图，部分附加读数仍写法有误。解码器生成结果在原题和提示版中均未通过数值与温度验算。完整的解码器验算来自上面的手写示例。
