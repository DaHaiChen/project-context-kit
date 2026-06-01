# Agent 协作规则

本根目录统一维护 CodeGraph、Project Context MCP、`.project-context/` 和根目录 `docs/`。根目录负责全局代码索引、项目语义图谱、完整交付文档和跨子项目协作；各子项目只维护自己的技术栈规则、构建测试方式和本地开发注意事项。

## 根目录职责

根目录负责：

- 统一维护 CodeGraph 代码索引。
- 统一维护 Project Context MCP。
- 统一维护 `.project-context/` 项目语义图谱。
- 统一维护根目录 `docs/` 完整交付文档，包括 PRD、需求共识、设计方案、接口设计、QA、验收和复盘。
- 统一维护 `.mcp.json` MCP 配置。
- 记录跨子项目模块、契约、数据库、事件、权限和架构决策。

根目录不负责写具体子项目的技术细节。具体技术栈、启动方式、测试命令和代码规范应写在对应子项目的 `CLAUDE.md` 中。

## 子项目职责

每个子项目只维护自己的 `CLAUDE.md`，用于记录：

- 技术栈和版本要求。
- 构建、启动、测试、类型检查命令。
- 目录结构和代码规范。
- 本项目运行依赖，例如 Nacos、Seata、MySQL、Redis、微信开发者工具等。
- 本项目特有的调试、部署和注意事项。

子项目不单独维护 `.project-context/` 和 `.mcp.json`，除非用户明确要求该子项目独立运行。

## 开工前必须读取

按顺序阅读根目录上下文：

1. `.project-context/INDEX.md`
2. `.project-context/architecture.md`
3. 与本次任务相关的 `.project-context/modules/**/*.md`
4. 与本次任务相关的 `.project-context/contracts/*.md`
5. `.project-context/active-work/current.md`
6. `.project-context/active-work/blockers.md`

然后读取目标子项目自己的 `CLAUDE.md`。如果用户没有明确指定子项目，先根据文件路径、模块名或需求描述判断目标子项目；判断不清时先询问用户。

如果任务涉及跨模块接口、数据结构、事件、权限、部署或运行环境，必须额外检查 `.project-context/contracts/` 和 `.project-context/decisions/`。

## 工具使用规则

本根目录统一使用三层上下文：

- Project Context：负责项目语义索引，包括模块职责、业务规则摘要、架构决策、API / 数据库 / 事件契约和跨子项目协作约定。
- `docs/`：负责完整交付文档，包括 PRD、需求共识、设计方案、接口设计、QA、验收和复盘。
- CodeGraph：负责代码事实，包括文件、符号、函数、类、调用关系和依赖关系。

查询业务逻辑时：

1. 使用 Project Context MCP 查询根目录 `.project-context/`，先判断模块、边界、契约和相关交付文档。
2. 按需读取根目录 `docs/` 中的完整 PRD、设计方案、接口设计或 QA。
3. 使用 CodeGraph 查询真实代码结构、调用链和影响面。
4. 回答时同时说明业务语义、文档依据和代码位置。

修改代码时：

1. 先确认本次任务影响哪个子项目、哪些模块、哪些契约和哪些交付文档。
2. 读取根目录 `.project-context/` 中相关模块和契约。
3. 按需读取根目录 `docs/` 中对应 PRD、设计、接口或 QA。
4. 读取目标子项目 `CLAUDE.md` 中的技术规则。
5. 使用 CodeGraph 定位代码入口、调用链和影响面。
6. 修改目标子项目代码。
7. 运行目标子项目要求的构建、测试或类型检查。

## 轻量维护原则

日常优先维护根目录 `docs/`。PRD、需求共识、设计方案、接口设计、QA、验收或复盘在草稿阶段只写 `docs/`，不必每次同步 `.project-context/`。

只有在以下确认节点，才需要执行 `/context-sync` 并更新 `.project-context/`：

- PRD 或设计已经确认，需要沉淀模块职责、边界、关键规则或已知坑点。
- 新增、删除或变更 API、数据库、事件、权限、状态枚举等跨模块契约。
- 修改了模块职责、边界或跨子项目依赖。
- 做出了会影响后续开发的架构决策。
- 发现长期有效的风险、阻塞、协作约定或重复踩坑信息。
- 一轮开发或联调结束，需要同步文档、代码和上下文。

执行 `/context-sync` 后，应使用 Project Context MCP 生成文档同步建议、重新生成项目图谱并检查过期状态。文档更新需要人工审核后再视为完成。

## 上下文写作原则

- 只记录对未来协作有价值的信息，不记录流水账。
- 优先记录“为什么”，而不只是“做了什么”。
- 内容必须简短、明确、可验证。
- 文件中已有信息过期时，直接更新或删除，不要追加矛盾内容。
- 不要写入密钥、token、cookie、个人隐私或生产敏感数据。

## 推荐目录组织

根目录 `.project-context/` 按子项目分组维护模块语义：

```text
.project-context/
  INDEX.md
  architecture.md
  glossary.md

  modules/
    java-backend/
      auth.md
      user.md
    mini-program/
      login.md
      profile.md
    admin-web/
      user-management.md

  contracts/
    api.md
    database.md
    events.md

  decisions/
  active-work/
  agent-notes/
  metadata/
  generated/
```

## 目录说明

- `.project-context/INDEX.md`：共享上下文入口和阅读导航。
- `.project-context/architecture.md`：整体架构和跨子项目关键链路。
- `.project-context/glossary.md`：业务术语和技术术语。
- `.project-context/modules/`：按子项目分组的模块职责、边界、依赖和注意事项。
- `.project-context/contracts/`：API、事件、数据库等跨子项目契约。
- `.project-context/decisions/`：重要架构决策记录。
- `.project-context/active-work/`：当前协作重点、阻塞点和风险。
- `.project-context/agent-notes/`：agent 交接模板和必要记录。
- `.project-context/metadata/`：Project Context MCP 使用的机器可读索引。
- `.project-context/generated/`：Project Context MCP 生成的项目图谱和过期检查报告。
