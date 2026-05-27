#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if ! command -v git >/dev/null 2>&1; then
  printf '\nProject Context 收工检查：未找到 git，无法自动检测变更。若本轮修改了任一子项目代码、契约、模块边界或共享数据语义，请运行根目录 Project Context MCP 同步检查，并人工审核是否更新根目录 .project-context/。\n'
  exit 0
fi

collect_git_changes() {
  local dir="$1"
  local prefix="$2"
  (
    cd "$dir"
    {
      git diff --name-only
      git diff --cached --name-only
      git ls-files --others --exclude-standard
    } 2>/dev/null | sed '/^$/d' | sed "s#^#${prefix}#"
  )
}

changed_files=""

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  changed_files="$(collect_git_changes "$ROOT_DIR" "")"
else
  for git_dir in */.git; do
    [ -e "$git_dir" ] || continue
    subproject="${git_dir%/.git}"
    sub_changes="$(collect_git_changes "$ROOT_DIR/$subproject" "$subproject/")"
    if [ -n "$sub_changes" ]; then
      changed_files="${changed_files}${changed_files:+$'\n'}${sub_changes}"
    fi
  done
fi

changed_files="$(printf '%s\n' "$changed_files" | sed '/^$/d' | sort -u)"

if [ -z "$changed_files" ]; then
  exit 0
fi

code_files="$(printf '%s\n' "$changed_files" | grep -E '\.(ts|tsx|js|jsx|vue|java|kt|go|py|rs|php|rb|cs|swift|sql|prisma|proto|graphql|gql|yaml|yml|json)$' || true)"
context_files="$(printf '%s\n' "$changed_files" | grep -E '^\.project-context/' || true)"
root_config_files="$(printf '%s\n' "$changed_files" | grep -E '^(CLAUDE\.md|\.mcp\.json|\.claude/|project-context-mcp/)' || true)"
subproject_rule_files="$(printf '%s\n' "$changed_files" | grep -E '^[^/]+/CLAUDE\.md$' || true)"
contract_like_files="$(printf '%s\n' "$changed_files" | grep -E '(openapi|swagger|schema|proto|graphql|\.sql|prisma|contracts/|api)' || true)"

if [ -z "$code_files" ] && [ -z "$context_files" ] && [ -z "$root_config_files" ] && [ -z "$subproject_rule_files" ] && [ -z "$contract_like_files" ]; then
  exit 0
fi

printf '\nProject Context 收工检查：检测到可能影响根目录统一上下文、子项目规则或跨项目契约的变更。\n'
printf '\n根目录统一维护 CodeGraph、Project Context MCP 和 .project-context/；子项目只维护自己的 CLAUDE.md 技术规则。\n'
printf '\n变更文件：\n'
printf '%s\n' "$changed_files" | sed 's/^/- /'

if [ -n "$code_files" ]; then
  printf '\n代码/配置相关变更：\n'
  printf '%s\n' "$code_files" | sed 's/^/- /'
fi

if [ -n "$context_files" ]; then
  printf '\n根目录 Project Context 文档变更：\n'
  printf '%s\n' "$context_files" | sed 's/^/- /'
fi

if [ -n "$root_config_files" ]; then
  printf '\n根目录协作配置变更：\n'
  printf '%s\n' "$root_config_files" | sed 's/^/- /'
fi

if [ -n "$subproject_rule_files" ]; then
  printf '\n子项目 CLAUDE.md 规则变更：\n'
  printf '%s\n' "$subproject_rule_files" | sed 's/^/- /'
fi

if [ -n "$contract_like_files" ]; then
  printf '\n契约相关变更：\n'
  printf '%s\n' "$contract_like_files" | sed 's/^/- /'
fi

printf '\n请在结束前确认：\n'
printf '1. 是否已用根目录 Project Context MCP 根据变更文件运行 project_context_sync_docs_from_diff。\n'
printf '2. 是否需要更新根目录 .project-context/modules/、contracts/、decisions/ 或 active-work/。\n'
printf '3. 如果变更的是子项目技术规则，应只更新对应子项目 CLAUDE.md，不要新增子项目 .project-context/ 或 .mcp.json。\n'
printf '4. 如更新了根目录项目语义，请运行 project_context_generate_graph。\n'
printf '5. 请运行 project_context_check_staleness 检查根目录 metadata、文档和生成物一致性。\n'
printf '6. 文档更新需要人工审核后再视为完成。\n'
