# CodeGraph + Project Context 运行流程

本文说明当前根目录统一维护 CodeGraph、Project Context MCP 和 `.project-context/` 后，Claude 与团队应该如何使用这套机制。

## 1. 根目录统一管理

根目录是统一上下文中心，负责维护：

```text
CodeGraph
Project Context MCP
.project-context/
.mcp.json
CLAUDE.md
.claude/settings.json
.claude/hooks/
```

子项目只维护自己的开发规则，例如：

```text
java-backend/CLAUDE.md
mini-program/CLAUDE.md
admin-web/CLAUDE.md
```

子项目默认不单独维护：

```text
子项目/.project-context/
子项目/.mcp.json
```

除非明确要求某个子项目独立运行。

## 2. Claude 接到任务后

Claude 先判断任务属于哪个子项目。

例如用户说：

```text
帮我改小程序登录逻辑
```

Claude 应该判断目标子项目是：

```text
mini-program/
```

然后读取两层规则：

```text
根目录 CLAUDE.md
  -> 总规则：CodeGraph 和 Project Context 都由根目录统一管理

根目录 .project-context/
  -> 项目语义、模块职责、跨项目契约、架构决策

mini-program/CLAUDE.md
  -> 小程序自己的技术栈、目录规范、启动/测试命令
```

如果用户没有说清楚子项目，Claude 应该先根据路径、模块名或描述判断；判断不清时再询问用户。

## 3. 理解业务逻辑时

Claude 使用两类工具：

```text
Project Context MCP
  负责查业务语义

CodeGraph
  负责查代码事实
```

推荐流程：

```text
1. project_context_search
   搜根目录 .project-context/，找相关模块、契约、决策。

2. project_context_get_module
   读取对应模块文档，理解职责、边界、业务规则。

3. codegraph_context / codegraph_trace / codegraph_callers / codegraph_callees
   找真实代码入口、调用链、影响面。

4. 综合回答：
   - 业务上怎么理解
   - 代码在哪里实现
   - 修改会影响哪些模块或契约
```

一句话：

```text
Project Context 先告诉 Claude “为什么和边界”，CodeGraph 再告诉 Claude “代码在哪里和怎么调用”。
```

## 4. 修改代码时

例如用户要求修改 Java 后台认证逻辑。

正确流程：

```text
1. 判断目标子项目：java-backend/
2. 读取根目录 .project-context/ 中 auth、api、database 等相关文档。
3. 读取 java-backend/CLAUDE.md，了解 Java 项目的技术规则。
4. 使用 CodeGraph 找认证相关代码、接口、调用链。
5. 修改 java-backend/ 下的代码。
6. 运行 java-backend/CLAUDE.md 里要求的构建、测试或检查命令。
```

修改子项目代码时，不新增子项目自己的 `.project-context/`，因为项目语义层由根目录统一维护。

## 5. 修改后如何处理文档

如果这次修改影响了：

```text
模块职责
API 契约
数据库字段
事件消息
权限逻辑
跨子项目依赖
架构决策
```

Claude 应该使用根目录 Project Context MCP：

```text
project_context_sync_docs_from_diff
```

它会根据变更文件推断：

```text
哪些模块文档可能要更新
哪些契约文档可能要更新
哪些决策或 active-work 可能受影响
```

然后 Claude 应该告诉用户：

```text
这次改动可能需要更新：
- .project-context/modules/java-backend/auth.md
- .project-context/contracts/api.md

是否需要我更新这些文档？
```

用户人工确认后，Claude 再更新根目录 `.project-context/`。

## 6. 生成项目图谱

如果更新了根目录 `.project-context/`，Claude 应该运行：

```text
project_context_generate_graph
```

生成：

```text
.project-context/generated/project-graph.json
.project-context/generated/project-tree.md
.project-context/generated/project-graph.mmd
```

这些是全局项目图谱，不属于某个子项目。

## 7. 检查文档是否过期

然后运行：

```text
project_context_check_staleness
```

检查：

```text
metadata 里引用的文档是否存在
模块引用的代码路径是否还能匹配
契约权威来源是否存在
generated 是否需要刷新
是否有明显文档/代码不一致
```

如果发现问题，再由 Claude 提示用户确认是否修复。

## 8. Stop hook 的作用

当前配置了：

```text
.claude/settings.json
.claude/hooks/project-context-stop-check.sh
```

每轮 Claude 工作结束时，Stop hook 会自动执行。

它会：

```text
1. 回到根目录。
2. 检查 git 变更。
3. 如果根目录是 git 仓库，就检查根仓库。
4. 如果根目录不是 git 仓库，就扫描子项目里的 */.git。
5. 汇总变更文件。
6. 判断是否有代码、契约、.project-context、子项目 CLAUDE.md 等变更。
7. 输出收工检查提醒。
```

Stop hook 不会自动改文档。

它只是提醒：

```text
检测到可能影响根目录统一上下文、子项目规则或跨项目契约的变更。

请确认：
1. 是否运行 project_context_sync_docs_from_diff。
2. 是否需要更新根目录 .project-context/。
3. 子项目技术规则只更新子项目 CLAUDE.md。
4. 不要新增子项目 .project-context/ 或 .mcp.json。
5. 是否运行 project_context_generate_graph。
6. 是否运行 project_context_check_staleness。
7. 文档更新需要人工审核。
```

## 9. 人工审核点

最终是否更新文档，不由 hook 自动决定。

正确闭环：

```text
Claude 修改代码
  ↓
Stop hook 检测到相关变更并提醒
  ↓
Claude 调 Project Context MCP 生成同步建议
  ↓
Claude 告诉用户哪些文档可能需要更新
  ↓
用户确认
  ↓
Claude 更新根目录 .project-context/
  ↓
Claude 重新生成项目图谱
  ↓
Claude 运行过期检查
```

这样可以避免自动把业务规则写错。

## 10. 完整闭环

完整流程可以概括成：

```text
用户提出任务
  ↓
根 CLAUDE.md 判断目标子项目
  ↓
读取根 .project-context/
  ↓
读取目标子项目 CLAUDE.md
  ↓
Project Context MCP 理解业务语义
  ↓
CodeGraph 理解代码结构
  ↓
修改子项目代码
  ↓
运行子项目测试 / 构建
  ↓
Stop hook 检测变更并提醒
  ↓
Project Context MCP 生成文档同步建议
  ↓
人工审核是否更新根 .project-context/
  ↓
更新根 .project-context/
  ↓
生成全局项目图谱
  ↓
检查文档是否过期
```

一句话总结：

```text
根目录管全局代码索引和项目语义，子项目管自己的开发规则；CodeGraph 管代码事实，Project Context 管业务语义，Stop hook 管收工提醒，人工审核管文档是否更新。
```
