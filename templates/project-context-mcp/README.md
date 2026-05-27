# Project Context MCP Server

这是一个本地 stdio MCP server，用于读取和维护项目内的 `.project-context/` 语义文档层。

## 能力

提供以下 MCP tools：

- `project_context_search`：搜索 `.project-context/` 文档。
- `project_context_get_module`：读取指定模块的文档、元数据和关联契约。
- `project_context_map_files`：根据文件路径判断影响哪些模块和契约。
- `project_context_generate_graph`：生成 `generated/project-graph.json`、`project-tree.md`、`project-graph.mmd`。
- `project_context_check_staleness`：检查文档、metadata、契约和生成物是否明显过期。
- `project_context_sync_docs_from_diff`：根据 diff 或文件列表生成文档同步建议。

## 安装与构建

```bash
npm install
npm run build
```

## 本地运行

```bash
npm start
```

默认会从当前工作目录向上查找最近的 `.project-context/`，因此可以在 `project-context-mcp/` 子目录中直接运行。

如果要读取其他项目，可以设置：

```bash
PROJECT_CONTEXT_ROOT=/path/to/project npm start
```

## Claude Code MCP 配置示例

构建后可配置为：

```json
{
  "mcpServers": {
    "project-context": {
      "command": "node",
      "args": ["/path/to/project/project-context-mcp/dist/index.js"],
      "env": {
        "PROJECT_CONTEXT_ROOT": "/path/to/project"
      }
    }
  }
}
```

## 设计边界

- 不修改 CodeGraph 核心。
- 不读取 CodeGraph 内部数据库。
- Project Context MCP 负责项目语义层。
- CodeGraph MCP 负责代码事实层。
- AI 负责结合两者回答业务问题或辅助修改代码。
