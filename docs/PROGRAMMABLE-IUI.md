# IUI 局部程序与绘图

MiOpIIk IUI 0.2.0-rc.2 在 DSH 聊天中渲染声明式程序。控件触发局部状态转换，派生表达式重算，文字、表格、图表和图形从同一份结果更新。每个片段有独立的状态与预算。

## 交互和计算

| 动作 | 作用 |
| --- | --- |
| `set` | 将 `value` 写到 `bind` |
| `append` | 把 `value` 加到数组末尾，`max` 缺省为 32，最多 128 项 |
| `pop` | 删除数组的末项，保留至少 `min` 项，缺省为 0 |
| `reset` | 恢复 `bind` 对应的初始值 |
| `copy` | 用户点击后将 `value` 写入剪贴板 |

局部动作沿用 `$state.*` 绑定。写入经过原有状态预算，派生路径为只读。输出超出预算时保留上一个状态。

- `len(a)`、`at(a,i)`、`gather(a,indices)` 和 `join(a,separator)` 适合序列。索引从零开始。
- `dot(a,b)`、`matvec(m,v)`、`scale(a,k)`、`softmax(a)` 和 `roundEach(a,n)` 适合数值计算。softmax 使用减最大值的形式归一化，矩阵最多 4,096 个元素。
- `zip(a,b,…)` 将 2–6 个等长数组按位置合成二维表格。数组每维最多 128 项，求值另有运算次数与结果预算。

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

`fill` 和 `stroke` 使用 `text`、`muted`、`border`、`surface`、`accent`、`neutral`、`success`、`warning`、`danger`、`info` 或 `none`。用 `stroke-width` 指定线宽，`opacity` 接收 0–1 的数字或绑定。

同一幅 `drawing` 可包含最多六个 `<view label="条件" caption="图注">`。直接放在 `drawing` 下的形状始终共用，`view` 容纳该条件的图形。一个可用视图直接呈现图和图注。至少两个可用视图时，宿主在图旁显示切换选项，并默认显示第一个可用条件。按声明顺序绘制，共享和各条件合计最多 64 个图形。直线的 `stroke-dasharray` 可用有界的数字列表，例如 `"3 4"`。

`density="auto"` 的完整回复会把略超边缘的静态矩形、圆形和直线收入画幅。共享图层与各个视图使用同一画幅，切换时位置和比例保持一致。带 `x`、`y` 的绘图内 `text` 沿用 `label` 的文字、绑定和几何规则。

`chart.series` 与 `table.rows` 支持 `derive` 所用的纯表达式，例如 `series='[["当前",$state.cap],["参考",100]]'`。求值后仍按图表和表格预算进行校验。无法计算的节点可写 `fallback="一句话说明这部分"`，保留自然语言解释。

[电容屏示例](../test/fixtures/natural/capacitive-screen.md)组合手机正视图、盖板与电极剖面。触摸前后的 pF 读数为教学示意。互电容与自电容测量方式各有不同的量和变化方向。[Infineon 电容触摸传感设计指南](https://www.infineon.com/dgdl/Infineon-AN234185_PSOC_4_CAPSENSE_touchpad_design_guide-ApplicationNotes-v03_00-EN.pdf?fileId=8ac78c8c8e7ead30018ee43d60a1036a)

## 候选验收

两份示例在 DSH 0.2.2-rc.1 的独立 Web profile 中回放，覆盖 1,280、420 和 360 像素宽度。解码器在追加猫、追加狗和撤销分支重算，并在单独调温时保持注意力不变。电容屏示例的触点和触摸反馈可在浏览器内操作。

生成测试统一走 `deepseek-official/deepseek-flash`（DeepSeek V4.1 Flash）。原题生成的手机可以切换壁纸，普通短答保持纯文字。包含坐标绑定提示的电容屏题生成了联动触点和相邻单元条形图，部分附加读数仍写法有误。解码器生成结果在原题和提示版中均未通过数值与温度验算。完整的解码器验算来自上面的手写示例。
