import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { exportToCSV, parseCSV, downloadCSVTemplate } from "./csv-handler.js";
import { renderTreemap as renderTreemapModule } from "./treemap-renderer.js";
import * as ScenarioManager from "./scenario-manager.js";
import { calculateDilution, formatOwnership, formatCurrency, convertSAFEs } from "./dilution-calculator.js";

// State
let capTable = null;
let currentViewMode = "shares";
let currentZoomNode = null;
let editingRound = null;
let editingAllocation = null;
let editingRoundId = null;
let eventListenersInitialized = false;

// Initialize event listeners (only once)
function initEventListeners() {
  if (eventListenersInitialized) return;
  eventListenersInitialized = true;

  // View mode
  document.getElementById("view-shares").addEventListener("click", () => setViewMode("shares"));
  document.getElementById("view-value").addEventListener("click", () => setViewMode("value"));
  document.getElementById("toggle-stats").addEventListener("click", toggleStatsModal);
  document.getElementById("toggle-sidebar").addEventListener("click", toggleSidebar);
  document.getElementById("reset-zoom").addEventListener("click", resetZoom);
  document.getElementById("save-company").addEventListener("click", saveCompanyInfo);

  // Stats modal
  document.getElementById("stats-modal-close").addEventListener("click", closeStatsModal);
  document.getElementById("stats-done").addEventListener("click", closeStatsModal);
  document.getElementById("add-round").addEventListener("click", () => openRoundModal());

  // Round modal
  document.getElementById("round-modal-close").addEventListener("click", closeRoundModal);
  document.getElementById("round-cancel").addEventListener("click", closeRoundModal);
  document.getElementById("round-save").addEventListener("click", saveRound);
  document.getElementById("round-type").addEventListener("change", toggleRoundTypeFields);

  // Dilution preview - update when price or money raised changes
  document.getElementById("round-price").addEventListener("input", updateDilutionPreview);
  document.getElementById("round-money-raised").addEventListener("input", updateDilutionPreview);

  // Allocations list modal
  document.getElementById("allocations-list-close").addEventListener("click", closeAllocationsListModal);
  document.getElementById("allocations-list-done").addEventListener("click", closeAllocationsListModal);
  document.getElementById("add-allocation-btn").addEventListener("click", () => {
    const roundId = editingRoundId;
    closeAllocationsListModal();
    openAllocationModal(roundId);
  });

  // Allocation modal
  document.getElementById("allocation-modal-close").addEventListener("click", closeAllocationModal);
  document.getElementById("allocation-cancel").addEventListener("click", closeAllocationModal);
  document.getElementById("allocation-save").addEventListener("click", saveAllocation);

  // Offer calculator - update as user types shares
  document.getElementById("allocation-shares").addEventListener("input", updateOfferCalculator);

  // Global keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // ESC to close modals
    if (e.key === "Escape") {
      const visibleModals = document.querySelectorAll(".modal.visible");
      if (visibleModals.length > 0) {
        const lastModal = visibleModals[visibleModals.length - 1];
        const closeBtn = lastModal.querySelector(".modal-close");
        if (closeBtn) closeBtn.click();
      }
    }

    // Enter to submit forms (when focused in modal inputs)
    if (e.key === "Enter" && !e.shiftKey) {
      const activeElement = document.activeElement;
      if (activeElement && activeElement.tagName === "INPUT" && activeElement.type !== "textarea") {
        const modal = activeElement.closest(".modal");
        if (modal && modal.classList.contains("visible")) {
          // Find the primary save button in the modal
          const saveBtn = modal.querySelector("button[id$='-save']");
          if (saveBtn) {
            e.preventDefault();
            saveBtn.click();
          }
        }
      }
    }
  });

  // CSV import/export
  document.getElementById("export-csv").addEventListener("click", () => exportToCSV(capTable));
  document.getElementById("import-csv").addEventListener("click", () => {
    document.getElementById("csv-file-input").click();
  });
  document.getElementById("csv-file-input").addEventListener("change", handleCSVImport);

  // Scenario management
  document.getElementById("scenario-select").addEventListener("change", async (e) => {
    const scenarioName = e.target.value;
    const loadedCapTable = await ScenarioManager.loadScenario(scenarioName, init);
    if (loadedCapTable) {
      capTable = loadedCapTable;
      refreshUI();
    }
  });
  document.getElementById("save-scenario-quick").addEventListener("click", () => {
    ScenarioManager.quickSaveScenario(capTable);
  });
  document.getElementById("save-scenario").addEventListener("click", () => {
    ScenarioManager.saveScenario(capTable);
  });
  document.getElementById("delete-scenario").addEventListener("click", () => {
    ScenarioManager.deleteScenario(init);
  });

  // Window resize
  window.addEventListener("resize", () => renderTreemap());
}

// Initialize
async function init() {
  // Load data from API (SQLite backend) with localStorage fallback
  try {
    const response = await fetch("/api/captable");
    if (response.ok) {
      capTable = await response.json();
    } else {
      // Fallback to localStorage
      const saved = localStorage.getItem("capTable");
      if (saved) {
        capTable = JSON.parse(saved);
      } else {
        capTable = createSampleCapTable();
        await saveData();
      }
    }
  } catch (error) {
    console.warn("API not available, using localStorage:", error);
    // Fallback to localStorage
    const saved = localStorage.getItem("capTable");
    if (saved) {
      capTable = JSON.parse(saved);
    } else {
      capTable = createSampleCapTable();
      await saveData();
    }
  }

  // Set company name
  document.getElementById("company-name").textContent = capTable.companyName;
  document.getElementById("input-company-name").value = capTable.companyName;
  document.getElementById("input-authorized-shares").value = capTable.authorizedShares;

  // Initialize event listeners (only once)
  initEventListeners();

  // Render
  updateStats();
  updateLegend();
  renderTreemap();

  // Load scenarios list
  ScenarioManager.loadScenariosList();

  // Render rounds list
  renderRoundsList();
}

// Refresh all UI elements
function refreshUI() {
  document.getElementById("company-name").textContent = capTable.companyName;
  document.getElementById("input-company-name").value = capTable.companyName;
  document.getElementById("input-authorized-shares").value = capTable.authorizedShares;
  updateStats();
  updateLegend();
  renderTreemap();
  renderRoundsList();
}

// CSV Import Handler
function handleCSVImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const rounds = parseCSV(e.target.result);

      if (confirm(`Import ${rounds.length} rounds? This will replace existing rounds.`)) {
        capTable.rounds = rounds;
        await saveData();
        renderRoundsList();
        updateStats();
        updateLegend();
        renderTreemap();
        alert('Import successful!');
      }
    } catch (error) {
      alert('Error importing CSV: ' + error.message);
    }
  };
  reader.readAsText(file);

  // Reset input
  event.target.value = '';
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
async function saveCompanyInfo() {
  capTable.companyName = document.getElementById("input-company-name").value;
  capTable.authorizedShares = parseInt(document.getElementById("input-authorized-shares").value);
  document.getElementById("company-name").textContent = capTable.companyName;
  await saveData();
  updateStats();
  renderTreemap();
}

// Save to API (SQLite) with localStorage fallback
async function saveData() {
  try {
    const response = await fetch("/api/captable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capTable),
    });

    if (!response.ok) {
      throw new Error("API save failed");
    }

    // Also save to localStorage as backup
    localStorage.setItem("capTable", JSON.stringify(capTable));
  } catch (error) {
    console.warn("API not available, using localStorage only:", error);
    localStorage.setItem("capTable", JSON.stringify(capTable));
  }
}

// Calculate effective price per share based on latest round
function getEffectivePricePerShare() {
  const totalIssued = capTable.rounds.reduce(
    (sum, round) => sum + round.allocations.reduce((s, a) => s + a.shares, 0),
    0
  );

  // Find the most recent priced round
  const pricedRounds = capTable.rounds.filter(r => r.type === 'priced' && r.pricePerShare);
  if (pricedRounds.length > 0) {
    // Use the last priced round's price
    const lastPricedRound = pricedRounds[pricedRounds.length - 1];
    return lastPricedRound.pricePerShare;
  } else {
    // No priced rounds yet - use SAFE valuation cap if available
    const safeRounds = capTable.rounds.filter(r => r.type === 'safe' && r.valuationCap);
    if (safeRounds.length > 0) {
      // Use the highest SAFE valuation cap as proxy
      const highestCap = Math.max(...safeRounds.map(r => r.valuationCap));
      return totalIssued > 0 ? highestCap / totalIssued : 0;
    }
  }
  return 0;
}

// Update statistics
function updateStats() {
  const totalIssued = capTable.rounds.reduce(
    (sum, round) => sum + round.allocations.reduce((s, a) => s + a.shares, 0),
    0
  );
  const fullyDiluted = capTable.authorizedShares;
  const remaining = fullyDiluted - totalIssued;
  const remainingPct = ((remaining / fullyDiluted) * 100).toFixed(2);
  const totalHolders = capTable.rounds.reduce((sum, round) => sum + round.allocations.length, 0);

  // Calculate current effective valuation and price per share
  const effectivePricePerShare = getEffectivePricePerShare();
  const effectiveValuation = totalIssued * effectivePricePerShare;

  document.getElementById("stat-allocated").textContent = formatNumber(totalIssued);
  document.getElementById("stat-fully-diluted").textContent = formatNumber(fullyDiluted);
  document.getElementById("stat-unallocated").textContent = formatNumber(remaining);
  document.getElementById("stat-unallocated-pct").textContent = `${remainingPct}% of cap`;
  document.getElementById("stat-rounds").textContent = capTable.rounds.length;
  document.getElementById("stat-holders").textContent = totalHolders;
  document.getElementById("stat-valuation").textContent = effectiveValuation > 0
    ? `$${formatNumber(Math.round(effectiveValuation))}`
    : 'N/A';
  document.getElementById("stat-price-per-share").textContent = effectivePricePerShare > 0
    ? `$${effectivePricePerShare.toFixed(4)}`
    : 'N/A';

  // Store globally for treemap renderer
  window._effectivePricePerShare = effectivePricePerShare;
  window._fullyDilutedShares = fullyDiluted;
}

// Toggle stats modal
function toggleStatsModal() {
  const modal = document.getElementById("stats-modal");
  if (modal.classList.contains("visible")) {
    closeStatsModal();
  } else {
    updateStats(); // Refresh stats before showing
    modal.classList.add("visible");
  }
}

// Close stats modal
function closeStatsModal() {
  document.getElementById("stats-modal").classList.remove("visible");
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
  renderTreemapModule(capTable, currentViewMode, currentZoomNode, zoomToNode);
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
        name: "Pre-Seed SAFE",
        type: "safe",
        valuationCap: 10000000,
        date: "2021-06-01",
        color: "#10b981",
        allocations: [
          { id: "safe-1", holderName: "Angel Investor 1", shares: 200050, type: "preferred" },
          { id: "safe-2", holderName: "Angel Investor 2", shares: 200051, type: "preferred" },
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

    let roundDetails = `${formatNumber(totalShares)} shares • ${round.allocations.length} allocations`;
    if (round.type === "safe" && round.valuationCap) {
      roundDetails += ` • $${formatNumber(round.valuationCap)} cap`;
    } else if (round.type === "equity-pool") {
      roundDetails += ` • Equity Pool`;
    } else if (round.pricePerShare) {
      roundDetails += ` • $${round.pricePerShare}/share`;
    }

    item.innerHTML = `
      <div class="list-item-info">
        <div class="list-item-title" style="color: ${round.color}">${round.name}</div>
        <div class="list-item-details">${roundDetails}</div>
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

function toggleRoundTypeFields() {
  const type = document.getElementById("round-type").value;
  const priceGroup = document.getElementById("price-group");
  const moneyRaisedGroup = document.getElementById("money-raised-group");
  const capGroup = document.getElementById("valuation-cap-group");
  const investmentGroup = document.getElementById("investment-amount-group");
  const poolAuthorizedGroup = document.getElementById("pool-authorized-group");
  const dilutionPreview = document.getElementById("dilution-preview");

  if (type === "safe") {
    priceGroup.style.display = "none";
    moneyRaisedGroup.style.display = "none";
    capGroup.style.display = "block";
    investmentGroup.style.display = "block";
    poolAuthorizedGroup.style.display = "none";
    dilutionPreview.style.display = "none";
  } else if (type === "equity-pool") {
    priceGroup.style.display = "none";
    moneyRaisedGroup.style.display = "none";
    capGroup.style.display = "none";
    investmentGroup.style.display = "none";
    poolAuthorizedGroup.style.display = "block";
    dilutionPreview.style.display = "none";
  } else {
    // Priced round
    priceGroup.style.display = "block";
    moneyRaisedGroup.style.display = "block";
    capGroup.style.display = "none";
    investmentGroup.style.display = "none";
    poolAuthorizedGroup.style.display = "none";
    dilutionPreview.style.display = "block";
    updateDilutionPreview();
  }
}

function updateDilutionPreview() {
  const priceStr = document.getElementById("round-price").value.trim();
  const moneyRaisedStr = document.getElementById("round-money-raised").value.trim();
  const previewDiv = document.getElementById("dilution-preview-content");

  if (!priceStr || !moneyRaisedStr) {
    previewDiv.innerHTML = '<div style="color: #9ca3af;">Enter price per share and money raised to see dilution impact</div>';
    return;
  }

  const pricePerShare = parseFloat(priceStr);
  const moneyRaised = parseFloat(moneyRaisedStr);

  if (isNaN(pricePerShare) || isNaN(moneyRaised) || pricePerShare <= 0 || moneyRaised <= 0) {
    previewDiv.innerHTML = '<div style="color: #9ca3af;">Enter valid numbers</div>';
    return;
  }

  const dilution = calculateDilution(capTable, moneyRaised, pricePerShare);

  const lines = [];
  lines.push(`<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">`);
  lines.push(`  <div><strong>Pre-Money:</strong> ${formatCurrency(dilution.preMoney)}</div>`);
  lines.push(`  <div><strong>Post-Money:</strong> ${formatCurrency(dilution.postMoney)}</div>`);
  lines.push(`</div>`);
  lines.push(`<div style="margin-bottom: 8px;"><strong>New Shares:</strong> ${dilution.newShares.toLocaleString()}</div>`);

  // Show top diluted holders
  const sortedDilution = Array.from(dilution.dilutionImpact.entries())
    .sort((a, b) => b[1].currentOwnership - a[1].currentOwnership)
    .slice(0, 5);

  if (sortedDilution.length > 0) {
    lines.push(`<div style="margin-top: 8px; font-size: 11px;">`);
    lines.push(`  <div style="font-weight: bold; margin-bottom: 4px;">Top Holders:</div>`);
    sortedDilution.forEach(([holder, data]) => {
      const arrow = data.dilution > 0 ? '↓' : '';
      lines.push(`  <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">`);
      lines.push(`    <span>${holder}:</span>`);
      lines.push(`    <span>${formatOwnership(data.currentOwnership)} ${arrow} ${formatOwnership(data.postMoneyOwnership)}</span>`);
      lines.push(`  </div>`);
    });
    lines.push(`</div>`);
  }

  previewDiv.innerHTML = lines.join('');
}

function openRoundModal(roundId = null) {
  editingRound = roundId;
  const modal = document.getElementById("round-modal");
  const title = document.getElementById("round-modal-title");

  if (roundId) {
    const round = capTable.rounds.find((r) => r.id === roundId);
    title.textContent = "Edit Round";
    document.getElementById("round-name").value = round.name;
    document.getElementById("round-type").value = round.type || "priced";
    document.getElementById("round-price").value = round.pricePerShare || "";
    document.getElementById("round-money-raised").value = round.moneyRaised || "";
    document.getElementById("round-valuation-cap").value = round.valuationCap || "";
    document.getElementById("round-investment-amount").value = round.investmentAmount || "";
    document.getElementById("round-pool-authorized").value = round.authorizedShares || "";
    document.getElementById("round-date").value = round.date;
    document.getElementById("round-color").value = round.color;
  } else {
    title.textContent = "Add Round";
    document.getElementById("round-name").value = "";
    document.getElementById("round-type").value = "priced";
    document.getElementById("round-price").value = "";
    document.getElementById("round-money-raised").value = "";
    document.getElementById("round-valuation-cap").value = "";
    document.getElementById("round-investment-amount").value = "";
    document.getElementById("round-pool-authorized").value = "";
    document.getElementById("round-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("round-color").value = "#" + Math.floor(Math.random() * 16777215).toString(16);
  }

  toggleRoundTypeFields();
  modal.classList.add("visible");

  // Auto-focus first input
  setTimeout(() => document.getElementById("round-name").focus(), 100);
}

function closeRoundModal() {
  document.getElementById("round-modal").classList.remove("visible");
  editingRound = null;
}

async function saveRound() {
  const name = document.getElementById("round-name").value.trim();
  const type = document.getElementById("round-type").value;
  const priceStr = document.getElementById("round-price").value.trim();
  const moneyRaisedStr = document.getElementById("round-money-raised").value.trim();
  const capStr = document.getElementById("round-valuation-cap").value.trim();
  const investmentStr = document.getElementById("round-investment-amount").value.trim();
  const poolAuthorizedStr = document.getElementById("round-pool-authorized").value.trim();
  const date = document.getElementById("round-date").value;
  const color = document.getElementById("round-color").value;

  if (!name) {
    alert("❌ Round name is required");
    document.getElementById("round-name").focus();
    return;
  }

  if (!date) {
    alert("❌ Date is required");
    document.getElementById("round-date").focus();
    return;
  }

  // Validate type-specific required fields
  if (type === "priced") {
    if (!price || price <= 0) {
      alert("❌ Price per share must be greater than 0 for priced rounds");
      document.getElementById("round-price").focus();
      return;
    }
    if (!moneyRaised || moneyRaised <= 0) {
      alert("❌ Money raised must be greater than 0 for priced rounds");
      document.getElementById("round-money-raised").focus();
      return;
    }
  } else if (type === "safe") {
    if (!cap || cap <= 0) {
      alert("❌ Valuation cap must be greater than 0 for SAFE rounds");
      document.getElementById("round-valuation-cap").focus();
      return;
    }
  } else if (type === "pool") {
    if (!poolAuthorized || poolAuthorized <= 0) {
      alert("❌ Pool authorized shares must be greater than 0");
      document.getElementById("round-pool-authorized").focus();
      return;
    }
  }

  const price = priceStr ? parseFloat(priceStr) : undefined;
  const moneyRaised = moneyRaisedStr ? parseFloat(moneyRaisedStr) : undefined;
  const cap = capStr ? parseFloat(capStr) : undefined;
  const investment = investmentStr ? parseFloat(investmentStr) : undefined;
  const poolAuthorized = poolAuthorizedStr ? parseInt(poolAuthorizedStr) : undefined;

  // Check if this is a priced round and there are unconverted SAFEs
  let shouldConvertSAFEs = false;
  if (type === "priced" && price && moneyRaised && !editingRound) {
    const hasSAFEs = capTable.rounds.some(r => r.type === "safe" && !r.converted);
    if (hasSAFEs) {
      shouldConvertSAFEs = confirm(
        "This is your first priced round! Would you like to automatically convert SAFE notes to equity shares?\n\n" +
        "This will calculate the conversion price based on the valuation cap and update SAFE allocations."
      );
    }
  }

  if (editingRound) {
    // Edit existing
    const round = capTable.rounds.find((r) => r.id === editingRound);
    round.name = name;
    round.type = type;
    round.pricePerShare = type === "priced" ? price : undefined;
    round.moneyRaised = type === "priced" ? moneyRaised : undefined;
    round.valuationCap = type === "safe" ? cap : undefined;
    round.investmentAmount = type === "safe" ? investment : undefined;
    round.authorizedShares = type === "equity-pool" ? poolAuthorized : undefined;
    round.date = date;
    round.color = color;
  } else {
    // Add new
    const id = "round-" + Date.now();
    capTable.rounds.push({
      id,
      name,
      type,
      pricePerShare: type === "priced" ? price : undefined,
      moneyRaised: type === "priced" ? moneyRaised : undefined,
      valuationCap: type === "safe" ? cap : undefined,
      investmentAmount: type === "safe" ? investment : undefined,
      authorizedShares: type === "equity-pool" ? poolAuthorized : undefined,
      date,
      color,
      allocations: [],
    });
  }

  // Convert SAFEs if user confirmed
  if (shouldConvertSAFEs) {
    const totalShares = capTable.rounds.reduce((sum, r) =>
      sum + r.allocations.reduce((s, a) => s + a.shares, 0), 0
    );
    const preMoney = price * totalShares;
    const postMoney = preMoney + moneyRaised;

    const { conversions, updatedRounds } = convertSAFEs(capTable, postMoney, price);
    capTable.rounds = updatedRounds;

    // Show conversion summary
    if (conversions.length > 0) {
      let summary = "SAFE Conversion Summary:\n\n";
      conversions.forEach(c => {
        summary += `${c.holderName} (${c.roundName}):\n`;
        summary += `  Investment: ${formatCurrency(c.investmentAmount)}\n`;
        summary += `  Conversion Price: ${formatCurrency(c.conversionPrice)}/share\n`;
        summary += `  Shares: ${c.originalShares.toLocaleString()} → ${c.convertedShares.toLocaleString()}\n`;
        if (c.discount > 0) {
          summary += `  Discount: ${c.discount.toFixed(1)}%\n`;
        }
        summary += `\n`;
      });
      alert(summary);
    }
  }

  await saveData();
  renderRoundsList();
  updateLegend();
  renderTreemap();
  closeRoundModal();
}

async function deleteRound(roundId) {
  if (!confirm("Delete this round and all its allocations?")) return;

  capTable.rounds = capTable.rounds.filter((r) => r.id !== roundId);
  await saveData();
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

  const modal = document.getElementById("allocations-list-modal");
  const title = document.getElementById("allocations-list-title");
  const container = document.getElementById("allocations-list-container");

  title.textContent = `Manage Allocations - ${round.name}`;

  // Render allocations list
  container.innerHTML = "";

  if (round.allocations.length === 0) {
    container.innerHTML = "<p style='padding: 20px; text-align: center; color: #6b7280;'>No allocations yet. Click '+ Add Allocation' to get started.</p>";
  } else {
    round.allocations.forEach((allocation) => {
      const item = document.createElement("div");
      item.className = "list-item";

      let details;
      if (round.type === 'safe' && allocation.investmentAmount) {
        details = `${formatCurrency(allocation.investmentAmount)} → ${formatNumber(allocation.shares)} shares • ${allocation.type}`;
      } else {
        details = `${formatNumber(allocation.shares)} shares • ${allocation.type}`;
      }
      if (allocation.vestingSchedule) {
        details += ` • ${allocation.vestingSchedule}`;
      }

      item.innerHTML = `
        <div class="list-item-info">
          <div class="list-item-title">${allocation.holderName}</div>
          <div class="list-item-details">${details}</div>
          ${allocation.notes ? `<div class="list-item-details" style="font-style: italic;">${allocation.notes}</div>` : ""}
        </div>
        <div class="list-item-actions">
          <button class="secondary" onclick="editAllocation('${roundId}', '${allocation.id}')">Edit</button>
          <button class="danger" onclick="deleteAllocation('${roundId}', '${allocation.id}')">Delete</button>
        </div>
      `;
      container.appendChild(item);
    });
  }

  modal.classList.add("visible");
}

function closeAllocationsListModal() {
  document.getElementById("allocations-list-modal").classList.remove("visible");
  editingRoundId = null;
}

function openAllocationModal(roundId, allocationId = null) {
  editingRoundId = roundId;
  editingAllocation = allocationId;
  const modal = document.getElementById("allocation-modal");
  const title = document.getElementById("allocation-modal-title");
  const round = capTable.rounds.find((r) => r.id === roundId);

  // Update label based on round type
  const sharesLabel = document.querySelector('label[for="allocation-shares"]');
  if (round.type === 'safe') {
    sharesLabel.textContent = 'Investment Amount ($)';
    document.getElementById("allocation-shares").placeholder = "100000";
  } else {
    sharesLabel.textContent = 'Shares';
    document.getElementById("allocation-shares").placeholder = "100000";
  }

  if (allocationId) {
    const allocation = round.allocations.find((a) => a.id === allocationId);
    title.textContent = "Edit Allocation";
    document.getElementById("allocation-holder").value = allocation.holderName;
    // For SAFE rounds, show investment amount; otherwise show shares
    if (round.type === 'safe' && allocation.investmentAmount) {
      document.getElementById("allocation-shares").value = allocation.investmentAmount;
    } else {
      document.getElementById("allocation-shares").value = allocation.shares;
    }
    document.getElementById("allocation-type").value = allocation.type;
    document.getElementById("allocation-vesting").value = allocation.vestingSchedule || "";
    document.getElementById("allocation-notes").value = allocation.notes || "";
  } else {
    title.textContent = `Add Allocation - ${round.name}`;
    document.getElementById("allocation-holder").value = "";

    // Smart pre-fill: For priced rounds, calculate shares from money raised / price
    // For SAFE rounds, leave empty (user enters investment amount)
    let defaultValue = "";
    if (round.type === 'priced' && round.moneyRaised && round.pricePerShare) {
      // Calculate total shares for this round
      const totalShares = Math.round(round.moneyRaised / round.pricePerShare);
      // If this is the first allocation, suggest the full amount
      if (round.allocations.length === 0) {
        defaultValue = totalShares;
      }
    }

    document.getElementById("allocation-shares").value = defaultValue;
    document.getElementById("allocation-type").value = "common";
    document.getElementById("allocation-vesting").value = "";
    document.getElementById("allocation-notes").value = "";
  }

  modal.classList.add("visible");

  // Update offer calculator on modal open
  updateOfferCalculator();

  // Auto-focus first input
  setTimeout(() => document.getElementById("allocation-holder").focus(), 100);
}

function closeAllocationModal() {
  document.getElementById("allocation-modal").classList.remove("visible");
  editingAllocation = null;
  // Don't clear editingRoundId - we might be returning to allocations list

  // Hide offer calculator
  document.getElementById("offer-calculator").style.display = "none";
}

// Update the Quick Offer Calculator as user types
function updateOfferCalculator() {
  const sharesInput = document.getElementById("allocation-shares").value.trim();
  const calculator = document.getElementById("offer-calculator");

  if (!sharesInput || isNaN(sharesInput) || parseFloat(sharesInput) <= 0) {
    calculator.style.display = "none";
    return;
  }

  const shares = parseFloat(sharesInput);
  const totalIssued = capTable.rounds.reduce(
    (sum, round) => sum + round.allocations.reduce((s, a) => s + a.shares, 0),
    0
  );
  const fullyDiluted = capTable.authorizedShares;
  const effectivePrice = window._effectivePricePerShare || 0;

  // Calculate percentages
  const fdPct = ((shares / fullyDiluted) * 100).toFixed(4);
  const issuedPct = ((shares / totalIssued) * 100).toFixed(4);
  const estimatedValue = shares * effectivePrice;

  // Update display
  document.getElementById("offer-calc-shares").textContent = `${formatNumber(Math.round(shares))} shares`;
  document.getElementById("offer-calc-fd-pct").textContent = `= ${fdPct}% fully diluted ✓ (use for offers)`;
  document.getElementById("offer-calc-issued-pct").textContent = `= ${issuedPct}% of currently issued`;

  if (effectivePrice > 0) {
    document.getElementById("offer-calc-value").textContent = `Est. value: $${formatNumber(Math.round(estimatedValue))} (at $${effectivePrice.toFixed(2)}/share)`;
  } else {
    document.getElementById("offer-calc-value").textContent = `Est. value: N/A (no priced rounds yet)`;
  }

  calculator.style.display = "block";
}

async function saveAllocation() {
  const holder = document.getElementById("allocation-holder").value.trim();
  const sharesStr = document.getElementById("allocation-shares").value.trim();
  const type = document.getElementById("allocation-type").value;
  const vesting = document.getElementById("allocation-vesting").value.trim();
  const notes = document.getElementById("allocation-notes").value.trim();

  if (!holder) {
    alert("❌ Holder name is required");
    document.getElementById("allocation-holder").focus();
    return;
  }

  if (!sharesStr) {
    const round = capTable.rounds.find((r) => r.id === editingRoundId);
    const fieldName = round.type === 'safe' ? 'investment amount' : 'shares';
    alert(`❌ ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is required`);
    document.getElementById("allocation-shares").focus();
    return;
  }

  const round = capTable.rounds.find((r) => r.id === editingRoundId);

  // For SAFE rounds, treat input as investment amount and calculate shares
  let shares, investmentAmount;
  if (round.type === 'safe' && round.valuationCap) {
    investmentAmount = parseFloat(sharesStr);
    if (isNaN(investmentAmount) || investmentAmount <= 0) {
      alert("❌ Investment amount must be greater than 0");
      document.getElementById("allocation-shares").focus();
      return;
    }
    // Calculate ownership percentage: investment / valuation cap
    // Then apply to total issued shares (excluding this SAFE round to avoid circular dependency)
    const ownershipPercent = investmentAmount / round.valuationCap;

    // Total issued shares excluding ALL SAFE rounds (since they don't have fixed shares yet)
    const totalIssuedExcludingSAFEs = capTable.rounds
      .filter(r => r.type !== 'safe')
      .reduce((sum, r) => sum + r.allocations.reduce((s, a) => s + a.shares, 0), 0);

    // Apply ownership % to the non-SAFE issued shares
    shares = Math.round(ownershipPercent * totalIssuedExcludingSAFEs);
  } else {
    shares = parseInt(sharesStr);
    if (isNaN(shares) || shares <= 0) {
      alert("❌ Number of shares must be greater than 0");
      document.getElementById("allocation-shares").focus();
      return;
    }
  }

  // Validate: For priced rounds, check if allocations exceed money raised
  if (round.type === 'priced' && round.moneyRaised && round.pricePerShare) {
    const expectedTotalShares = Math.round(round.moneyRaised / round.pricePerShare);
    const currentAllocated = round.allocations
      .filter(a => !editingAllocation || a.id !== editingAllocation)
      .reduce((sum, a) => sum + a.shares, 0);
    const newTotal = currentAllocated + shares;

    if (newTotal > expectedTotalShares) {
      const overage = newTotal - expectedTotalShares;
      const shouldContinue = confirm(
        `Warning: Total allocated shares (${formatNumber(newTotal)}) exceeds round total (${formatNumber(expectedTotalShares)}) by ${formatNumber(overage)} shares.\n\n` +
        `Expected from money raised: $${formatNumber(round.moneyRaised)} ÷ $${round.pricePerShare} = ${formatNumber(expectedTotalShares)} shares\n\n` +
        `Do you want to continue anyway?`
      );
      if (!shouldContinue) {
        return;
      }
    }
  }

  if (editingAllocation) {
    // Edit existing
    const allocation = round.allocations.find((a) => a.id === editingAllocation);
    allocation.holderName = holder;
    allocation.shares = shares;
    allocation.investmentAmount = investmentAmount;
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
      investmentAmount,
      type,
      vestingSchedule: vesting || undefined,
      notes: notes || undefined,
    });
  }

  await saveData();
  renderRoundsList();
  updateStats();
  renderTreemap();
  closeAllocationModal();

  // Reopen allocations list to show updated list
  if (editingRoundId) {
    manageAllocations(editingRoundId);
  }
}

function editAllocation(roundId, allocationId) {
  openAllocationModal(roundId, allocationId);
}

async function deleteAllocation(roundId, allocationId) {
  if (!confirm("Delete this allocation?")) return;

  const round = capTable.rounds.find((r) => r.id === roundId);
  round.allocations = round.allocations.filter((a) => a.id !== allocationId);

  await saveData();
  renderRoundsList();
  updateStats();
  renderTreemap();

  // Refresh allocations list if it's open
  if (document.getElementById("allocations-list-modal").classList.contains("visible")) {
    manageAllocations(roundId);
  }
}

window.manageAllocations = manageAllocations;
window.openAllocationModal = openAllocationModal;
window.editAllocation = editAllocation;
window.deleteAllocation = deleteAllocation;

// Start
init();

