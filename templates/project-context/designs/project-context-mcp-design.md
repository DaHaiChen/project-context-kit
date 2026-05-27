# Project Context MCP 旁路扩展设计说明

## 1. 目标定位

这套系统不替代 CodeGraph，而是在它旁边补一层“项目语义图谱”。

```text
CodeGraph 负责代码事实：
- 文件
- 符号
- 函数 / 类 / 方法
- 调用关系
- import / dependency
- 代码位置

Project Context 负责项目语义：
- 模块职责
- 业务流程
- 架构决策
- API / 数据库 / 事件契约
- 跨模块依赖
- 修改注意事项
- 文档与代码映射

Project Context MCP 负责连接两者：
- 搜文档
- 查模块
- 生成项目图谱树
- 根据代码变更提示文档同步
- 检查文档是否过期
```

最终效果是：

```text
用户问业务逻辑
  -> 先读 Project Context 文档
  -> 再用 CodeGraph 查真实代码
  -> 回答时同时拥有“业务语义”和“代码事实”

用户改代码
  -> 先定位模块文档和契约
  -> 再改代码
  -> 根据 diff 判断哪些文档需要同步
  -> 重新生成项目图谱树
```

## 2. 推荐目录结构

项目内放一套稳定目录：

```text
.project-context/
  INDEX.md
  architecture.md
  glossary.md

  modules/
    README.md
    _template.md
    search.md
    graph.md
    auth.md

  contracts/
    api.md
    database.md
    events.md
    permissions.md

  decisions/
    0000-template.md
    0001-project-context-layer.md

  active-work/
    current.md
    blockers.md

  agent-notes/
    template.md

  metadata/
    modules.json
    contracts.json
    ownership.json
    external-sources.json

  generated/
    project-tree.md
    project-graph.json
    project-graph.mmd
    stale-report.md
```

职责划分：

```text
.md
  给人和 AI 读，保存语义、背景、边界、规则。

metadata/*.json
  给 MCP 稳定解析，保存模块到代码、文档、契约、负责人之间的映射。

generated/*
  自动生成，不作为人工主编辑入口。
```

## 3. 文档层规范

### 3.1 INDEX.md

作为入口，告诉 AI 和 MCP 该怎么读项目。

建议结构：

```md
# 项目共享上下文索引

## 项目目标

简述项目解决什么问题、服务谁、核心价值是什么。

## 阅读顺序

1. architecture.md
2. glossary.md
3. active-work/current.md
4. active-work/blockers.md
5. 根据 metadata/modules.json 找相关模块文档
6. 根据 metadata/contracts.json 找相关契约文档

## 模块地图

| 模块 | 文档 | 代码范围 | 说明 |
|---|---|---|---|
| search | modules/search.md | src/search/** | 搜索与排序 |

## 契约地图

| 契约 | 文档 | 权威来源 |
|---|---|---|
| API | contracts/api.md | openapi.yaml |
```

### 3.2 modules/*.md

模块文档保存“这个模块为什么存在、负责什么、不负责什么”。

模板：

```md
---
id: search
name: 搜索模块
status: active
related_files:
  - src/search/**
  - src/indexer/**
related_contracts:
  - contracts/api.md
  - contracts/database.md
depends_on:
  - graph
  - permission
last_verified: 2026-05-27
---

# 搜索模块

## 职责

负责接收用户查询、召回候选结果、排序并返回搜索结果。

## 不负责

- 不负责写入知识图谱。
- 不负责权限规则定义，只消费权限模块的过滤结果。

## 关键流程

1. 接收查询请求。
2. 做 query normalization。
3. 调用知识图谱或索引服务召回结果。
4. 应用权限过滤。
5. 排序并返回。

## 业务规则

- 空查询不触发召回。
- 权限过滤必须在结果返回前完成。
- 排序逻辑变更需要同步更新 API 返回语义。

## 依赖模块

- graph：提供图谱查询。
- permission：提供权限过滤规则。

## 修改注意事项

- 改 ranking 时，需要检查 `contracts/api.md`。
- 改索引字段时，需要检查 `contracts/database.md`。
```

### 3.3 contracts/*.md

契约文档不重复 schema 的完整内容，只解释“语义”和“协作约束”。

例如：

```md
---
id: api
authority:
  - openapi.yaml
related_modules:
  - search
  - graph
last_verified: 2026-05-27
---

# API 契约说明

## 权威来源

API 字段、类型、必填规则以 `openapi.yaml` 为准。

## 语义补充

### GET /search

- 返回顺序代表当前排序结果。
- 返回前必须完成权限过滤。
- `score` 只表示排序相关性，不表示权限等级。

## 修改规则

- 修改返回字段时，必须同步检查前端调用方。
- 修改排序语义时，必须同步更新搜索模块文档。
```

### 3.4 decisions/*.md

用于记录长期有效的架构决策。

```md
---
id: 0001-project-context-layer
status: accepted
date: 2026-05-27
related_modules:
  - project-context
---

# 使用旁路 Project Context MCP 扩展 CodeGraph

## 背景

CodeGraph 能快速索引代码结构，但不能稳定表达业务语义、模块边界和架构决策。

## 决策

不修改 CodeGraph 核心，新增 `.project-context/` 和 Project Context MCP。

## 原因

- 降低对 CodeGraph 上游变更的耦合。
- 先在业务项目中验证效果。
- 后续可迁移为 CodeGraph 可选扩展。

## 影响

- AI 开工前优先读取项目语义文档。
- 修改代码后需要检查文档是否同步。
```

## 4. 元数据结构设计

### 4.1 metadata/modules.json

用于 MCP 快速判断“代码文件属于哪个模块”。

```json
{
  "version": 1,
  "modules": [
    {
      "id": "search",
      "name": "搜索模块",
      "doc": "modules/search.md",
      "files": [
        "src/search/**",
        "src/indexer/**"
      ],
      "contracts": [
        "api",
        "database"
      ],
      "depends_on": [
        "graph",
        "permission"
      ],
      "owners": [
        "search-team"
      ],
      "tags": [
        "query",
        "ranking",
        "retrieval"
      ]
    }
  ]
}
```

### 4.2 metadata/contracts.json

用于记录契约文档和权威来源。

```json
{
  "version": 1,
  "contracts": [
    {
      "id": "api",
      "name": "API 契约",
      "doc": "contracts/api.md",
      "authority": [
        "openapi.yaml"
      ],
      "related_modules": [
        "search",
        "graph"
      ]
    },
    {
      "id": "database",
      "name": "数据库契约",
      "doc": "contracts/database.md",
      "authority": [
        "db/schema.sql",
        "prisma/schema.prisma"
      ],
      "related_modules": [
        "search",
        "graph"
      ]
    }
  ]
}
```

### 4.3 metadata/ownership.json

用于协作或代码审查提示。

```json
{
  "version": 1,
  "owners": [
    {
      "id": "search-team",
      "name": "搜索团队",
      "modules": [
        "search"
      ],
      "notes": "搜索排序、召回链路和相关 API 语义由该团队维护。"
    }
  ]
}
```

### 4.4 metadata/external-sources.json

用于记录外部系统来源，例如 TAPD、Linear、Confluence、Grafana。

```json
{
  "version": 1,
  "sources": [
    {
      "id": "tapd-bugs",
      "type": "tapd",
      "description": "缺陷跟踪系统",
      "related_modules": [
        "search",
        "graph"
      ]
    }
  ]
}
```

## 5. 生成的项目级图谱树

### 5.1 generated/project-graph.json

这是给 MCP / AI 稳定解析的权威生成物。

```json
{
  "version": 1,
  "generated_at": "2026-05-27T00:00:00Z",
  "project": {
    "name": "团队共享知识图谱"
  },
  "modules": [
    {
      "id": "search",
      "name": "搜索模块",
      "doc": "modules/search.md",
      "files": [
        "src/search/**",
        "src/indexer/**"
      ],
      "contracts": [
        "api",
        "database"
      ],
      "depends_on": [
        "graph",
        "permission"
      ],
      "business_rules": [
        "权限过滤必须发生在结果返回前"
      ],
      "entrypoints": [
        {
          "type": "api",
          "name": "GET /search"
        }
      ]
    }
  ],
  "edges": [
    {
      "from": "search",
      "to": "graph",
      "type": "depends_on"
    },
    {
      "from": "search",
      "to": "api",
      "type": "uses_contract"
    }
  ]
}
```

### 5.2 generated/project-tree.md

这是给人读的树。

```md
# 项目图谱树

## 搜索模块

- 文档：`modules/search.md`
- 代码：
  - `src/search/**`
  - `src/indexer/**`
- 契约：
  - `contracts/api.md`
  - `contracts/database.md`
- 依赖：
  - 知识图谱模块
  - 权限模块
- 关键规则：
  - 权限过滤必须发生在结果返回前。
- 关键入口：
  - `GET /search`
```

### 5.3 generated/project-graph.mmd

用于 Mermaid 可视化。

```mermaid
graph LR
  search["搜索模块"]
  graph["知识图谱模块"]
  permission["权限模块"]
  api["API 契约"]
  database["数据库契约"]

  search -->|depends_on| graph
  search -->|depends_on| permission
  search -->|uses_contract| api
  search -->|uses_contract| database
```

### 5.4 generated/stale-report.md

用于检查文档过期风险。

```md
# 文档过期检查报告

## 缺失文件

- `modules/search.md` 引用了 `src/indexer/**`，但没有匹配文件。

## 未记录模块

- `src/payment/**` 存在代码文件，但没有匹配到任何模块。

## 契约不一致

- `contracts/api.md` 提到了 `GET /search`，但 OpenAPI 中未发现该接口。

## 建议更新

- 新增 `modules/payment.md`。
- 更新 `metadata/modules.json`。
```

## 6. Project Context MCP 工具设计

推荐第一版提供 6 个核心工具。

### 6.1 context_search

搜索项目语义文档。

```text
context_search(query, scope?)
```

用途：

```text
用户问：
“搜索逻辑是怎么走的？”

MCP：
- 搜 modules/*.md
- 搜 contracts/*.md
- 搜 decisions/*.md
- 返回相关模块、文档片段、契约和代码范围
```

返回：

```json
{
  "matches": [
    {
      "type": "module",
      "id": "search",
      "doc": "modules/search.md",
      "score": 0.91,
      "summary": "搜索模块负责 query normalization、召回、权限过滤、排序。"
    }
  ]
}
```

### 6.2 context_get_module

读取某个模块的完整上下文。

```text
context_get_module(module_id)
```

返回：

```json
{
  "module": {
    "id": "search",
    "name": "搜索模块",
    "doc": "modules/search.md",
    "files": ["src/search/**"],
    "contracts": ["api", "database"],
    "depends_on": ["graph", "permission"]
  },
  "documents": [
    {
      "path": "modules/search.md",
      "content": "..."
    }
  ],
  "contracts": [
    {
      "id": "api",
      "doc": "contracts/api.md",
      "authority": ["openapi.yaml"]
    }
  ]
}
```

### 6.3 context_map_files

根据文件路径判断影响模块。

```text
context_map_files(files[])
```

用途：

```text
git diff 后传入变更文件：
- src/search/ranking.ts
- openapi.yaml

返回：
- 影响 search 模块
- 影响 api 契约
- 需要检查 modules/search.md、contracts/api.md
```

### 6.4 context_sync_docs_from_diff

根据代码 diff 生成文档同步建议。

```text
context_sync_docs_from_diff(diff)
```

第一版不要自动覆盖文档，只生成建议：

```json
{
  "affected_modules": ["search"],
  "affected_contracts": ["api"],
  "suggestions": [
    {
      "doc": "modules/search.md",
      "reason": "src/search/ranking.ts 被修改，可能影响排序规则说明。",
      "action": "review"
    },
    {
      "doc": "contracts/api.md",
      "reason": "openapi.yaml 被修改，可能影响 API 契约说明。",
      "action": "review"
    }
  ]
}
```

后续可以加 `apply_patch: true`，但默认不自动写入。

### 6.5 context_generate_graph

生成项目图谱。

```text
context_generate_graph()
```

执行：

```text
1. 读取 metadata/*.json
2. 读取 modules/*.md frontmatter
3. 读取 contracts/*.md frontmatter
4. 可选读取 CodeGraph 文件 / 符号索引
5. 合并模块、契约、文件、依赖关系
6. 输出 generated/project-graph.json
7. 输出 generated/project-tree.md
8. 输出 generated/project-graph.mmd
```

### 6.6 context_check_staleness

检查文档和项目事实是否不一致。

```text
context_check_staleness()
```

检查项：

```text
- metadata 引用的文档是否存在
- 文档 frontmatter 引用的文件 glob 是否能匹配
- contracts authority 文件是否存在
- 代码目录是否没有模块归属
- API 文档提到的接口是否能在 OpenAPI 中找到
- 数据库文档提到的表是否能在 schema 中找到
- generated/project-graph.json 是否需要重新生成
```

## 7. 与 CodeGraph 的关系

第一版不要直接改 CodeGraph。

Project Context MCP 可以通过以下方式和 CodeGraph 配合：

```text
方式 A：AI 编排
  AI 先调用 Project Context MCP
  再调用 CodeGraph MCP

方式 B：Project Context MCP 读取 .codegraph 输出
  如果 CodeGraph 本地索引格式稳定，可以只读使用

方式 C：Project Context MCP 不读取 CodeGraph
  只维护文档语义和文件映射
  代码结构仍由 AI 调 CodeGraph 查
```

推荐第一版采用：

```text
方式 A + 方式 C
```

原因：

```text
- 最稳。
- 不依赖 CodeGraph 内部 schema。
- 不会被 CodeGraph 上游改动影响。
- MCP 工具边界清晰。
```

也就是：

```text
Project Context MCP 管项目语义。
CodeGraph MCP 管代码事实。
AI 负责把两者结合起来。
```

## 8. 工作流设计

### 8.1 提问业务逻辑

```text
用户：搜索结果排序逻辑是什么？

AI：
1. context_search("搜索结果排序逻辑")
2. context_get_module("search")
3. codegraph_context("search ranking")
4. codegraph_trace("SearchController", "rankResults")，如需要
5. 综合回答：
   - 先讲业务规则
   - 再指向代码实现
   - 最后提醒相关契约
```

### 8.2 修改代码

```text
用户：调整搜索排序逻辑

AI：
1. context_get_module("search")
2. 阅读 modules/search.md 和 contracts/api.md
3. codegraph_context("search ranking")
4. 修改代码
5. 运行测试
6. context_sync_docs_from_diff(git diff)
7. 更新受影响文档
8. context_generate_graph()
9. context_check_staleness()
```

### 8.3 新增模块

```text
用户：新增推荐模块

AI：
1. 新增 modules/recommendation.md
2. 更新 metadata/modules.json
3. 如有 API / 数据库 / 事件，更新 contracts/*.md
4. 新增必要 ADR
5. context_generate_graph()
6. context_check_staleness()
```

## 9. 同步策略

不要一上来做“自动改文档”，推荐分三档。

### 第一档：只提示

```text
代码改了 -> MCP 提示哪些文档可能要改
```

适合第一版。

### 第二档：生成补丁

```text
代码改了 -> MCP 生成文档 patch -> AI 或用户审核
```

适合稳定后。

### 第三档：自动应用低风险更新

```text
例如：
- last_verified 日期
- generated/project-tree.md
- generated/project-graph.json
- generated/project-graph.mmd
```

但不要自动改：

```text
- 模块职责
- 业务规则
- 架构决策
- 跨模块边界
```

这些必须由 AI 或人审核。

## 10. 校验规则

建议第一版实现这些规则：

```text
PCTX001 metadata 引用的模块文档不存在
PCTX002 模块文档 frontmatter 缺少 id/name/related_files
PCTX003 related_files glob 没有匹配任何文件
PCTX004 代码文件没有归属模块
PCTX005 合同文档 authority 文件不存在
PCTX006 模块依赖了不存在的模块
PCTX007 generated/project-graph.json 已过期
PCTX008 文档引用的 API 在 OpenAPI 中不存在
PCTX009 文档引用的数据表在 schema 中不存在
PCTX010 metadata 和 frontmatter 的模块依赖不一致
```

报告示例：

```md
# Stale Report

## PCTX004 代码文件没有归属模块

- `src/recommendation/index.ts`

建议：
- 新增 `modules/recommendation.md`
- 或更新 `metadata/modules.json`
```

## 11. 落地阶段

### Phase 1：文档结构和元数据

先完成：

```text
.project-context/
  INDEX.md
  architecture.md
  modules/_template.md
  contracts/*.md
  decisions/0001-project-context-layer.md
  metadata/modules.json
  metadata/contracts.json
```

目标：

```text
AI 可以稳定读懂项目语义。
```

### Phase 2：Project Context MCP 只读工具

实现：

```text
context_search
context_get_module
context_map_files
```

目标：

```text
业务问题能先命中文档，再用 CodeGraph 精查代码。
```

### Phase 3：生成图谱树

实现：

```text
context_generate_graph
```

输出：

```text
generated/project-graph.json
generated/project-tree.md
generated/project-graph.mmd
```

目标：

```text
项目可以生成统一图谱树。
```

### Phase 4：同步与过期检查

实现：

```text
context_sync_docs_from_diff
context_check_staleness
```

目标：

```text
改代码后能知道哪些文档需要同步。
```

### Phase 5：增强 CodeGraph 关联

后续再考虑：

```text
- 从 CodeGraph 查询模块内关键 symbol
- 在 project-graph.json 里附加 symbol entrypoints
- 生成模块级调用摘要
- 支持 codegraph docs sync 命令
```

但这不是第一版必须做的。

## 12. 推荐最终方案

第一版按这个边界做：

```text
不 fork CodeGraph。
不读取 CodeGraph 内部数据库。
不做全自动文档改写。

只做：
1. .project-context 规范
2. metadata 映射
3. Project Context MCP
4. 图谱树生成
5. 文档过期检查
6. 由 AI 编排 Project Context MCP + CodeGraph MCP
```

这样最稳，后续也容易演进成：

```bash
codegraph docs init
codegraph docs search
codegraph docs graph
codegraph docs check
codegraph docs sync
```
