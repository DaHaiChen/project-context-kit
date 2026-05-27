# 项目共享上下文索引

这是所有 agent 的项目上下文入口。开始任何开发任务前，先从这里判断需要读取哪些上下文文件。

## 项目目标

待补充：用 3～5 句话说明项目要解决的问题、核心用户、主要业务目标。

## 当前状态

待补充：当前项目阶段、主要开发方向、近期重点。

## 阅读顺序

通用任务：

1. `architecture.md`
2. `glossary.md`
3. `active-work/current.md`
4. `active-work/blockers.md`

涉及模块开发：

1. `modules/` 下对应模块文件
2. `contracts/api.md`
3. `contracts/database.md`
4. `contracts/events.md`

涉及跨模块协作：

1. `architecture.md`
2. 所有关联 `modules/*.md`
3. 相关 `contracts/*.md`
4. `decisions/` 下相关决策

## 模块地图

| 模块 | 上下文文件 | 负责人/主要维护者 | 说明 |
|---|---|---|---|
| 待补充 | `modules/_template.md` | 待补充 | 待补充 |

## 关键契约

| 类型 | 文件 | 说明 |
|---|---|---|
| API | `contracts/api.md` | HTTP/RPC/内部接口约定 |
| 事件 | `contracts/events.md` | MQ、领域事件、异步通知约定 |
| 数据库 | `contracts/database.md` | 表结构、共享字段、数据语义 |

## 当前协作入口

- 当前重点：`active-work/current.md`
- 阻塞与风险：`active-work/blockers.md`
- agent 交接模板：`agent-notes/template.md`

## 设计说明

- Project Context MCP 旁路扩展设计：`designs/project-context-mcp-design.md`
- Project Context 目录维护说明：`designs/project-context-directory-guide.md`

## 维护规则

- 修改模块边界时，更新对应 `modules/*.md`。
- 修改跨模块接口时，更新 `contracts/*.md`。
- 做出长期有效的技术决策时，在 `decisions/` 新增 ADR。
- 发现短期阻塞或协作风险时，更新 `active-work/blockers.md`。
