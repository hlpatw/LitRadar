<!-- miaoda-design-guide: managed preset=pm-spec -->
---
version: alpha
name: pm-spec
name_zh: 规格蓝本
description: >-
  单页产品规格 / PRD 风格：冷灰蓝纸面（bg #f5f7fa / paper 白）承载浓密文档流，
  靛紫强调色 #4a36e3 仅点缀状态胶囊、引用块、指标目标与里程碑徽章；正文用 system-serif
  Charter 起标题、系统无衬线走正文、等宽体承担全部 uppercase 微标签（面包屑 / 表头 /
  徽章 / 页脚）。无阴影，层级只靠 1px 细线 (#e2e6ee) + 10px 圆角卡片。信息块以 grid
  可在适合长文档精读的场景中使用纸面内容流与局部分栏。它定义文档气质，不强制所有主题采用同一种页面骨架。
colors:
  bg: "#f5f7fa"
  paper: "#ffffff"
  ink: "#0e1322"
  muted: "#5a647a"
  line: "#e2e6ee"
  line-strong: "#c8cfdb"
  accent: "#4a36e3"
  accent-soft: "#ece8ff"
  warn: "#b8741a"
  positive: "#1f8a5a"
  th-bg: "#f8fafd"
  accent-grad-end: "#8473ff"
typography:
  h1:
    fontFamily: "'Charter', Georgia, 'PingFang SC', 'Noto Serif SC', serif"
    fontSize: "42px"
    lineHeight: "1.06"
    letterSpacing: "-0.015em"
    fontWeight: "700"
  h2:
    fontFamily: "'Charter', Georgia, 'PingFang SC', 'Noto Serif SC', serif"
    fontSize: "24px"
    letterSpacing: "-0.005em"
  h2-small:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, 'PingFang SC', sans-serif"
    fontSize: "13px"
    fontWeight: "400"
    color: "{colors.muted}"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, 'PingFang SC', sans-serif"
    fontSize: "14.5px"
    lineHeight: "1.6"
  summary:
    fontSize: "17px"
    color: "{colors.muted}"
  quote:
    fontFamily: "'Charter', Georgia, 'PingFang SC', 'Noto Serif SC', serif"
    fontSize: "17px"
    lineHeight: "1.5"
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "10.5px"
    letterSpacing: "0.06em"
    textTransform: "uppercase"
    color: "{colors.muted}"
  crumb:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "11.5px"
    letterSpacing: "0.08em"
    textTransform: "uppercase"
    color: "{colors.muted}"
rounded:
  pill: "999px"
  card: "10px"
  quote: "6px"
  button: "8px"
  circle: "50%"
spacing:
  page-max: "1080px"
  page-pad: "0 32px 64px"
  section-gap: "40px"
  block-gap: "14px"
  card-pad: "22px 24px"
  meta-gap: "32px"
components:
  header-top:
    borderBottom: "1px solid {colors.line}"
    padding: "16px 0"
    description: "可选文档页头：面包屑、状态胶囊与 Owner/Updated/Reviewers 等 meta；仅在内容语义需要时使用"
  pill-draft:
    background: "{colors.accent-soft}"
    color: "{colors.accent}"
    borderRadius: "{rounded.pill}"
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    padding: "4px 10px"
  panel:
    background: "{colors.paper}"
    border: "1px solid {colors.line}"
    borderRadius: "{rounded.card}"
    padding: "{spacing.card-pad}"
  quote-block:
    background: "{colors.accent-soft}"
    borderLeft: "3px solid {colors.accent}"
    borderRadius: "{rounded.quote}"
    padding: "22px 24px"
  metric-table:
    background: "{colors.paper}"
    border: "1px solid {colors.line}"
    borderRadius: "{rounded.card}"
    description: "th 用 label 排版 + 背景 {colors.th-bg}；行分隔 1px {colors.line}"
  target-cell:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    color: "{colors.accent}"
    fontWeight: "600"
  story-num:
    background: "{colors.accent-soft}"
    color: "{colors.accent}"
    borderRadius: "{rounded.circle}"
  milestone-badge:
    background: "{colors.accent-soft}"
    color: "{colors.accent}"
    borderRadius: "{rounded.pill}"
  avatar:
    background: "linear-gradient(135deg, {colors.accent}, {colors.accent-grad-end})"
    color: "{colors.paper}"
    borderRadius: "{rounded.circle}"
anchors:
  - id: mono-uppercase-label
    type: token
    desc: 所有微标签（面包屑/表头/徽章/胶囊/页脚）走等宽体 + 全大写 + 字距，见 typography.label
  - id: accent-frugal
    type: pattern
    desc: 靛紫强调色（见 colors.accent）克制使用——只落状态胶囊、引用左边框、指标目标、里程碑徽章
  - id: borderless-cards
    type: pattern
    desc: 无阴影，卡片层级仅靠细线（colors.line）+ card 圆角，纸面浮在冷灰底上
  - id: serif-headings
    type: token
    desc: 标题用 system-serif Charter（typography.h1/h2），正文与标签走无衬线/等宽，三字体分工
  - id: pill-status
    type: component
    desc: 右上状态胶囊（Draft/Review/Approved）圆角全径 + 前置圆点，accent-soft 底
  - id: grid-blocks
    type: pattern
    desc: 对比型信息块可使用局部 grid 分栏，比例与列数按内容决定，窄屏自然收敛
  - id: single-column-flow
    type: pattern
    desc: 长文档场景可采用纸面内容流与 spacing.page-max 作为阅读宽度参考，不限制其他应用形态
gaps:
  - "源仅 Draft 一种状态胶囊配色（accent-soft/accent）；Review/Approved 的语义色未定义"
  - "warn (#b8741a) 与 positive (#1f8a5a) 在示例中作为 CSS 变量声明但正文未实际着色，用途待补"
  - "暗色模式未定义；仅浅色纸面"
  - "补充项：源字体全为 system/local（Charter/Georgia/Inter），无 webfont @import；下方为 Inter 兜底 @import，Charter 缺失时退 Georgia 系统衬线"
  - "补充项：源无 CJK 字形，已在 display/body fontFamily 末尾注入 PingFang SC 等系统兜底（非源值）"
exceptions:
  - accent 强调色允许在同屏出现多次（状态胶囊 + 指标目标 + 里程碑徽章 + 引用边框），因均属"结构性点缀"而非装饰
---

## Overview

把 PRD、规格说明与其他长文档型内容当作一页可精读的印刷文档来排：冷灰蓝底 `#f5f7fa` 上浮白色纸面卡片，靛紫 `#4a36e3` 作唯一强调色且极度克制。气质是"内部工具里的严肃文档"——衬线标题给权威感，等宽体承担所有元数据微标签，正文密而不挤（14.5px / 行高 1.6）。全程无阴影，深度只由 1px 细线与 10px 圆角表达。

文档头条、状态胶囊、Owner / Updated / Reviewers 元信息，以及 Problem / Goals / Metrics / Milestones 等都是 PRD 场景的组件示例。使用时只选择与输入内容匹配的部分；非 PRD 应保留原有任务结构，不为套风格改写成固定文档章节。

## Colors

- **底色 paper flow**：页面底 `#f5f7fa`，所有内容卡片纸面 `#ffffff`，形成"纸浮在灰底上"的文档层。
- **文字**：主文本 ink `#0e1322`；次要/元信息 muted `#5a647a`。
- **描边**：常规分隔 line `#e2e6ee`（卡片边框、行分隔、区块下边线）；强分隔 line-strong `#c8cfdb`（如禁用态 tick 底）。
- **强调 accent `#4a36e3`**：唯一主强调色，用于状态胶囊文字、引用左边框、指标目标值、里程碑徽章、故事序号、用户故事中的加粗角色词。配套浅底 accent-soft `#ece8ff` 做胶囊/徽章/序号圆的填充。
- **语义色**：positive `#1f8a5a`（达成态 tick "✓"）、warn `#b8741a`（预警，示例中声明未着色）。
- **辅助**：表头背景 th-bg `#f8fafd`；头像渐变 `linear-gradient(135deg, #4a36e3, #8473ff)`（accent → accent-grad-end）。

## Typography

三字体分工，各司其职，不得混用：
- **衬线（display）** `'Charter', Georgia, serif`：仅标题——h1 42px/行高 1.06/字距 -0.015em/700、h2 24px/字距 -0.005em、引用正文 17px/行高 1.5、目标列表小标题、里程碑标题、goal-list h3。非 PRD 内容改写出的分节标题同样必须走这一衬线 h2，不得因为内容变了就换回无衬线。
- **无衬线（body）** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif`：正文 14.5px/行高 1.6、摘要 17px（muted）、h2 副标题 13px、故事与问题文本。
- **等宽（mono）** `ui-monospace, SFMono-Regular, Menlo, monospace`：全部 uppercase 微标签——面包屑 11.5px/字距 0.08em、状态胶囊 11px/0.06em、表头 10.5px/0.06em、meta-row 标签 10.5px、里程碑徽章 10.5px、里程碑工期 11px、目标数值单元格、页脚 11.5px。

字体加载（消费侧指令，原样写入全局样式首行，**禁止用 `<link>` 标签代替**）：
```
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```
**HARD REQUIREMENT：字体栈与角色分工原样使用，禁止替换；上面这行 `@import` 必须以文本形式出现在全局 CSS 文件（或 `<style>` 标签）首行。禁止改写成 `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...">`——两者渲染效果相近，但后者不满足"原样写入 @import"的硬性要求，判为违规。** Charter / Georgia 为系统衬线，无需 webfont；CJK 内容退 PingFang SC 等系统兜底。

## Layout

- **阅读容器**：长文内容可参考 `max-width 1080px`、上下 `margin 28px auto` 和 `page-pad`；工具、工作台或数据应用可按任务需要使用更宽或不同的信息架构。
- **内容组织**：保留输入内容的语义结构。衬线标题、摘要、指标卡、图表和表格面板可按需组合，不要求每节同构。
- **区块间距**：`section` 间 `margin-top 40px`；块内 grid 间距统一 `14px`（block-gap）。
- **头部**：文档场景可使用 flex 两端对齐、`padding 16px 0` + 底部 1px line；应用导航形态由实际信息架构决定。
- **grid 分栏**：对比信息、指标和里程碑可使用局部网格，比例与列数按内容量决定，不继承 PRD 示例值。
- **元信息条**：`padding 16px 22px`，列间距 `32px`（meta-gap），标签在上（mono 小字）值在下。
- **响应式**：窄屏减少局部网格列数、缩小标题并维持阅读顺序。

## Elevation & Depth

**零阴影体系。** 所有卡片（panel/table/story/step/question/meta-row）深度仅由 `1px solid #e2e6ee` 边框 + `10px` 圆角 + 纸白背景在灰底上表达。引用块用 3px accent 左边框作强调而非投影。层级靠"纸面 vs 底色"的明度差，不靠 z 轴。**hover/focus/active 等交互态同样不得引入投影**——按钮、输入框、可点击卡片的状态反馈一律改用边框颜色变化（如切到 `{colors.accent}` 或 `{colors.line-strong}`）或背景色微调，不加哪怕是 `0 1px 2px` 的轻投影。

## Shapes

- **卡片圆角** `10px`（card）：面板、表格、故事、里程碑、问题、元信息条统一。
- **引用块** `6px`（quote）。
- **按钮/顶部动作胶囊** `8px`（button）。
- **全径胶囊** `999px`（pill）：状态胶囊、里程碑徽章。
- **圆形** `50%`（circle）：目标/非目标 tick、故事序号、头像、状态胶囊前置圆点。
- 强调面积小、以边框和圆角定义形状，不用大色块。

## Components

- **状态胶囊 pill**：`accent-soft` 底 + `accent` 字，全径圆角，前置 6px 圆点，mono uppercase 11px。
- **面板 panel / 引用 quote-block**：见 frontmatter components——panel 纸白 + 1px line；quote-block accent-soft 底 + 3px accent 左边框，正文用衬线 17px。
- **目标/非目标块**：两列 goal-list，小标题带圆形 tick——达成 `positive` 底白勾，排除 `line-strong` 底 muted 叉。
- **指标表 metric-table**：th 用 label 排版 + `th-bg` 背景；目标列 target-cell 走 mono + accent + 600；行间 1px line 分隔，末行无线。
- **用户故事 story**：左侧圆形序号（accent-soft 底 accent 字 mono 600），右侧文本中角色词用 accent 加粗。
- **里程碑 step**：顶部 pill 徽章（M1·日期）+ 衬线标题 + mono 工期 + 要点列表，4 列时间线。
- **指派 chip / avatar**：问题右侧 muted 小字 + 圆形头像（accent→accent-grad-end 渐变，白字缩写）。
- **图表**：源无图表；如需数据可视化，序列色以 accent `#4a36e3` 起、accent-grad-end `#8473ff` 次，容器沿用 panel（纸白 + 1px line + card 圆角），图表本身不加投影、不脱离 panel 容器单独铺满一屏。

## Hard Rules

- **必须**保持三字体严格分工：衬线只用于标题/引用，等宽只用于 uppercase 微标签，正文无衬线。禁止用衬线排正文或用无衬线排标签。
- **禁止**使用 box-shadow / drop-shadow，**含 hover/focus/active 等交互态和表单控件**；所有层级、所有状态只用 1px `{colors.line}` 边框 + `{rounded.card}` 圆角表达，交互反馈改用边框变色或背景色变化，不得加任何投影（哪怕是 `0 1px 2px` 的轻投影）。
- **禁止**大面积铺 accent 色块；`{colors.accent}` 仅用于胶囊/徽章/序号/目标值/引用边框/角色词等结构性点缀。
- **必须**让每个内容卡片坐在 `{colors.paper}` 纸面上、页面底为 `{colors.bg}`，不得反转。
- 所有 uppercase 微标签**必须**带字距（≥0.06em）且用 `{typography.label}` 字体族。
- **禁止**替换字体栈与 @import（见 Typography 硬指令）；**禁止**用 `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` 标签加载字体来代替 @import——一律用 `<style>` 内 `@import url(...)` 或独立 CSS 文件首行的裸 `@import` 语句。

## Exceptions

- accent 强调色允许在同一屏出现多处（状态胶囊 + 指标目标 + 里程碑徽章 + 引用左边框 + 故事序号），因均属"结构性点缀"而非装饰性铺色，不违反克制原则。
- warn `#b8741a` 与 positive `#1f8a5a` 作为语义储备色允许在需要"预警/达成"语义时启用（示例中仅 positive 用于 tick）。

## Do's and Don'ts

- **Do** 把长文档型内容（PRD 或其他）当作一页可精读文档排——密而有序、以细线分区、以衬线标题立权威。
- **Do** 用 grid 分栏承载对比信息（问题/引用、目标/非目标、多相里程碑，或改写后的指标卡/图表分节）。
- **Do** 用等宽小标签给每个数据点加"文档感"元信息（工期、日期、负责人）。
- **Don't** 加投影、渐变大色块或多彩强调；克制是本风格的核心气质。
- **Don't** 为复刻 PRD 示例改写用户的信息架构或补充无关章节。

