#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

function findProjectRoot(startDir: string): string {
  let current = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(current, ".project-context"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}

const PROJECT_ROOT = process.env.PROJECT_CONTEXT_ROOT
  ? path.resolve(process.env.PROJECT_CONTEXT_ROOT)
  : findProjectRoot(process.cwd());
const CONTEXT_DIR = path.join(PROJECT_ROOT, ".project-context");
const TEXT_EXTENSIONS = new Set([".md", ".json", ".mmd", ".yaml", ".yml"]);

type ResponseFormat = "markdown" | "json";

type ModuleMetadata = {
  id: string;
  name?: string;
  doc?: string;
  files?: string[];
  contracts?: string[];
  depends_on?: string[];
  owners?: string[];
  tags?: string[];
};

type ContractMetadata = {
  id: string;
  name?: string;
  doc?: string;
  authority?: string[];
  related_modules?: string[];
};

type ProjectGraph = {
  version: number;
  generated_at: string;
  project: { name: string };
  modules: Array<{
    id: string;
    name: string;
    doc: string | null;
    files: string[];
    contracts: string[];
    depends_on: string[];
    owners: string[];
    tags: string[];
    business_rules: string[];
  }>;
  contracts: Array<{
    id: string;
    name: string;
    doc: string | null;
    authority: string[];
    related_modules: string[];
  }>;
  edges: Array<{ from: string; to: string; type: string }>;
};

function okText(text: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structuredContent ? { structuredContent } : {})
  };
}

function errorText(message: string, details?: string) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: details ? `Error: ${message}\n\n${details}` : `Error: ${message}`
      }
    ]
  };
}

function formatOutput(data: unknown, markdown: string, responseFormat: ResponseFormat) {
  return okText(responseFormat === "json" ? JSON.stringify(data, null, 2) : markdown, data as Record<string, unknown>);
}

function ensureInsideContext(relativePath: string): string {
  const normalized = path.normalize(relativePath).replace(/^([/\\])+/, "");
  const absolute = path.resolve(CONTEXT_DIR, normalized);
  const relative = path.relative(CONTEXT_DIR, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`路径必须位于 .project-context 内：${relativePath}`);
  }
  return absolute;
}

function toContextRelative(absolutePath: string): string {
  return path.relative(CONTEXT_DIR, absolutePath).split(path.sep).join("/");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(relativePath: string, fallback: T): Promise<T> {
  const absolute = ensureInsideContext(relativePath);
  if (!(await pathExists(absolute))) return fallback;
  const content = await fs.readFile(absolute, "utf8");
  return JSON.parse(content) as T;
}

async function readContextFile(relativePath: string): Promise<string> {
  const absolute = ensureInsideContext(relativePath);
  return fs.readFile(absolute, "utf8");
}

async function listContextFiles(dir = CONTEXT_DIR): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listContextFiles(absolute)));
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(toContextRelative(absolute));
    }
  }
  return files.sort();
}

async function loadModules(): Promise<ModuleMetadata[]> {
  const data = await readJsonFile<{ modules?: ModuleMetadata[] }>("metadata/modules.json", { modules: [] });
  return Array.isArray(data.modules) ? data.modules : [];
}

async function loadContracts(): Promise<ContractMetadata[]> {
  const data = await readJsonFile<{ contracts?: ContractMetadata[] }>("metadata/contracts.json", { contracts: [] });
  return Array.isArray(data.contracts) ? data.contracts : [];
}

function normalizeSlashes(value: string): string {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizeSlashes(pattern);
  let source = "^";
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      i += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  source += "$";
  return new RegExp(source);
}

function matchesGlob(filePath: string, pattern: string): boolean {
  return globToRegExp(pattern).test(normalizeSlashes(filePath));
}

async function listProjectFiles(dir = PROJECT_ROOT): Promise<string[]> {
  const ignored = new Set(["node_modules", "dist", ".git", ".codegraph"]);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (ignored.has(entry.name) || entry.name === ".DS_Store") continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listProjectFiles(absolute)));
    } else {
      files.push(path.relative(PROJECT_ROOT, absolute).split(path.sep).join("/"));
    }
  }
  return files.sort();
}

function parseFrontmatter(content: string): Record<string, unknown> {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---", 4);
  if (end === -1) return {};
  const body = content.slice(4, end).trim();
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  for (const line of body.split("\n")) {
    const arrayItem = line.match(/^\s*-\s+(.+)$/);
    if (arrayItem && currentKey) {
      const existing = result[currentKey];
      result[currentKey] = Array.isArray(existing) ? [...existing, arrayItem[1].trim()] : [arrayItem[1].trim()];
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    currentKey = match[1];
    const value = match[2].trim();
    result[currentKey] = value === "" ? [] : value;
  }
  return result;
}

function extractTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractBulletsUnderHeading(content: string, heading: string): string[] {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return [];
  const bullets: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line)) break;
    const match = line.match(/^\s*-\s+(.+)$/);
    if (match) bullets.push(match[1].trim());
  }
  return bullets;
}

async function getModuleDoc(module: ModuleMetadata): Promise<{ path: string | null; content: string | null; frontmatter: Record<string, unknown> }> {
  if (!module.doc) return { path: null, content: null, frontmatter: {} };
  const content = (await pathExists(ensureInsideContext(module.doc))) ? await readContextFile(module.doc) : null;
  return { path: module.doc, content, frontmatter: content ? parseFrontmatter(content) : {} };
}

function projectName(): string {
  return path.basename(PROJECT_ROOT);
}

async function buildGraph(): Promise<ProjectGraph> {
  const [modules, contracts] = await Promise.all([loadModules(), loadContracts()]);
  const graphModules = await Promise.all(modules.map(async (module) => {
    const moduleDoc = await getModuleDoc(module);
    return {
      id: module.id,
      name: module.name ?? module.id,
      doc: module.doc ?? null,
      files: module.files ?? [],
      contracts: module.contracts ?? [],
      depends_on: module.depends_on ?? [],
      owners: module.owners ?? [],
      tags: module.tags ?? [],
      business_rules: moduleDoc.content ? extractBulletsUnderHeading(moduleDoc.content, "业务规则") : []
    };
  }));
  const graphContracts = contracts.map((contract) => ({
    id: contract.id,
    name: contract.name ?? contract.id,
    doc: contract.doc ?? null,
    authority: contract.authority ?? [],
    related_modules: contract.related_modules ?? []
  }));
  const edges: ProjectGraph["edges"] = [];
  for (const module of graphModules) {
    for (const target of module.depends_on) edges.push({ from: module.id, to: target, type: "depends_on" });
    for (const contract of module.contracts) edges.push({ from: module.id, to: contract, type: "uses_contract" });
  }
  for (const contract of graphContracts) {
    for (const moduleId of contract.related_modules) edges.push({ from: contract.id, to: moduleId, type: "related_module" });
  }
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    project: { name: projectName() },
    modules: graphModules,
    contracts: graphContracts,
    edges
  };
}

function graphToTreeMarkdown(graph: ProjectGraph): string {
  const lines = [`# 项目图谱树`, "", `项目：${graph.project.name}`, "", "## 模块", ""];
  if (graph.modules.length === 0) {
    lines.push("当前尚未定义模块。", "");
  }
  for (const module of graph.modules) {
    lines.push(`### ${module.name} (${module.id})`, "");
    lines.push(`- 文档：${module.doc ?? "未配置"}`);
    lines.push(`- 代码：${module.files.length ? module.files.join("、") : "未配置"}`);
    lines.push(`- 契约：${module.contracts.length ? module.contracts.join("、") : "无"}`);
    lines.push(`- 依赖：${module.depends_on.length ? module.depends_on.join("、") : "无"}`);
    lines.push(`- 负责人：${module.owners.length ? module.owners.join("、") : "未配置"}`);
    lines.push(`- 业务规则：${module.business_rules.length ? module.business_rules.join("；") : "未配置"}`);
    lines.push("");
  }
  lines.push("## 契约", "");
  if (graph.contracts.length === 0) {
    lines.push("当前尚未定义契约。", "");
  }
  for (const contract of graph.contracts) {
    lines.push(`### ${contract.name} (${contract.id})`, "");
    lines.push(`- 文档：${contract.doc ?? "未配置"}`);
    lines.push(`- 权威来源：${contract.authority.length ? contract.authority.join("、") : "未配置"}`);
    lines.push(`- 关联模块：${contract.related_modules.length ? contract.related_modules.join("、") : "无"}`);
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

function graphToMermaid(graph: ProjectGraph): string {
  const lines = ["graph LR"];
  if (graph.modules.length === 0 && graph.contracts.length === 0) {
    lines.push(`  project["${graph.project.name}"]`);
    return `${lines.join("\n")}\n`;
  }
  for (const module of graph.modules) lines.push(`  ${safeMermaidId(module.id)}["${module.name}"]`);
  for (const contract of graph.contracts) lines.push(`  ${safeMermaidId(contract.id)}["${contract.name}"]`);
  for (const edge of graph.edges) lines.push(`  ${safeMermaidId(edge.from)} -->|${edge.type}| ${safeMermaidId(edge.to)}`);
  return `${lines.join("\n")}\n`;
}

function safeMermaidId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}

function includesCaseInsensitive(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

function summarize(content: string, query: string, maxLength: number): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  const index = normalized.toLowerCase().indexOf(query.toLowerCase());
  const start = index === -1 ? 0 : Math.max(0, index - 80);
  const snippet = normalized.slice(start, start + maxLength);
  return `${start > 0 ? "..." : ""}${snippet}${start + maxLength < normalized.length ? "..." : ""}`;
}

async function writeGeneratedGraph(graph: ProjectGraph): Promise<void> {
  const generatedDir = ensureInsideContext("generated");
  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(ensureInsideContext("generated/project-graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
  await fs.writeFile(ensureInsideContext("generated/project-tree.md"), graphToTreeMarkdown(graph));
  await fs.writeFile(ensureInsideContext("generated/project-graph.mmd"), graphToMermaid(graph));
}

async function checkStaleness(): Promise<{ issues: Array<{ code: string; severity: string; message: string; suggestion: string }> }> {
  const [modules, contracts, projectFiles] = await Promise.all([loadModules(), loadContracts(), listProjectFiles()]);
  const issues: Array<{ code: string; severity: string; message: string; suggestion: string }> = [];
  const moduleIds = new Set(modules.map((module) => module.id));
  const contractIds = new Set(contracts.map((contract) => contract.id));

  for (const module of modules) {
    if (!module.id) {
      issues.push({ code: "PCTX002", severity: "error", message: "metadata/modules.json 中存在缺少 id 的模块。", suggestion: "为该模块补充唯一 id。" });
    }
    if (!module.doc) {
      issues.push({ code: "PCTX002", severity: "warning", message: `模块 ${module.id} 缺少 doc。`, suggestion: "为模块配置 modules/*.md 文档路径。" });
    } else if (!(await pathExists(ensureInsideContext(module.doc)))) {
      issues.push({ code: "PCTX001", severity: "error", message: `模块 ${module.id} 引用的文档不存在：${module.doc}`, suggestion: "创建该文档或修正 metadata/modules.json。" });
    }
    for (const pattern of module.files ?? []) {
      if (!projectFiles.some((file) => matchesGlob(file, pattern))) {
        issues.push({ code: "PCTX003", severity: "warning", message: `模块 ${module.id} 的文件匹配没有命中：${pattern}`, suggestion: "确认代码路径是否存在，或更新 files glob。" });
      }
    }
    for (const dep of module.depends_on ?? []) {
      if (!moduleIds.has(dep)) {
        issues.push({ code: "PCTX006", severity: "warning", message: `模块 ${module.id} 依赖不存在的模块：${dep}`, suggestion: "新增对应模块，或修正 depends_on。" });
      }
    }
    for (const contract of module.contracts ?? []) {
      if (!contractIds.has(contract)) {
        issues.push({ code: "PCTX010", severity: "warning", message: `模块 ${module.id} 引用了不存在的契约：${contract}`, suggestion: "新增对应契约，或修正 contracts 列表。" });
      }
    }
  }

  for (const contract of contracts) {
    if (!contract.doc) {
      issues.push({ code: "PCTX005", severity: "warning", message: `契约 ${contract.id} 缺少 doc。`, suggestion: "为契约配置 contracts/*.md 文档路径。" });
    } else if (!(await pathExists(ensureInsideContext(contract.doc)))) {
      issues.push({ code: "PCTX005", severity: "error", message: `契约 ${contract.id} 引用的文档不存在：${contract.doc}`, suggestion: "创建该文档或修正 metadata/contracts.json。" });
    }
    for (const authority of contract.authority ?? []) {
      if (!(await pathExists(path.resolve(PROJECT_ROOT, authority)))) {
        issues.push({ code: "PCTX005", severity: "warning", message: `契约 ${contract.id} 的权威来源不存在：${authority}`, suggestion: "确认 schema/OpenAPI/proto 路径，或清空 authority。" });
      }
    }
  }

  const sourceFiles = projectFiles.filter((file) => {
    if (file.startsWith(".project-context/")) return false;
    if (file === "package.json" || file === "tsconfig.json") return false;
    return /\.(ts|tsx|js|jsx|vue|py|go|java|rs|php|rb|cs|kt|swift|sql|prisma)$/.test(file);
  });
  const moduleGlobs = modules.flatMap((module) => module.files ?? []);
  for (const file of sourceFiles) {
    if (moduleGlobs.length > 0 && !moduleGlobs.some((pattern) => matchesGlob(file, pattern))) {
      issues.push({ code: "PCTX004", severity: "info", message: `代码文件没有归属模块：${file}`, suggestion: "如该文件属于业务模块，请更新 metadata/modules.json。" });
    }
  }

  const generatedGraphPath = ensureInsideContext("generated/project-graph.json");
  if (!(await pathExists(generatedGraphPath))) {
    issues.push({ code: "PCTX007", severity: "warning", message: "缺少 generated/project-graph.json。", suggestion: "运行 project_context_generate_graph。" });
  }
  return { issues };
}

const ResponseFormatSchema = z.enum(["markdown", "json"]).default("markdown");

const server = new McpServer({
  name: "project-context-mcp-server",
  version: "0.1.0"
});

server.registerTool(
  "project_context_search",
  {
    title: "Search Project Context",
    description: "搜索 .project-context 中的语义文档，返回匹配文档片段、路径和类型。只读取本地项目上下文，不修改文件。",
    inputSchema: {
      query: z.string().min(1).max(200).describe("要搜索的关键词或业务问题。"),
      scope: z.array(z.enum(["modules", "contracts", "decisions", "active-work", "agent-notes", "designs", "all"])).default(["all"]).describe("搜索范围，默认 all。"),
      limit: z.number().int().min(1).max(50).default(10).describe("最大返回条数。"),
      response_format: ResponseFormatSchema
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async ({ query, scope, limit, response_format }) => {
    try {
      const files = await listContextFiles();
      const selected = files.filter((file) => {
        if (scope.includes("all")) return true;
        return scope.some((item) => file.startsWith(`${item}/`) || file === `${item}.md`);
      });
      const matches = [];
      for (const file of selected) {
        const content = await readContextFile(file);
        const haystack = `${file}\n${content}`;
        if (!includesCaseInsensitive(haystack, query)) continue;
        matches.push({
          path: file,
          title: extractTitle(content) ?? file,
          type: file.split("/")[0],
          summary: summarize(content, query, 320)
        });
      }
      const output = { query, total: matches.length, count: Math.min(matches.length, limit), matches: matches.slice(0, limit) };
      const markdown = matches.length
        ? [`# Project Context 搜索结果`, "", `查询：${query}`, `命中：${matches.length}`, "", ...output.matches.map((match) => `## ${match.title}\n\n- 路径：\`${match.path}\`\n- 类型：${match.type}\n- 摘要：${match.summary}`)].join("\n")
        : `# Project Context 搜索结果\n\n查询：${query}\n\n未命中相关文档。`;
      return formatOutput(output, markdown, response_format);
    } catch (error) {
      return errorText("搜索项目上下文失败", error instanceof Error ? error.message : String(error));
    }
  }
);

server.registerTool(
  "project_context_get_module",
  {
    title: "Get Project Context Module",
    description: "按模块 id 读取模块元数据、模块文档和关联契约文档。只读取本地 .project-context。",
    inputSchema: {
      module_id: z.string().min(1).max(100).describe("metadata/modules.json 中的模块 id。"),
      include_contracts: z.boolean().default(true).describe("是否包含关联契约文档。"),
      response_format: ResponseFormatSchema
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async ({ module_id, include_contracts, response_format }) => {
    try {
      const [modules, contracts] = await Promise.all([loadModules(), loadContracts()]);
      const module = modules.find((item) => item.id === module_id);
      if (!module) return errorText(`未找到模块：${module_id}`, "请检查 .project-context/metadata/modules.json 中是否存在该模块。");
      const moduleDoc = await getModuleDoc(module);
      const relatedContracts = include_contracts
        ? await Promise.all((module.contracts ?? []).map(async (id) => {
            const contract = contracts.find((item) => item.id === id);
            if (!contract) return { id, metadata: null, content: null };
            const content = contract.doc && (await pathExists(ensureInsideContext(contract.doc))) ? await readContextFile(contract.doc) : null;
            return { id, metadata: contract, content };
          }))
        : [];
      const output = { module, module_doc: moduleDoc, contracts: relatedContracts };
      const markdown = [`# ${module.name ?? module.id}`, "", `- 模块 ID：${module.id}`, `- 文档：${module.doc ?? "未配置"}`, `- 代码：${module.files?.join("、") || "未配置"}`, `- 契约：${module.contracts?.join("、") || "无"}`, `- 依赖：${module.depends_on?.join("、") || "无"}`, "", moduleDoc.content ?? "模块文档不存在或未配置。"].join("\n");
      return formatOutput(output, markdown, response_format);
    } catch (error) {
      return errorText("读取模块上下文失败", error instanceof Error ? error.message : String(error));
    }
  }
);

server.registerTool(
  "project_context_map_files",
  {
    title: "Map Files to Project Context",
    description: "根据文件路径匹配 metadata/modules.json 和 metadata/contracts.json，判断影响哪些模块和契约。只读取本地上下文。",
    inputSchema: {
      files: z.array(z.string().min(1).max(500)).min(1).max(200).describe("相对项目根目录的文件路径列表，例如 src/search/ranking.ts。"),
      response_format: ResponseFormatSchema
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async ({ files, response_format }) => {
    try {
      const [modules, contracts] = await Promise.all([loadModules(), loadContracts()]);
      const mapped = files.map((file) => {
        const normalized = normalizeSlashes(file);
        const matchedModules = modules.filter((module) => (module.files ?? []).some((pattern) => matchesGlob(normalized, pattern)));
        const matchedContracts = contracts.filter((contract) => {
          const docMatch = contract.doc ? normalized === contract.doc || normalized === `.project-context/${contract.doc}` : false;
          const authorityMatch = (contract.authority ?? []).some((authority) => normalized === normalizeSlashes(authority));
          return docMatch || authorityMatch;
        });
        return {
          file: normalized,
          modules: matchedModules.map((module) => ({ id: module.id, name: module.name ?? module.id, doc: module.doc ?? null })),
          contracts: matchedContracts.map((contract) => ({ id: contract.id, name: contract.name ?? contract.id, doc: contract.doc ?? null }))
        };
      });
      const affectedModules = [...new Set(mapped.flatMap((item) => item.modules.map((module) => module.id)))];
      const affectedContracts = [...new Set(mapped.flatMap((item) => item.contracts.map((contract) => contract.id)))];
      const output = { files: mapped, affected_modules: affectedModules, affected_contracts: affectedContracts };
      const markdown = [`# 文件影响映射`, "", `- 影响模块：${affectedModules.join("、") || "无"}`, `- 影响契约：${affectedContracts.join("、") || "无"}`, "", ...mapped.map((item) => `## ${item.file}\n\n- 模块：${item.modules.map((module) => module.id).join("、") || "未匹配"}\n- 契约：${item.contracts.map((contract) => contract.id).join("、") || "未匹配"}`)].join("\n");
      return formatOutput(output, markdown, response_format);
    } catch (error) {
      return errorText("映射文件影响失败", error instanceof Error ? error.message : String(error));
    }
  }
);

server.registerTool(
  "project_context_generate_graph",
  {
    title: "Generate Project Context Graph",
    description: "根据 metadata 和文档生成 generated/project-graph.json、project-tree.md、project-graph.mmd。会写入 .project-context/generated。",
    inputSchema: {
      write_files: z.boolean().default(true).describe("是否写入 generated 文件。默认 true。"),
      response_format: ResponseFormatSchema
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async ({ write_files, response_format }) => {
    try {
      const graph = await buildGraph();
      if (write_files) await writeGeneratedGraph(graph);
      const output = { graph, written: write_files ? ["generated/project-graph.json", "generated/project-tree.md", "generated/project-graph.mmd"] : [] };
      const markdown = [`# 项目图谱生成完成`, "", `- 模块数：${graph.modules.length}`, `- 契约数：${graph.contracts.length}`, `- 边数：${graph.edges.length}`, `- 写入文件：${output.written.join("、") || "未写入"}`].join("\n");
      return formatOutput(output, markdown, response_format);
    } catch (error) {
      return errorText("生成项目图谱失败", error instanceof Error ? error.message : String(error));
    }
  }
);

server.registerTool(
  "project_context_check_staleness",
  {
    title: "Check Project Context Staleness",
    description: "检查 .project-context 的 metadata、文档路径、文件 glob、契约权威来源和生成物是否存在明显过期或不一致。只读，除非 write_report=true。",
    inputSchema: {
      write_report: z.boolean().default(false).describe("是否写入 generated/stale-report.md。默认 false。"),
      response_format: ResponseFormatSchema
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async ({ write_report, response_format }) => {
    try {
      const result = await checkStaleness();
      const markdown = result.issues.length
        ? [`# 文档过期检查报告`, "", `发现问题：${result.issues.length}`, "", ...result.issues.map((issue) => `## ${issue.code} ${issue.severity}\n\n- 问题：${issue.message}\n- 建议：${issue.suggestion}`)].join("\n")
        : "# 文档过期检查报告\n\n未发现明显问题。";
      if (write_report) await fs.writeFile(ensureInsideContext("generated/stale-report.md"), `${markdown}\n`);
      return formatOutput({ ...result, report_written: write_report }, markdown, response_format);
    } catch (error) {
      return errorText("检查文档过期状态失败", error instanceof Error ? error.message : String(error));
    }
  }
);

server.registerTool(
  "project_context_sync_docs_from_diff",
  {
    title: "Suggest Project Context Doc Sync From Diff",
    description: "根据 diff 文本或变更文件列表推断需要检查的模块文档和契约文档。只生成建议，不修改文件。",
    inputSchema: {
      diff: z.string().max(200000).optional().describe("git diff 文本，可选。会解析 +++ b/path 文件。"),
      files: z.array(z.string().min(1).max(500)).default([]).describe("已知变更文件列表，可选。"),
      response_format: ResponseFormatSchema
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async ({ diff, files, response_format }) => {
    try {
      const diffFiles = [...(diff?.matchAll(/^\+\+\+ b\/(.+)$/gm) ?? [])].map((match) => match[1]);
      const changedFiles = [...new Set([...files, ...diffFiles].map(normalizeSlashes))];
      if (changedFiles.length === 0) return errorText("没有可分析的变更文件", "请传入 files，或传入包含 +++ b/path 的 git diff 文本。");
      const [modules, contracts] = await Promise.all([loadModules(), loadContracts()]);
      const suggestions: Array<{ doc: string; reason: string; action: string }> = [];
      const affectedModules = new Set<string>();
      const affectedContracts = new Set<string>();
      for (const file of changedFiles) {
        for (const module of modules) {
          if ((module.files ?? []).some((pattern) => matchesGlob(file, pattern))) {
            affectedModules.add(module.id);
            if (module.doc) suggestions.push({ doc: module.doc, reason: `${file} 命中模块 ${module.id} 的代码范围。`, action: "review" });
            for (const contractId of module.contracts ?? []) affectedContracts.add(contractId);
          }
        }
        for (const contract of contracts) {
          const authorityHit = (contract.authority ?? []).some((authority) => normalizeSlashes(authority) === file);
          const docHit = contract.doc ? file === contract.doc || file === `.project-context/${contract.doc}` : false;
          if (authorityHit || docHit) {
            affectedContracts.add(contract.id);
            if (contract.doc) suggestions.push({ doc: contract.doc, reason: `${file} 影响契约 ${contract.id}。`, action: "review" });
          }
        }
      }
      for (const contractId of affectedContracts) {
        const contract = contracts.find((item) => item.id === contractId);
        if (contract?.doc) suggestions.push({ doc: contract.doc, reason: `受影响模块关联契约 ${contractId}。`, action: "review" });
      }
      const uniqueSuggestions = Array.from(new Map(suggestions.map((item) => [`${item.doc}|${item.reason}`, item])).values());
      const output = { changed_files: changedFiles, affected_modules: [...affectedModules], affected_contracts: [...affectedContracts], suggestions: uniqueSuggestions };
      const markdown = [`# 文档同步建议`, "", `- 变更文件：${changedFiles.length}`, `- 影响模块：${output.affected_modules.join("、") || "无"}`, `- 影响契约：${output.affected_contracts.join("、") || "无"}`, "", ...uniqueSuggestions.map((item) => `## ${item.doc}\n\n- 原因：${item.reason}\n- 动作：${item.action}`)].join("\n");
      return formatOutput(output, markdown, response_format);
    } catch (error) {
      return errorText("生成文档同步建议失败", error instanceof Error ? error.message : String(error));
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Project Context MCP server failed to start:", error);
  process.exit(1);
});
