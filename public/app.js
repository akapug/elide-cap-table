import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// State
let capTable = null;
let currentViewMode = "shares";
let currentZoomNode = null;
let editingRound = null;
let editingAllocation = null;
let editingRoundId = null;

// Initialize
async function init() {
  // Load data from localStorage or use sample
  const saved = localStorage.getItem("capTable");
  if (saved) {
    capTable = JSON.parse(saved);
  } else {
    capTable = createSampleCapTable();
    saveData();
  }

  // Set company name
  document.getElementById("company-name").textContent = capTable.companyName;
  document.getElementById("input-company-name").value = capTable.companyName;
  document.getElementById("input-authorized-shares").value = capTable.authorizedShares;

  // Render
  updateStats();
  updateLegend();
  renderTreemap();

  // Event listeners
  document.getElementById("view-shares").addEventListener("click", () => setViewMode("shares"));
  document.getElementById("view-value").addEventListener("click", () => setViewMode("value"));
  document.getElementById("toggle-sidebar").addEventListener("click", toggleSidebar);
  document.getElementById("reset-zoom").addEventListener("click", resetZoom);
  document.getElementById("save-company").addEventListener("click", saveCompanyInfo);
  document.getElementById("add-round").addEventListener("click", () => openRoundModal());

  // Round modal
  document.getElementById("round-modal-close").addEventListener("click", closeRoundModal);
  document.getElementById("round-cancel").addEventListener("click", closeRoundModal);
  document.getElementById("round-save").addEventListener("click", saveRound);

  // Allocation modal
  document.getElementById("allocation-modal-close").addEventListener("click", closeAllocationModal);
  document.getElementById("allocation-cancel").addEventListener("click", closeAllocationModal);
  document.getElementById("allocation-save").addEventListener("click", saveAllocation);

  // Window resize
  window.addEventListener("resize", () => renderTreemap());

  // Render rounds list
  renderRoundsList();
}

// View mode
function setViewMode(mode) {
  currentViewMode = mode;
  document.getElementById("view-shares").classList.toggle("active", mode === "shares");
  document.getElementById("view-value").classList.toggle("active", mode === "value");
  renderTreemap();
}

// Sidebar
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("hidden");
  // Re-render to adjust treemap size
  setTimeout(() => renderTreemap(), 100);
}

// Save company info
function saveCompanyInfo() {
  capTable.companyName = document.getElementById("input-company-name").value;
  capTable.authorizedShares = parseInt(document.getElementById("input-authorized-shares").value);
  document.getElementById("company-name").textContent = capTable.companyName;
  saveData();
  updateStats();
  renderTreemap();
}

// Save to localStorage
function saveData() {
  localStorage.setItem("capTable", JSON.stringify(capTable));
}

// Update statistics
function updateStats() {
  const totalAllocated = capTable.rounds.reduce(
    (sum, round) => sum + round.allocations.reduce((s, a) => s + a.shares, 0),
    0
  );
  const unallocated = capTable.authorizedShares - totalAllocated;
  const totalHolders = capTable.rounds.reduce((sum, round) => sum + round.allocations.length, 0);

  document.getElementById("stat-allocated").textContent = formatNumber(totalAllocated);
  document.getElementById("stat-unallocated").textContent = formatNumber(unallocated);
  document.getElementById("stat-rounds").textContent = capTable.rounds.length;
  document.getElementById("stat-holders").textContent = totalHolders;
}

// Update legend
function updateLegend() {
  const legendItems = document.getElementById("legend-items");
  legendItems.innerHTML = "";

  capTable.rounds.forEach((round) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <div class="legend-color" style="background: ${round.color}"></div>
      <div class="legend-label">${round.name}</div>
    `;
    legendItems.appendChild(item);
  });

  // Add unallocated
  const unallocatedItem = document.createElement("div");
  unallocatedItem.className = "legend-item";
  unallocatedItem.innerHTML = `
    <div class="legend-color" style="background: #6b7280"></div>
    <div class="legend-label">Unallocated</div>
  `;
  legendItems.appendChild(unallocatedItem);
}

// Render treemap
function renderTreemap() {
  const container = document.getElementById("treemap-container");
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Clear existing
  d3.select("#treemap").selectAll("*").remove();

  // Convert data to tree
  const treeData = capTableToTree(capTable, currentViewMode);

  // Create hierarchy
  const root = d3.hierarchy(treeData)
    .sum(d => d.value)
    .sort((a, b) => b.value - a.value);

  // Create treemap layout on the full tree first
  const treemap = d3.treemap()
    .size([width, height])
    .padding(2)
    .round(true);

  treemap(root);

  // Determine which node to render (zoom level)
  const nodeToRender = currentZoomNode || root;

  // If we're zoomed in, rescale the children to fill the viewport
  if (currentZoomNode && currentZoomNode.children) {
    const x0 = currentZoomNode.x0;
    const y0 = currentZoomNode.y0;
    const x1 = currentZoomNode.x1;
    const y1 = currentZoomNode.y1;

    const scaleX = width / (x1 - x0);
    const scaleY = height / (y1 - y0);

    currentZoomNode.children.forEach(child => {
      child.x0 = (child.x0 - x0) * scaleX;
      child.y0 = (child.y0 - y0) * scaleY;
      child.x1 = (child.x1 - x0) * scaleX;
      child.y1 = (child.y1 - y0) * scaleY;
    });
  }

  // Create SVG
  const svg = d3.select("#treemap")
    .attr("width", width)
    .attr("height", height);

  // Show children of the current zoom node
  const nodesToShow = nodeToRender.children || [nodeToRender];

  // Create cells
  const cell = svg.selectAll("g")
    .data(nodesToShow)
    .join("g")
    .attr("transform", d => `translate(${d.x0},${d.y0})`);

  // Rectangles
  cell.append("rect")
    .attr("class", "node")
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("fill", d => d.data.roundColor || "#6b7280")
    .on("click", (event, d) => zoomToNode(d))
    .on("mouseenter", (event, d) => showTooltip(event, d))
    .on("mousemove", (event) => moveTooltip(event))
    .on("mouseleave", hideTooltip);

  // Labels
  cell.append("text")
    .attr("class", "node-label")
    .attr("x", 4)
    .attr("y", 16)
    .text(d => {
      const width = d.x1 - d.x0;
      if (width < 60) return "";
      return d.data.name;
    });

  // Values
  cell.append("text")
    .attr("class", "node-value")
    .attr("x", 4)
    .attr("y", 30)
    .text(d => {
      const width = d.x1 - d.x0;
      if (width < 80) return "";
      if (currentViewMode === "shares") {
        return formatNumber(d.value) + " shares";
      } else {
        return formatCurrency(d.value);
      }
    });

  updateBreadcrumb();
}

// Zoom to node
function zoomToNode(node) {
  if (node.children) {
    currentZoomNode = node;
    renderTreemap();
  }
}

// Reset zoom
function resetZoom() {
  currentZoomNode = null;
  renderTreemap();
}

// Breadcrumb
function updateBreadcrumb() {
  const breadcrumb = document.getElementById("breadcrumb");
  breadcrumb.innerHTML = "";

  const path = [];
  let node = currentZoomNode;
  while (node) {
    path.unshift(node);
    node = node.parent;
  }

  // Add root
  const rootSpan = document.createElement("span");
  rootSpan.textContent = capTable.companyName;
  rootSpan.addEventListener("click", resetZoom);
  breadcrumb.appendChild(rootSpan);

  // Add path
  path.forEach((node) => {
    const span = document.createElement("span");
    span.textContent = node.data.name;
    span.addEventListener("click", () => {
      currentZoomNode = node;
      renderTreemap();
    });
    breadcrumb.appendChild(span);
  });
}

// Tooltip
function showTooltip(event, d) {
  const tooltip = document.getElementById("tooltip");
  const title = tooltip.querySelector(".tooltip-title");
  const content = tooltip.querySelector(".tooltip-content");

  title.textContent = d.data.name;

  let html = "";
  if (d.data.round) {
    html += `<div class="tooltip-row"><span class="tooltip-label">Round:</span> <span>${d.data.round}</span></div>`;
  }
  if (d.data.type) {
    html += `<div class="tooltip-row"><span class="tooltip-label">Type:</span> <span>${d.data.type}</span></div>`;
  }

  // Shares
  const shares = currentViewMode === "shares" ? d.value : (d.data.pricePerShare ? d.value / d.data.pricePerShare : d.value);
  html += `<div class="tooltip-row"><span class="tooltip-label">Shares:</span> <span>${formatNumber(shares)}</span></div>`;

  // Percentage
  const total = capTable.authorizedShares;
  html += `<div class="tooltip-row"><span class="tooltip-label">Ownership:</span> <span>${calculatePercentage(shares, total)}</span></div>`;

  // Value (if in value mode or has price)
  if (currentViewMode === "value" && d.data.pricePerShare) {
    html += `<div class="tooltip-row"><span class="tooltip-label">Value:</span> <span>${formatCurrency(d.value)}</span></div>`;
    html += `<div class="tooltip-row"><span class="tooltip-label">Price/Share:</span> <span>${formatCurrency(d.data.pricePerShare)}</span></div>`;
  }

  if (d.data.vestingSchedule) {
    html += `<div class="tooltip-row"><span class="tooltip-label">Vesting:</span> <span>${d.data.vestingSchedule}</span></div>`;
  }

  content.innerHTML = html;
  tooltip.classList.add("visible");
  moveTooltip(event);
}

function moveTooltip(event) {
  const tooltip = document.getElementById("tooltip");
  tooltip.style.left = (event.pageX + 15) + "px";
  tooltip.style.top = (event.pageY + 15) + "px";
}

function hideTooltip() {
  document.getElementById("tooltip").classList.remove("visible");
}

// Helper functions (from types.ts)
function createSampleCapTable() {
  return {
    companyName: "Elide",
    authorizedShares: 12893506,
    rounds: [
      {
        id: "common",
        name: "Common Shares",
        date: "2020-01-01",
        color: "#3b82f6",
        allocations: [
          { id: "common-1", holderName: "Common Stockholders", shares: 11400000, type: "common" },
        ],
      },
      {
        id: "safe",
        name: "SAFE Financings",
        pricePerShare: 0.035,
        date: "2021-06-01",
        color: "#10b981",
        allocations: [
          { id: "safe-1", holderName: "SAFE Investors", shares: 400101, type: "preferred" },
        ],
      },
      {
        id: "equity-plan",
        name: "2023 Equity Incentive Plan",
        date: "2023-01-01",
        color: "#f59e0b",
        allocations: [
          { id: "equity-1", holderName: "Employee Options Pool", shares: 1093405, type: "option", vestingSchedule: "4 year vest, 1 year cliff" },
        ],
      },
    ],
  };
}

function capTableToTree(capTable, mode) {
  const getValue = (shares, pricePerShare) => {
    if (mode === "shares") return shares;
    return shares * (pricePerShare || 0);
  };

  const children = capTable.rounds.map((round) => ({
    name: round.name,
    round: round.name,
    roundColor: round.color,
    value: 0,
    children: round.allocations.map((allocation) => ({
      name: allocation.holderName,
      value: getValue(allocation.shares, round.pricePerShare),
      round: round.name,
      roundColor: round.color,
      type: allocation.type,
      pricePerShare: round.pricePerShare,
      holderName: allocation.holderName,
      vestingSchedule: allocation.vestingSchedule,
    })),
  }));

  const totalAllocated = capTable.rounds.reduce(
    (sum, round) => sum + round.allocations.reduce((s, a) => s + a.shares, 0),
    0
  );
  const unallocated = capTable.authorizedShares - totalAllocated;

  if (unallocated > 0) {
    children.push({
      name: "Unallocated",
      value: unallocated,
      round: "Unallocated",
      roundColor: "#6b7280",
    });
  }

  return {
    name: capTable.companyName,
    value: 0,
    children,
  };
}

function formatNumber(num) {
  return num.toLocaleString();
}

function formatCurrency(num) {
  return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calculatePercentage(part, total) {
  return ((part / total) * 100).toFixed(2) + "%";
}

// Rounds Management
function renderRoundsList() {
  const container = document.getElementById("rounds-list");
  container.innerHTML = "";

  capTable.rounds.forEach((round) => {
    const totalShares = round.allocations.reduce((sum, a) => sum + a.shares, 0);
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div class="list-item-info">
        <div class="list-item-title" style="color: ${round.color}">${round.name}</div>
        <div class="list-item-details">
          ${formatNumber(totalShares)} shares • ${round.allocations.length} allocations
          ${round.pricePerShare ? ` • $${round.pricePerShare}/share` : ""}
        </div>
      </div>
      <div class="list-item-actions">
        <button class="secondary" onclick="editRound('${round.id}')">Edit</button>
        <button class="secondary" onclick="manageAllocations('${round.id}')">Allocations</button>
        <button class="danger" onclick="deleteRound('${round.id}')">Delete</button>
      </div>
    `;
    container.appendChild(item);
  });
}

function openRoundModal(roundId = null) {
  editingRound = roundId;
  const modal = document.getElementById("round-modal");
  const title = document.getElementById("round-modal-title");

  if (roundId) {
    const round = capTable.rounds.find((r) => r.id === roundId);
    title.textContent = "Edit Round";
    document.getElementById("round-name").value = round.name;
    document.getElementById("round-price").value = round.pricePerShare || "";
    document.getElementById("round-date").value = round.date;
    document.getElementById("round-color").value = round.color;
  } else {
    title.textContent = "Add Round";
    document.getElementById("round-name").value = "";
    document.getElementById("round-price").value = "";
    document.getElementById("round-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("round-color").value = "#" + Math.floor(Math.random() * 16777215).toString(16);
  }

  modal.classList.add("visible");
}

function closeRoundModal() {
  document.getElementById("round-modal").classList.remove("visible");
  editingRound = null;
}

function saveRound() {
  const name = document.getElementById("round-name").value.trim();
  const priceStr = document.getElementById("round-price").value.trim();
  const date = document.getElementById("round-date").value;
  const color = document.getElementById("round-color").value;

  if (!name || !date) {
    alert("Please fill in all required fields");
    return;
  }

  const price = priceStr ? parseFloat(priceStr) : undefined;

  if (editingRound) {
    // Edit existing
    const round = capTable.rounds.find((r) => r.id === editingRound);
    round.name = name;
    round.pricePerShare = price;
    round.date = date;
    round.color = color;
  } else {
    // Add new
    const id = "round-" + Date.now();
    capTable.rounds.push({
      id,
      name,
      pricePerShare: price,
      date,
      color,
      allocations: [],
    });
  }

  saveData();
  renderRoundsList();
  updateLegend();
  renderTreemap();
  closeRoundModal();
}

function deleteRound(roundId) {
  if (!confirm("Delete this round and all its allocations?")) return;

  capTable.rounds = capTable.rounds.filter((r) => r.id !== roundId);
  saveData();
  renderRoundsList();
  updateLegend();
  renderTreemap();
}

window.editRound = openRoundModal;
window.deleteRound = deleteRound;

// Allocations Management
function manageAllocations(roundId) {
  editingRoundId = roundId;
  const round = capTable.rounds.find((r) => r.id === roundId);

  // Show modal with list of allocations
  const modal = document.getElementById("allocation-modal");
  const title = document.getElementById("allocation-modal-title");
  title.textContent = `Manage Allocations - ${round.name}`;

  // For now, just open add allocation modal
  openAllocationModal(roundId);
}

function openAllocationModal(roundId, allocationId = null) {
  editingRoundId = roundId;
  editingAllocation = allocationId;
  const modal = document.getElementById("allocation-modal");
  const title = document.getElementById("allocation-modal-title");

  if (allocationId) {
    const round = capTable.rounds.find((r) => r.id === roundId);
    const allocation = round.allocations.find((a) => a.id === allocationId);
    title.textContent = "Edit Allocation";
    document.getElementById("allocation-holder").value = allocation.holderName;
    document.getElementById("allocation-shares").value = allocation.shares;
    document.getElementById("allocation-type").value = allocation.type;
    document.getElementById("allocation-vesting").value = allocation.vestingSchedule || "";
    document.getElementById("allocation-notes").value = allocation.notes || "";
  } else {
    const round = capTable.rounds.find((r) => r.id === roundId);
    title.textContent = `Add Allocation - ${round.name}`;
    document.getElementById("allocation-holder").value = "";
    document.getElementById("allocation-shares").value = "";
    document.getElementById("allocation-type").value = "common";
    document.getElementById("allocation-vesting").value = "";
    document.getElementById("allocation-notes").value = "";
  }

  modal.classList.add("visible");
}

function closeAllocationModal() {
  document.getElementById("allocation-modal").classList.remove("visible");
  editingAllocation = null;
  editingRoundId = null;
}

function saveAllocation() {
  const holder = document.getElementById("allocation-holder").value.trim();
  const sharesStr = document.getElementById("allocation-shares").value.trim();
  const type = document.getElementById("allocation-type").value;
  const vesting = document.getElementById("allocation-vesting").value.trim();
  const notes = document.getElementById("allocation-notes").value.trim();

  if (!holder || !sharesStr) {
    alert("Please fill in holder name and shares");
    return;
  }

  const shares = parseInt(sharesStr);
  if (isNaN(shares) || shares <= 0) {
    alert("Please enter a valid number of shares");
    return;
  }

  const round = capTable.rounds.find((r) => r.id === editingRoundId);

  if (editingAllocation) {
    // Edit existing
    const allocation = round.allocations.find((a) => a.id === editingAllocation);
    allocation.holderName = holder;
    allocation.shares = shares;
    allocation.type = type;
    allocation.vestingSchedule = vesting || undefined;
    allocation.notes = notes || undefined;
  } else {
    // Add new
    const id = "allocation-" + Date.now();
    round.allocations.push({
      id,
      holderName: holder,
      shares,
      type,
      vestingSchedule: vesting || undefined,
      notes: notes || undefined,
    });
  }

  saveData();
  renderRoundsList();
  updateStats();
  renderTreemap();
  closeAllocationModal();
}

function deleteAllocation(roundId, allocationId) {
  if (!confirm("Delete this allocation?")) return;

  const round = capTable.rounds.find((r) => r.id === roundId);
  round.allocations = round.allocations.filter((a) => a.id !== allocationId);

  saveData();
  renderRoundsList();
  updateStats();
  renderTreemap();
}

window.manageAllocations = manageAllocations;
window.openAllocationModal = openAllocationModal;
window.deleteAllocation = deleteAllocation;

// Start
init();

