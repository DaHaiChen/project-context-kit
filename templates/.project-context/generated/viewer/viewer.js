const state = {
  context: null,
  nodes: [],
  edges: [],
  filteredNodes: [],
  selectedId: null,
  query: "",
  type: "all"
};

const elements = {
  title: document.querySelector("#project-title"),
  search: document.querySelector("#search"),
  typeFilter: document.querySelector("#type-filter"),
  tree: document.querySelector("#tree"),
  graph: document.querySelector("#graph"),
  detail: document.querySelector("#detail"),
  selectedType: document.querySelector("#selected-type"),
  nodeCount: document.querySelector("#node-count"),
  edgeCount: document.querySelector("#edge-count")
};

init().catch((error) => {
  elements.detail.className = "detail";
  elements.detail.textContent = `加载 Project Context 失败：${error.message}`;
});

async function init() {
  if (window.__PROJECT_CONTEXT__) {
    state.context = window.__PROJECT_CONTEXT__;
  } else {
    const response = await fetch("./context.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    state.context = await response.json();
  }
  state.nodes = state.context.normalized?.nodes ?? [];
  state.edges = state.context.normalized?.edges ?? [];
  state.selectedId = state.nodes[0]?.id ?? null;

  elements.title.textContent = state.context.graph?.project?.name || "项目上下文图谱";
  setupFilters();
  bindEvents();
  applyFilters();
}

function setupFilters() {
  const types = [...new Set(state.nodes.map((node) => node.type))].sort();
  for (const type of types) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = typeLabel(type);
    elements.typeFilter.append(option);
  }
}

function bindEvents() {
  elements.search.addEventListener("input", () => {
    state.query = elements.search.value.trim().toLowerCase();
    applyFilters();
  });

  elements.typeFilter.addEventListener("change", () => {
    state.type = elements.typeFilter.value;
    applyFilters();
  });

  window.addEventListener("resize", () => renderGraph());
}

function applyFilters() {
  state.filteredNodes = state.nodes.filter((node) => {
    if (state.type !== "all" && node.type !== state.type) return false;
    if (!state.query) return true;
    const doc = documentForNode(node);
    const text = [node.label, node.path, node.summary, JSON.stringify(node.metadata ?? {}), doc?.content].filter(Boolean).join("\n").toLowerCase();
    return text.includes(state.query);
  });

  if (!state.filteredNodes.some((node) => node.id === state.selectedId)) {
    state.selectedId = state.filteredNodes[0]?.id ?? null;
  }

  renderTree();
  renderGraph();
  renderDetail();
}

function renderTree() {
  elements.tree.replaceChildren();
  const groups = groupBy(state.filteredNodes, (node) => typeLabel(node.type));
  elements.nodeCount.textContent = String(state.filteredNodes.length);

  if (state.filteredNodes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "detail empty";
    empty.textContent = "没有匹配的节点。";
    elements.tree.append(empty);
    return;
  }

  for (const [groupName, nodes] of groups) {
    const group = document.createElement("section");
    group.className = "tree-group";

    const title = document.createElement("div");
    title.className = "tree-title";
    title.textContent = `${groupName} · ${nodes.length}`;
    group.append(title);

    for (const node of nodes.sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"))) {
      const button = document.createElement("button");
      button.className = node.id === state.selectedId ? "active" : "";
      button.type = "button";
      button.addEventListener("click", () => selectNode(node.id));

      const dot = document.createElement("span");
      dot.className = `dot ${node.type}`;
      button.append(dot);

      const text = document.createElement("span");
      const label = document.createElement("span");
      label.className = "node-label";
      label.textContent = node.label;
      text.append(label);

      if (node.path) {
        const nodePath = document.createElement("span");
        nodePath.className = "node-path";
        nodePath.textContent = node.path;
        text.append(nodePath);
      }

      button.append(text);
      group.append(button);
    }

    elements.tree.append(group);
  }
}

function renderGraph() {
  const svg = elements.graph;
  svg.replaceChildren();
  const width = svg.clientWidth || 800;
  const height = svg.clientHeight || 520;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const visible = new Set(state.filteredNodes.map((node) => node.id));
  const nodes = state.filteredNodes;
  const edges = state.edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to));
  elements.edgeCount.textContent = String(edges.length);

  if (nodes.length === 0) return;

  const positions = layoutNodes(nodes, width, height);
  const edgeLayer = svg.appendChild(svgElement("g"));
  const nodeLayer = svg.appendChild(svgElement("g"));

  for (const edge of edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;

    const line = svgElement("line", {
      class: "graph-edge",
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y
    });
    edgeLayer.append(line);

    const label = svgElement("text", {
      class: "graph-edge-label",
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2 - 5,
      "text-anchor": "middle"
    });
    label.textContent = edge.type;
    edgeLayer.append(label);
  }

  for (const node of nodes) {
    const point = positions.get(node.id);
    const group = svgElement("g", {
      class: `graph-node ${node.id === state.selectedId ? "active" : ""}`,
      transform: `translate(${point.x}, ${point.y})`,
      tabindex: "0"
    });
    group.addEventListener("click", () => selectNode(node.id));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") selectNode(node.id);
    });

    group.append(svgElement("circle", { r: radiusForType(node.type), fill: colorForType(node.type) }));
    const label = svgElement("text", { y: radiusForType(node.type) + 18, "text-anchor": "middle" });
    label.textContent = truncate(node.label, 18);
    group.append(label);
    nodeLayer.append(group);
  }
}

function renderDetail() {
  const node = state.nodes.find((item) => item.id === state.selectedId);
  elements.detail.replaceChildren();

  if (!node) {
    elements.selectedType.textContent = "未选择";
    elements.detail.className = "detail empty";
    elements.detail.textContent = "没有可展示的节点。";
    return;
  }

  elements.selectedType.textContent = typeLabel(node.type);
  elements.detail.className = "detail";

  const title = document.createElement("h3");
  title.textContent = node.label;
  elements.detail.append(title);

  if (node.summary) {
    const summary = document.createElement("p");
    summary.textContent = node.summary;
    elements.detail.append(summary);
  }

  const meta = document.createElement("div");
  meta.className = "meta-grid";
  appendMeta(meta, "类型", typeLabel(node.type));
  if (node.path) appendMeta(meta, "路径", node.path);
  appendMeta(meta, "节点 ID", node.id);

  for (const [key, value] of Object.entries(node.metadata ?? {})) {
    if (value === null || value === undefined || value === "" || key === "business_rules") continue;
    appendMeta(meta, key, formatValue(value));
  }

  elements.detail.append(meta);

  const doc = documentForNode(node);
  if (doc?.content) {
    const markdown = document.createElement("section");
    markdown.className = "markdown";
    markdown.innerHTML = renderMarkdown(doc.content);
    elements.detail.append(markdown);
  }
}

function selectNode(id) {
  state.selectedId = id;
  renderTree();
  renderGraph();
  renderDetail();
}

function layoutNodes(nodes, width, height) {
  const positions = new Map();
  const centerX = width / 2;
  const centerY = height / 2;
  const project = nodes.find((node) => node.type === "project");

  if (project) positions.set(project.id, { x: centerX, y: centerY });

  const others = nodes.filter((node) => node.id !== project?.id);
  const radius = Math.max(120, Math.min(width, height) * 0.36);
  const rings = Math.max(1, Math.ceil(others.length / 18));

  others.forEach((node, index) => {
    const ring = Math.floor(index / 18);
    const ringItems = Math.min(18, others.length - ring * 18);
    const angle = (Math.PI * 2 * (index % 18)) / ringItems - Math.PI / 2;
    const ringRadius = radius * ((ring + 1) / rings);
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * ringRadius,
      y: centerY + Math.sin(angle) * ringRadius
    });
  });

  if (!project && nodes.length === 1) positions.set(nodes[0].id, { x: centerX, y: centerY });
  return positions;
}

function documentForNode(node) {
  const docs = state.context?.documents ?? [];
  if (node.path) return docs.find((doc) => doc.path === node.path);
  if (node.id.startsWith("doc:")) return docs.find((doc) => `doc:${doc.path}` === node.id);
  return null;
}

function appendMeta(parent, key, value) {
  const item = document.createElement("div");
  item.className = "meta-item";

  const keyElement = document.createElement("span");
  keyElement.className = "meta-key";
  keyElement.textContent = key;
  item.append(keyElement);

  const valueElement = document.createElement("span");
  valueElement.className = "meta-value";
  valueElement.textContent = value;
  item.append(valueElement);

  parent.append(item);
}

function renderMarkdown(markdown) {
  const escaped = escapeHtml(markdown);
  const lines = escaped.split("\n");
  const html = [];
  let inCode = false;
  let listOpen = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      html.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      html.push(`${line}\n`);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^\s*-\s+(.+)$/);
    if (bullet) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }

    if (line.trim()) html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  if (listOpen) html.push("</ul>");
  if (inCode) html.push("</code></pre>");
  return html.join("");
}

function inlineMarkdown(text) {
  return text.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function groupBy(values, getKey) {
  const groups = new Map();
  for (const value of values) {
    const key = getKey(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-Hans-CN"));
}

function typeLabel(type) {
  const labels = {
    project: "项目",
    module: "模块",
    contract: "契约",
    "module-doc": "模块文档",
    "contract-doc": "契约文档",
    decision: "决策",
    "active-work": "当前工作",
    "agent-note": "Agent 交接",
    design: "设计文档",
    doc: "文档"
  };
  return labels[type] ?? type;
}

function colorForType(type) {
  if (type === "project") return "#5b5fc7";
  if (type === "module" || type === "module-doc") return "#3b82f6";
  if (type === "contract" || type === "contract-doc") return "#f59e0b";
  if (type === "active-work" || type === "decision") return "#ef4444";
  return "#10b981";
}

function radiusForType(type) {
  if (type === "project") return 28;
  if (type === "module" || type === "contract") return 22;
  return 16;
}

function truncate(value, length) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function formatValue(value) {
  if (Array.isArray(value)) return value.length ? value.join("、") : "无";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}
