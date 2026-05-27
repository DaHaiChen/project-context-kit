# project-context-kit

`project-context-kit` 是一个用于初始化 Claude Code 项目协作上下文的 CLI 工具。它会在目标项目中生成 CodeGraph + Project Context 的基础工作流，包括 `.project-context/` 语义文档目录、本地 Project Context MCP server、Claude Code MCP 配置、Stop hook 和协作说明文档。

## 适用场景

当一个仓库下存在多个子项目、多个 agent 协作，或需要长期维护跨模块上下文时，可以使用本工具统一初始化：

- CodeGraph：维护代码事实，例如文件、符号、调用关系和影响面。
- Project Context：维护项目语义，例如模块职责、业务规则、API / 数据库 / 事件契约和架构决策。
- Claude Code 协作规则：约定开工前读取哪些上下文、修改后如何同步文档。
- Stop hook：在每轮工作结束时提醒检查上下文、契约和项目图谱是否需要更新。

## 安装与使用

### 从源码运行

```bash
node bin/project-context-kit.js init
```

### 作为 npm bin 使用

如果已安装到本地或全局环境，可以直接运行：

```bash
project-context-kit init
```

### 查看帮助

```bash
project-context-kit --help
```

## CLI 命令

```bash
project-context-kit init [options]
```

可用参数：

| 参数 | 说明 |
|---|---|
| `--name <name>` | 设置生成项目图谱中的项目名称，默认使用当前目录名。 |
| `--force` | 覆盖已存在的目标文件。默认会跳过已有文件。 |
| `--dry-run` | 只打印将要写入或跳过的文件，不实际修改。 |
| `--only <part>` | 只初始化指定部分，可选值：`all`、`context`、`mcp`、`hooks`、`docs`。默认 `all`。 |
| `-h, --help` | 显示帮助信息。 |
| `-v, --version` | 显示版本号。 |

示例：

```bash
project-context-kit init --name my-project
project-context-kit init --dry-run
project-context-kit init --only context
project-context-kit init --only hooks --force
```

## 生成内容

执行 `project-context-kit init` 后，会向当前目录写入以下内容：

```text
.project-context/                         # 项目语义文档层
project-context-mcp/                      # 本地 Project Context MCP server
.mcp.json                                 # Claude Code MCP 配置
.claude/settings.json                     # Stop hook 配置
.claude/hooks/project-context-stop-check.sh
CLAUDE.md                                 # agent 协作规则
PROJECT_CONTEXT_WORKFLOW.md               # 工作流说明
PROJECT_CONTEXT_WORKFLOW.drawio           # 工作流图
```

其中 `.project-context/` 的默认结构包括：

```text
.project-context/
  INDEX.md
  architecture.md
  glossary.md
  modules/
  contracts/
  decisions/
  active-work/
  agent-notes/
  metadata/
  generated/
```

## 初始化后的下一步

CLI 执行完成后，会提示继续完成本地依赖和索引初始化：

```bash
cd project-context-mcp
npm install
npm run build
cd ..
codegraph init -i
```

完成后重启 Claude Code，让新的 MCP 配置和 hook 生效。

## Project Context MCP 能力

生成的 `project-context-mcp/` 是一个本地 stdio MCP server，提供以下工具：

| 工具 | 用途 |
|---|---|
| `project_context_search` | 搜索 `.project-context/` 语义文档。 |
| `project_context_get_module` | 读取指定模块文档、元数据和关联契约。 |
| `project_context_map_files` | 根据文件路径判断影响哪些模块和契约。 |
| `project_context_generate_graph` | 生成 `generated/project-graph.json`、`project-tree.md`、`project-graph.mmd`。 |
| `project_context_check_staleness` | 检查文档、metadata、契约和生成物是否过期。 |
| `project_context_sync_docs_from_diff` | 根据 diff 或变更文件列表生成文档同步建议。 |

## 推荐工作流

1. 根目录统一维护 CodeGraph、Project Context MCP、`.project-context/` 和 `.mcp.json`。
2. 子项目只维护自己的 `CLAUDE.md`，用于记录技术栈、启动方式、测试命令和本地注意事项。
3. Claude 接到任务后，先读取根目录 `.project-context/`，再读取目标子项目 `CLAUDE.md`。
4. 理解业务语义时使用 Project Context MCP，定位代码事实时使用 CodeGraph。
5. 修改代码后，如果影响模块边界、API、数据库、事件、权限或架构决策，需要检查并同步 `.project-context/`。
6. 更新 `.project-context/` 后，重新生成项目图谱并检查文档是否过期。

## 开发

当前包本身没有构建步骤，入口文件是：

```text
bin/project-context-kit.js
```

语法检查：

```bash
npm run check
```

## 模板目录

所有初始化文件都来自 `templates/`：

```text
templates/
  CLAUDE.md
  PROJECT_CONTEXT_WORKFLOW.md
  PROJECT_CONTEXT_WORKFLOW.drawio
  claude-settings.json
  mcp.json
  hooks/
  project-context/
  project-context-mcp/
```

修改模板后，重新运行 `project-context-kit init --force` 可以覆盖目标项目中的对应文件。

## 注意事项

- 默认不会覆盖已存在文件；如需覆盖请显式传入 `--force`。
- `--dry-run` 可用于预览本次初始化会写入哪些文件。
- `project-context-mcp/` 需要单独执行 `npm install` 和 `npm run build`。
- CodeGraph 需要在目标项目根目录执行 `codegraph init -i`。
- Stop hook 只做提醒，不会自动修改 `.project-context/`。
- `.project-context/` 用于记录长期有效的项目语义，不应写入密钥、token、cookie 或生产敏感数据。

## 许可证

MIT
