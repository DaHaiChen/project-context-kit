#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const templateRoot = path.join(packageRoot, "templates");

const args = process.argv.slice(2);
const command = args[0];

try {
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "--version" || command === "-v") {
    console.log(readPackageVersion());
    process.exit(0);
  }

  if (command !== "init") {
    throw new Error(`Unknown command: ${command}`);
  }

  await init(parseOptions(args.slice(1)));
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  return packageJson.version;
}

function parseOptions(values) {
  const options = {
    force: false,
    dryRun: false,
    name: undefined,
    only: "all"
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--force") {
      options.force = true;
    } else if (value === "--dry-run") {
      options.dryRun = true;
    } else if (value === "--name") {
      options.name = values[index + 1];
      index += 1;
    } else if (value.startsWith("--name=")) {
      options.name = value.slice("--name=".length);
    } else if (value === "--only") {
      options.only = values[index + 1] ?? "all";
      index += 1;
    } else if (value.startsWith("--only=")) {
      options.only = value.slice("--only=".length);
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }

  return options;
}

async function init(options) {
  const cwd = process.cwd();
  const projectName = options.name || path.basename(cwd);
  const targets = buildTargets(cwd, options.only);
  const writtenGroups = new Set();

  if (targets.length === 0) {
    throw new Error(`No templates matched --only=${options.only}`);
  }

  for (const target of targets) {
    const exists = existsSync(target.to);
    const label = options.dryRun ? "dry-run" : exists && !options.force ? "skip" : "write";
    console.log(`[${label}] ${path.relative(cwd, target.to) || "."}`);

    if (options.dryRun || (exists && !options.force)) continue;

    copyRecursive(target.from, target.to);
    writtenGroups.add(target.group);
  }

  if (!options.dryRun && writtenGroups.size === 0) {
    console.log("\nNo files changed. Use --force to overwrite existing files.");
  }

  if (!options.dryRun) {
    if (writtenGroups.has("context")) patchProjectName(cwd, projectName);
    if (writtenGroups.has("hooks")) makeHookExecutable(cwd);
  }

  console.log("\nNext steps:");
  console.log("  cd project-context-mcp");
  console.log("  npm install");
  console.log("  npm run build");
  console.log("  cd ..");
  console.log("  codegraph init -i");
  console.log("  restart Claude Code");
}

function buildTargets(cwd, only) {
  const allTargets = [
    { group: "context", from: "project-context", to: ".project-context" },
    { group: "mcp", from: "project-context-mcp", to: "project-context-mcp" },
    { group: "mcp", from: "mcp.json", to: ".mcp.json" },
    { group: "hooks", from: "claude-settings.json", to: ".claude/settings.json" },
    { group: "hooks", from: "hooks/project-context-stop-check.sh", to: ".claude/hooks/project-context-stop-check.sh" },
    { group: "docs", from: "CLAUDE.md", to: "CLAUDE.md" },
    { group: "docs", from: "PROJECT_CONTEXT_WORKFLOW.md", to: "PROJECT_CONTEXT_WORKFLOW.md" },
    { group: "docs", from: "PROJECT_CONTEXT_WORKFLOW.drawio", to: "PROJECT_CONTEXT_WORKFLOW.drawio" }
  ];

  return allTargets
    .filter((target) => only === "all" || target.group === only)
    .map((target) => ({
      group: target.group,
      from: path.join(templateRoot, target.from),
      to: path.join(cwd, target.to)
    }));
}

function copyRecursive(from, to) {
  if (path.basename(from) === ".DS_Store") return;

  const stat = statSync(from);
  if (stat.isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from)) {
      copyRecursive(path.join(from, entry), path.join(to, entry));
    }
    return;
  }

  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
}

function patchProjectName(cwd, projectName) {
  const graphPath = path.join(cwd, ".project-context/generated/project-graph.json");
  if (existsSync(graphPath)) {
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));
    graph.project = { name: projectName };
    writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  }

  const treePath = path.join(cwd, ".project-context/generated/project-tree.md");
  if (existsSync(treePath)) {
    const content = readFileSync(treePath, "utf8");
    const nextContent = content.includes("项目：")
      ? content.replace(/项目：.+/g, `项目：${projectName}`)
      : content.replace(/(# 项目图谱树\n)/, `$1\n项目：${projectName}\n`);
    writeFileSync(treePath, nextContent, "utf8");
  }

  const mermaidPath = path.join(cwd, ".project-context/generated/project-graph.mmd");
  if (existsSync(mermaidPath)) {
    const content = readFileSync(mermaidPath, "utf8").replace(/project\[".*"\]/g, `project["${projectName}"]`);
    writeFileSync(mermaidPath, content, "utf8");
  }
}

function makeHookExecutable(cwd) {
  const hookPath = path.join(cwd, ".claude/hooks/project-context-stop-check.sh");
  if (existsSync(hookPath)) chmodSync(hookPath, 0o755);
}

function printHelp() {
  console.log(`project-context-kit

Usage:
  project-context-kit init [options]

Options:
  --name <name>       Set project name in generated graph
  --force             Overwrite existing files
  --dry-run           Show files without writing
  --only <part>       all|context|mcp|hooks|docs (default: all)
  -h, --help          Show help
`);
}
