# 心理语言学文献雷达

## 应用概览

面向心理语言学博士生与研究者的个人文献追踪与管理平台。核心能力：期刊/会议源管理、论文信息浏览、收藏与阅读清单、个人笔记、用户偏好定制。

## 设计方向

- 预置风格：`design.md`（规格蓝本）

## 设计规范

### 排版

| 角色 | 字体族 | 字号 / 行高 / 字距 / 字重 |
|------|--------|--------------------------|
| h1（页面主标题） | Charter, Georgia, PingFang SC, serif | 42px / 1.06 / -0.015em / 700 |
| h2（区块标题） | Charter, Georgia, PingFang SC, serif | 24px / 1.4 / -0.005em / 700 |
| h2-small（区块副标题） | system sans-serif | 13px / 1.4 / normal / 400，色 muted |
| body（正文） | system sans-serif | 14.5px / 1.6 / normal / 400 |
| label（微标签） | ui-monospace, SFMono-Regular, Menlo, monospace | 10.5px / 1.4 / 0.06em / 400，uppercase |
| crumb（面包屑） | ui-monospace, SFMono-Regular, Menlo, monospace | 11.5px / 1.4 / 0.08em / 400，uppercase |

三字体严格分工：衬线仅标题、等宽仅 uppercase 微标签、正文无衬线。禁止混用。

### 间距

- 页面容器 max-width 1080px，上下 margin 28px auto，左右 padding 32px
- section 间 margin-top 40px（section-gap）
- 块内 grid 间距 14px（block-gap）
- 卡片内边距 22px 24px（card-pad）
- content 不贴容器边缘

### 卡片与层级

- 卡片圆角 10px，1px 实线边框 `--border`，白底，**无阴影**
- 层级仅靠白卡浮于冷灰底表达
- hover/focus/active **不加投影**，改用边框变色或背景微调

### 颜色

- 页面底 `--background`：`#f5f7fa`
- 卡片纸面 `--card`：`#ffffff`
- 主文字 `--foreground`：`#0e1322`
- 次要文字 `--muted-foreground`：`#5a647a`
- 分割线 `--border`：`#e2e6ee`
- 主强调 `--primary`：`#4a36e3`（靛紫），仅用于按钮/链接/激活态
- 弱强调面 `--accent`：`#ece8ff`
- 语义绿 `--success`：`#1f8a5a`
- 语义橙 `--warning`：`#b8741a`

### 导航

- 左侧侧栏，收起/展开切换
- 导航项使用 NavLink + active 高亮

### 响应式

- 窄屏（<768px）侧栏折叠为汉堡菜单，页面 padding 缩为 16px
- 标题缩放：h1 32px / h2 20px

## 业务模块

### 期刊/会议源
- 按 P0 / P1 / P2 / P3 四档优先级分层
- 每条含名称、缩写、类型（journal/conference）、网址、更新频次、描述、关键词过滤建议

### 论文
- 关联期刊，含标题、作者、DOI、关键词、摘要、实验方法、结论、发布时间
- 支持按期刊筛选、收藏、标记已读

### 用户工作区
- 收藏文献列表
- 阅读清单（todo/in_progress/done）
- 个人笔记（可关联论文）
- 用户设置（专业领域、意向关键词）