#!/usr/bin/env node

/**
 * 从参考目录（默认 ../基础架构）同步 templates/，目录结构与参考仓库一致。
 */

import { execSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const templateRoot = path.join(packageRoot, "templates");
const ARCHITECTURE_DOC_NAME = "项目文档与上下文架构说明.md";
const ARCHITECTURE_DIAGRAM_NAME = "流程图.drawio";

const args = process.argv.slice(2);

try {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const referenceRoot = resolveReferenceRoot(args);
  syncTemplates(referenceRoot);
  console.log(`\nTemplates synced from: ${referenceRoot}`);
  console.log(`Templates written to: ${templateRoot}`);
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function printHelp() {
  console.log(`sync-templates

Usage:
  node bin/sync-templates.js [--from <reference-dir>]

Options:
  --from <dir>   Reference project root (default: ../基础架构)
  -h, --help     Show help
`);
}

function resolveReferenceRoot(values) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--from") {
      const next = values[index + 1];
      if (!next) throw new Error("Missing value for --from");
      return path.resolve(next);
    }
    if (value.startsWith("--from=")) {
      const reference = value.slice("--from=".length);
      if (!reference) throw new Error("Missing value for --from");
      return path.resolve(reference);
    }
  }

  return path.resolve(packageRoot, "..", "基础架构");
}

function syncTemplates(referenceRoot) {
  if (!existsSync(referenceRoot)) {
    throw new Error(`Reference directory not found: ${referenceRoot}`);
  }

  removeObsoleteTemplatePaths();

  const copyRoots = [
    ".claude/hooks",
    ".claude/settings.json",
    ".claude/skills",
    ".mcp.json",
    ".project-context",
    "CLAUDE.md",
    "AGENTS.md",
    "docs"
  ];

  for (const relativePath of copyRoots) {
    const from = path.join(referenceRoot, relativePath);
    const to = path.join(templateRoot, relativePath);
    if (!existsSync(from)) {
      console.log(`[skip] missing in reference: ${relativePath}`);
      continue;
    }
    console.log(`[copy] ${relativePath}`);
    copyRecursive(from, to, referenceRoot);
  }

  syncProjectContextMcp(referenceRoot);
  syncArchitectureDocs(referenceRoot);
  sanitizeProjectContextTemplate();
  makeHookExecutable();
}

function syncProjectContextMcp(referenceRoot) {
  const sourceMcpRoot = path.join(referenceRoot, "project-context-mcp");
  const templateMcpRoot = path.join(templateRoot, "project-context-mcp");

  if (!existsSync(sourceMcpRoot)) {
    console.log("[skip] missing in reference: project-context-mcp");
    return;
  }

  const sourceDist = path.join(sourceMcpRoot, "dist");
  const sourcePackageJson = path.join(sourceMcpRoot, "package.json");
  const sourceReadme = path.join(sourceMcpRoot, "README.md");

  console.log("[build] project-context-mcp");
  execSync("npm run build", { cwd: sourceMcpRoot, stdio: "inherit" });

  if (!existsSync(sourceDist)) {
    throw new Error(`Build did not produce dist/: ${sourceDist}`);
  }

  rmSync(templateMcpRoot, { recursive: true, force: true });
  mkdirSync(templateMcpRoot, { recursive: true });

  copyRecursive(sourceDist, path.join(templateMcpRoot, "dist"), sourceMcpRoot);
  console.log("[copy] project-context-mcp/dist");

  if (existsSync(sourceReadme)) {
    copyFileSync(sourceReadme, path.join(templateMcpRoot, "README.md"));
    console.log("[copy] project-context-mcp/README.md");
  }

  if (!existsSync(sourcePackageJson)) {
    throw new Error(`Missing package.json: ${sourcePackageJson}`);
  }

  const sourcePackage = JSON.parse(readFileSync(sourcePackageJson, "utf8"));
  const runtimePackage = {
    name: sourcePackage.name ?? "project-context-mcp-server",
    version: sourcePackage.version ?? "0.1.0",
    private: true,
    description: sourcePackage.description ?? "Project Context MCP server for .project-context semantic documentation.",
    type: sourcePackage.type ?? "module",
    scripts: {
      start: "node dist/index.js"
    },
    dependencies: sourcePackage.dependencies ?? {}
  };

  writeFileSync(path.join(templateMcpRoot, "package.json"), `${JSON.stringify(runtimePackage, null, 2)}\n`, "utf8");
  console.log("[write] project-context-mcp/package.json (runtime only)");
}

function syncArchitectureDocs(referenceRoot) {
  const architectureSources = [
    path.join(referenceRoot, ARCHITECTURE_DOC_NAME),
    path.join(referenceRoot, "协作上下文中枢架构说明.md"),
    path.join(referenceRoot, "docs", ARCHITECTURE_DOC_NAME)
  ];

  const architectureSource = architectureSources.find((candidate) => existsSync(candidate));
  if (architectureSource) {
    const target = path.join(templateRoot, ARCHITECTURE_DOC_NAME);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(architectureSource, target);
    console.log(`[copy] ${path.relative(referenceRoot, architectureSource)} -> ${ARCHITECTURE_DOC_NAME}`);
  } else {
    console.log(`[skip] missing architecture doc in reference`);
  }

  const diagramSources = [
    path.join(referenceRoot, ARCHITECTURE_DIAGRAM_NAME),
    path.join(referenceRoot, "PROJECT_CONTEXT_WORKFLOW.drawio")
  ];

  const diagramSource = diagramSources.find((candidate) => existsSync(candidate));
  if (diagramSource) {
    const target = path.join(templateRoot, ARCHITECTURE_DIAGRAM_NAME);
    copyFileSync(diagramSource, target);
    console.log(`[copy] ${path.relative(referenceRoot, diagramSource)} -> ${ARCHITECTURE_DIAGRAM_NAME}`);
  } else {
    console.log(`[skip] missing ${ARCHITECTURE_DIAGRAM_NAME} in reference`);
  }
}

function removeObsoleteTemplatePaths() {
  const obsoletePaths = [
    "claude-settings.json",
    "mcp.json",
    "hooks",
    "project-context",
    "PROJECT_CONTEXT_WORKFLOW.md",
    "PROJECT_CONTEXT_WORKFLOW.drawio",
    "协作上下文中枢架构说明.md"
  ];

  for (const relativePath of obsoletePaths) {
    const target = path.join(templateRoot, relativePath);
    if (!existsSync(target)) continue;
    console.log(`[remove] obsolete ${relativePath}`);
    rmSync(target, { recursive: true, force: true });
  }
}

function shouldSkip(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");

  if (normalized === ".claude/settings.local.json") return true;
  if (normalized.endsWith(".DS_Store")) return true;
  if (normalized === "协作上下文中枢架构说明.md") return true;
  if (normalized === "PROJECT_CONTEXT_WORKFLOW.md") return true;
  if (normalized === "PROJECT_CONTEXT_WORKFLOW.drawio") return true;
  if (normalized.startsWith("project-context-mcp/")) return true;
  if (normalized.startsWith(".project-context/modules/testing/")) return true;

  return false;
}

function copyRecursive(from, to, referenceRoot) {
  if (path.basename(from) === ".DS_Store") return;

  const relativePath = path.relative(referenceRoot, from);
  if (shouldSkip(relativePath)) return;

  const stat = statSync(from);
  if (stat.isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from)) {
      copyRecursive(path.join(from, entry), path.join(to, entry), referenceRoot);
    }
    return;
  }

  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
}

function sanitizeProjectContextTemplate() {
  const modulesJsonPath = path.join(templateRoot, ".project-context/metadata/modules.json");
  if (existsSync(modulesJsonPath)) {
    writeFileSync(modulesJsonPath, `${JSON.stringify({ version: 1, modules: [] }, null, 2)}\n`, "utf8");
    console.log("[sanitize] .project-context/metadata/modules.json");
  }

  const testingDir = path.join(templateRoot, ".project-context/modules/testing");
  if (existsSync(testingDir)) {
    rmSync(testingDir, { recursive: true, force: true });
    console.log("[sanitize] removed .project-context/modules/testing");
  }

  const indexPath = path.join(templateRoot, ".project-context/INDEX.md");
  if (!existsSync(indexPath)) return;

  const indexContent = readFileSync(indexPath, "utf8");
  const sanitizedIndex = indexContent
    .replace(
      /\| 上下文流程试运行 \| `modules\/testing\/context-flow-trial\.md` \| AI \| 测试模块，仅用于验证 docs 到 \.project-context 的同步流程 \|/,
      "| 待补充 | `modules/_template.md` | 待补充 | 待补充 |"
    )
    .replace(
      /\n## 交付文档入口\n\n- 完整 PRD、需求共识、设计方案、接口设计、QA、验收和复盘统一放在根目录 `docs\/`。\n- 文档生成流程：`..\/docs\/文档生成流程\.md`\n- `\.project-context\/` 只沉淀模块边界、跨模块契约、长期约束、已知坑点、架构决策和文档\/代码映射，不搬运完整 PRD。\n/,
      "\n"
    );

  if (sanitizedIndex !== indexContent) {
    writeFileSync(indexPath, sanitizedIndex, "utf8");
    console.log("[sanitize] .project-context/INDEX.md");
  }
}

function makeHookExecutable() {
  const hookPath = path.join(templateRoot, ".claude/hooks/project-context-stop-check.sh");
  if (existsSync(hookPath)) chmodSync(hookPath, 0o755);
}
