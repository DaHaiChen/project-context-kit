---
description: 同步根目录 docs、对话结论、代码变更与 .project-context 项目语义图谱。用于用户执行 /context-sync，或要求同步、维护、刷新 Project Context 时。
---

# context-sync

该 skill 用于在确认节点把完整交付文档、对话确认事项和代码变更同步沉淀到 `.project-context/`。日常草稿阶段只维护根目录 `docs/`；PRD/设计确认、契约变化、模块边界变化或一轮开发/联调结束后，再执行本 skill。

## 适用场景

- 用户执行 `/context-sync`。
- 用户说“同步 project-context”“刷新上下文”“把 docs 变更沉淀到上下文”。
- PRD 或设计已经确认，需要沉淀模块职责、边界、关键规则或已知坑点。
- 修改了模块边界、API、数据库、事件、权限、状态枚举、架构决策或跨模块约定。
- 一轮开发、联调或验收结束，需要同步文档、代码和上下文。
- 对话中确认了长期有效规则、风险、阻塞或协作约定。

## 核心原则

- `docs/` 保存完整交付文档，是 PRD、设计、QA、验收等内容的主入口。
- `.project-context/` 保存项目语义索引、契约摘要、长期约束、已知坑点、架构决策、当前阻塞和文档/代码映射。
- 不把完整 PRD 或长篇设计搬进 `.project-context/`。
- 从 `docs/` 抽取内容时，必须保留来源文档路径。
- 从对话中沉淀内容时，必须区分已确认、建议中、阻塞中或待确认。
- 当 `docs/` 与 `.project-context/` 冲突时，以 `docs/` 中最新确认版本为准，并更新 `.project-context/`。
- 不写入密钥、token、cookie、个人隐私或生产敏感数据。

## 执行流程

### 1. 读取基础规则

先读取：

1. `CLAUDE.md`
2. `.project-context/INDEX.md`
3. `docs/README.md`
4. `docs/文档生成流程.md`

然后按任务需要读取：

- `.project-context/architecture.md`
- `.project-context/modules/**/*.md`
- `.project-context/contracts/*.md`
- `.project-context/active-work/current.md`
- `.project-context/active-work/blockers.md`
- 相关 `docs/**/*.md`

### 2. 判断变更来源

优先根据以下来源判断需要同步什么：

1. 当前对话中用户确认的长期规则、决策、风险或阻塞。
2. 根目录 `docs/` 中新增或修改的 PRD、设计、接口、QA、验收、复盘。
3. 代码、接口、schema、SQL、权限、事件等变更文件。
4. Project Context MCP 的 diff 同步建议。

如果处于 git 仓库，读取当前变更文件；如果根目录不是 git 仓库但子项目是 git 仓库，按子项目变更判断。

### 3. 运行 Project Context MCP

根据已知变更文件或 diff，调用：

1. `project_context_sync_docs_from_diff`
   - 使用变更文件列表或 diff 推断受影响模块与契约。
2. 必要时调用 `project_context_map_files`
   - 将具体文件映射到模块和契约。
3. 必要时调用 `project_context_search`
   - 查找已有上下文，避免重复记录。

### 4. 更新 `.project-context/`

按信息类型落地：

| 信息类型 | 目标位置 |
|---|---|
| 模块职责、边界、关键流程、已知坑点 | `.project-context/modules/<子项目>/<模块>.md` |
| HTTP/RPC/内部服务接口语义 | `.project-context/contracts/api.md` |
| 表、字段、状态、枚举、删除校验、一致性约定 | `.project-context/contracts/database.md` |
| MQ、领域事件、异步通知、定时任务触发 | `.project-context/contracts/events.md` |
| 权限码、菜单权限、按钮权限、角色边界 | `.project-context/contracts/permissions.md` |
| 长期架构取舍和原因 | `.project-context/decisions/*.md` |
| 当前重点、阻塞、短期风险 | `.project-context/active-work/*.md` |
| 模块、代码路径、docs、契约之间的映射 | `.project-context/metadata/*.json` |

写入时遵守：

- 只记录未来协作有价值的信息。
- 优先写“为什么”和“不能破坏什么”。
- 已确认事实写入正式章节。
- 未确认事项写入“待确认”“阻塞”或 `active-work/blockers.md`。
- 不追加矛盾内容；已有内容过期时直接更新或删除。

### 5. 生成与检查

如果更新了 `.project-context/`，继续调用：

1. `project_context_generate_graph`
2. `project_context_check_staleness`

如果检查发现过期或不一致，修正可确定的问题；无法确定的事项写入 `active-work/blockers.md` 或在回复中明确提示需要人工确认。

### 6. 输出结果

最终回复必须简短说明：

- 同步了哪些 `docs/` 或对话结论。
- 更新了哪些 `.project-context/` 文件。
- 是否重新生成项目图谱。
- 是否存在需要人工审核或确认的问题。

## 禁止事项

- 不要把完整 PRD、完整接口文档、完整技术设计复制进 `.project-context/`。
- 不要把未确认的对话推测写成 confirmed 事实。
- 不要为了通过检查而删除不理解的上下文。
- 不要写入敏感信息。
