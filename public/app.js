import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { exportToCSV, parseCSV, downloadCSVTemplate } from "./csv-handler.js";
import { renderTreemap as renderTreemapModule } from "./treemap-renderer.js";
import * as ScenarioManager from "./scenario-manager.js";
import { calculateDilution, formatOwnership, formatCurrency, convertSAFEs } from "./dilution-calculator.js";

// State
let capTable = null;
let currentViewMode = "shares";
let currentUnallocColorMode = "grey"; // "grey" or "tinted"
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
  document.getElementById("unalloc-grey").addEventListener("click", () => setUnallocColorMode("grey"));
  document.getElementById("unalloc-tinted").addEventListener("click", () => setUnallocColorMode("tinted"));
  document.getElementById("toggle-stats").addEventListener("click", toggleStatsModal);
  document.getElementById("toggle-sidebar").addEventListener("click", toggleSidebar);
  document.getElementById("reset-zoom").addEventListener("click", resetZoom);
  document.getElementById("save-company").addEventListener("click", saveCompanyInfo);

  // Stats modal
  document.getElementById("stats-modal-close").addEventListener("click", closeStatsModal);
  document.getElementById("stats-done").addEventListener("click", closeStatsModal);
  document.getElementById("add-round").addEventListener("click", () => openRoundModal());

  // Keyboard shortcuts modal
  document.getElementById("keyboard-help").addEventListener("click", openKeyboardShortcutsModal);
  document.getElementById("keyboard-shortcuts-close").addEventListener("click", closeKeyboardShortcutsModal);
  document.getElementById("keyboard-shortcuts-done").addEventListener("click", closeKeyboardShortcutsModal);

  // Legal disclaimer modal
  document.getElementById("legal-disclaimer").addEventListener("click", openLegalDisclaimerModal);
  document.getElementById("legal-disclaimer-close").addEventListener("click", closeLegalDisclaimerModal);
  document.getElementById("legal-disclaimer-done").addEventListener("click", closeLegalDisclaimerModal);

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
  document.getElementById("allocation-edit-round").addEventListener("click", () => {
    // Close allocation modal and open round modal for the current round
    if (editingRoundId) {
      closeAllocationModal();
      openRoundModal(editingRoundId);
    }
  });

  // Offer calculator - update as user types shares or FD %
  document.getElementById("allocation-shares").addEventListener("input", onSharesInput);
  document.getElementById("allocation-fd-pct").addEventListener("input", onFdPctInput);

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

    // V key to toggle view mode (shares ↔ valuation)
    if (e.key === "v" || e.key === "V") {
      // Don't trigger if typing in an input
      if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
        return;
      }
      const newMode = currentViewMode === "shares" ? "value" : "shares";
      setViewMode(newMode);
    }

    // N key to add new round
    if (e.key === "n" || e.key === "N") {
      // Don't trigger if typing in an input
      if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
        return;
      }
      // Only if no modal is open
      const visibleModals = document.querySelectorAll(".modal.visible");
      if (visibleModals.length === 0) {
        document.getElementById("add-round").click();
      }
    }

    // R key to reset zoom
    if (e.key === "r" || e.key === "R") {
      // Don't trigger if typing in an input
      if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
        return;
      }
      if (currentZoomNode) {
        resetZoom();
      }
    }

    // ? key to show keyboard shortcuts
    if (e.key === "?") {
      // Don't trigger if typing in an input
      if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
        return;
      }
      openKeyboardShortcutsModal();
    }
  });

  // CSV import/export
  document.getElementById("export-csv").addEventListener("click", handleCSVExport);
  document.getElementById("import-csv").addEventListener("click", () => {
    document.getElementById("csv-file-input").click();
  });
  document.getElementById("csv-file-input").addEventListener("change", handleCSVImport);

  // Custom events from treemap (double-click handlers)
  window.addEventListener('editRound', (e) => {
    openRoundModal(e.detail.roundId);
  });
  window.addEventListener('editAllocation', (e) => {
    openAllocationModal(e.detail.roundId, e.detail.allocationId);
  });

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
      const importedData = parseCSV(e.target.result);

      // Check if multi-scenario import
      if (importedData.isMultiScenario) {
        const scenarios = importedData.scenarios;
        const firstScenario = scenarios[0];

        if (!confirm(`Import ${scenarios.length} scenarios? First scenario will be current data, others will be saved scenarios.`)) {
          return;
        }

        // Import first scenario as current
        capTable.rounds = firstScenario.data.rounds;
        capTable.companyName = firstScenario.data.companyName;
        document.getElementById("company-name").textContent = capTable.companyName;
        document.getElementById("input-company-name").value = capTable.companyName;
        await saveData();

        // Save remaining scenarios
        const savedScenarios = {};
        for (let i = 1; i < scenarios.length; i++) {
          const scenario = scenarios[i];
          savedScenarios[scenario.name] = JSON.stringify(scenario.data);
        }
        localStorage.setItem("scenarios", JSON.stringify(savedScenarios));

        ScenarioManager.loadScenariosList();
        renderRoundsList();
        updateStats();
        updateLegend();
        renderTreemap();
        alert(`Import successful! ${scenarios.length} scenarios imported.`);
      } else {
        // Single scenario import
        const rounds = importedData.rounds;
        const companyName = importedData.companyName || capTable.companyName;

        if (confirm(`Import ${rounds.length} rounds? This will replace existing rounds.`)) {
          capTable.rounds = rounds;
          capTable.companyName = companyName;
          document.getElementById("company-name").textContent = companyName;
          document.getElementById("input-company-name").value = companyName;
          await saveData();
          renderRoundsList();
          updateStats();
          updateLegend();
          renderTreemap();
          alert('Import successful!');
        }
      }
    } catch (error) {
      alert('Error importing CSV: ' + error.message);
    }
  };
  reader.readAsText(file);

  // Reset input
  event.target.value = '';
}

// Smart CSV export - automatically includes all scenarios if they exist
function handleCSVExport() {
  const scenarios = ScenarioManager.getAllScenarios();
  const scenarioKeys = Object.keys(scenarios);

  // If there are saved scenarios, export all of them together
  if (scenarioKeys.length > 0) {
    const scenarioList = [];

    // Add current live data
    scenarioList.push({
      name: 'Current (Live Data)',
      data: capTable
    });

    // Add all saved scenarios
    scenarioKeys.forEach(name => {
      scenarioList.push({
        name: name,
        data: JSON.parse(scenarios[name])
      });
    });

    // Export multi-scenario CSV
    exportToCSV(capTable, scenarioList);
  } else {
    // Just export current data
    exportToCSV(capTable);
  }
}

// View mode
function setViewMode(mode) {
  currentViewMode = mode;
  document.getElementById("view-shares").classList.toggle("active", mode === "shares");
  document.getElementById("view-value").classList.toggle("active", mode === "value");
  renderTreemap();
}

// Unallocated color mode
function setUnallocColorMode(mode) {
  currentUnallocColorMode = mode;
  document.getElementById("unalloc-grey").classList.toggle("active", mode === "grey");
  document.getElementById("unalloc-tinted").classList.toggle("active", mode === "tinted");
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

/**
 * Calculate true fully diluted shares:
 * = All issued shares (common + priced rounds)
 * + All equity pool shares (allocated + unallocated reserved)
 * + All SAFE shares as if converted at their cap
 */
function calculateFullyDilutedShares() {
  let fullyDiluted = 0;

  capTable.rounds.forEach(round => {
    if (round.type === 'equity-pool') {
      // For equity pools, count the full authorized amount (allocated + unallocated)
      fullyDiluted += round.authorizedShares || 0;
    } else if (round.type === 'safe') {
      // For SAFEs, count shares as if converted at cap
      // Formula: (investmentAmount / valuationCap) * totalIssuedExcludingSAFEs
      // But we need to calculate this iteratively since SAFEs affect each other
      // For now, just count the current shares (which are calculated correctly)
      fullyDiluted += round.allocations.reduce((sum, a) => sum + a.shares, 0);
    } else {
      // For priced rounds and common stock, count issued shares
      fullyDiluted += round.allocations.reduce((sum, a) => sum + a.shares, 0);
    }
  });

  return fullyDiluted;
}

// Update statistics
function updateStats() {
  const totalIssued = capTable.rounds.reduce(
    (sum, round) => sum + round.allocations.reduce((s, a) => s + a.shares, 0),
    0
  );
  const fullyDiluted = calculateFullyDilutedShares();

  // Auto-calculate authorized shares: fully diluted + 20% buffer for future rounds
  const authorized = Math.ceil(fullyDiluted * 1.2);
  capTable.authorizedShares = authorized;

  const remaining = authorized - fullyDiluted;
  const remainingPct = ((remaining / authorized) * 100).toFixed(2);
  const totalHolders = capTable.rounds.reduce((sum, round) => sum + round.allocations.length, 0);

  // Calculate current effective valuation and price per share
  const effectivePricePerShare = getEffectivePricePerShare();
  const effectiveValuation = totalIssued * effectivePricePerShare;

  document.getElementById("stat-allocated").textContent = formatNumber(totalIssued);
  document.getElementById("stat-fully-diluted").textContent = formatNumber(fullyDiluted);
  document.getElementById("stat-unallocated").textContent = formatNumber(remaining);
  document.getElementById("stat-unallocated-pct").textContent = `${remainingPct}% of authorized cap`;
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
  window._authorizedShares = authorized;
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

// Open keyboard shortcuts modal
function openKeyboardShortcutsModal() {
  document.getElementById("keyboard-shortcuts-modal").classList.add("visible");
}

// Close keyboard shortcuts modal
function closeKeyboardShortcutsModal() {
  document.getElementById("keyboard-shortcuts-modal").classList.remove("visible");
}

// Open legal disclaimer modal
function openLegalDisclaimerModal() {
  document.getElementById("legal-disclaimer-modal").classList.add("visible");
}

// Close legal disclaimer modal
function closeLegalDisclaimerModal() {
  document.getElementById("legal-disclaimer-modal").classList.remove("visible");
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
  renderTreemapModule(capTable, currentViewMode, currentZoomNode, zoomToNode, currentUnallocColorMode);
  updateBreadcrumb();
}

// Zoom to node or edit allocation
function zoomToNode(node) {
  // If it's a round with children - zoom in
  if (node.children) {
    currentZoomNode = node;
    renderTreemap();
  }
  // Note: Allocations are now handled by double-click only
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

  // Add root (company name)
  const rootSpan = document.createElement("span");
  rootSpan.textContent = capTable.companyName;
  rootSpan.addEventListener("click", resetZoom);
  breadcrumb.appendChild(rootSpan);

  // Add path (skip nodes that have the same name as company - those are the root)
  path.forEach((node) => {
    // Skip if this node's name is the same as company name (it's the root)
    if (node.data.name === capTable.companyName) {
      return;
    }

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
  const total = calculateFullyDilutedShares();
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
    companyName: "Acme AI",
    authorizedShares: 150000000,
    rounds: [
      {
        id: "common",
        name: "Founder Common Stock",
        date: "2018-01-15",
        color: "#3b82f6",
        allocations: [
          { id: "common-1", holderName: "Jensen Huang", shares: 25000000, type: "common", notes: "Co-Founder & CEO" },
          { id: "common-2", holderName: "Satya Nadella", shares: 20000000, type: "common", notes: "Co-Founder & CTO" },
          { id: "common-3", holderName: "Sundar Pichai", shares: 15000000, type: "common", notes: "Co-Founder & CPO" },
        ],
      },
      {
        id: "preseed-safe",
        name: "Pre-Seed SAFE",
        type: "safe",
        valuationCap: 8000000,
        investmentAmount: 500000,
        date: "2018-06-01",
        color: "#10b981",
        allocations: [
          { id: "preseed-1", holderName: "Paul Graham (Y Combinator)", investmentAmount: 150000, shares: 1125000, type: "preferred" },
          { id: "preseed-2", holderName: "Marc Andreessen", investmentAmount: 150000, shares: 1125000, type: "preferred" },
          { id: "preseed-3", holderName: "Naval Ravikant", investmentAmount: 100000, shares: 750000, type: "preferred" },
          { id: "preseed-4", holderName: "Elad Gil", investmentAmount: 100000, shares: 750000, type: "preferred" },
        ],
      },
      {
        id: "seed-safe",
        name: "Seed SAFE",
        type: "safe",
        valuationCap: 25000000,
        investmentAmount: 2000000,
        date: "2019-03-15",
        color: "#22c55e",
        allocations: [
          { id: "seed-1", holderName: "Sequoia Capital", investmentAmount: 800000, shares: 3200000, type: "preferred" },
          { id: "seed-2", holderName: "Benchmark", investmentAmount: 600000, shares: 2400000, type: "preferred" },
          { id: "seed-3", holderName: "First Round Capital", investmentAmount: 400000, shares: 1600000, type: "preferred" },
          { id: "seed-4", holderName: "Reid Hoffman", investmentAmount: 200000, shares: 800000, type: "preferred" },
        ],
      },
      {
        id: "equity-pool-2019",
        name: "2019 Equity Incentive Plan",
        type: "equity-pool",
        authorizedShares: 10000000,
        date: "2019-09-01",
        color: "#f59e0b",
        allocations: [
          { id: "pool-1", holderName: "Andrej Karpathy", shares: 800000, type: "option", vestingSchedule: "4 year vest, 1 year cliff", notes: "VP Engineering" },
          { id: "pool-2", holderName: "Fei-Fei Li", shares: 600000, type: "option", vestingSchedule: "4 year vest, 1 year cliff", notes: "Chief AI Scientist" },
          { id: "pool-3", holderName: "Demis Hassabis", shares: 500000, type: "option", vestingSchedule: "4 year vest, 1 year cliff", notes: "Head of Research" },
          { id: "pool-4", holderName: "Employee Option Pool", shares: 3100000, type: "option", vestingSchedule: "4 year vest, 1 year cliff" },
        ],
      },
      {
        id: "series-a",
        name: "Series A",
        type: "priced",
        pricePerShare: 1.50,
        moneyRaised: 12000000,
        date: "2020-06-01",
        color: "#8b5cf6",
        allocations: [
          { id: "a-1", holderName: "Andreessen Horowitz", shares: 4000000, type: "preferred", notes: "Lead investor" },
          { id: "a-2", holderName: "Greylock Partners", shares: 2000000, type: "preferred" },
          { id: "a-3", holderName: "Kleiner Perkins", shares: 1333333, type: "preferred" },
          { id: "a-4", holderName: "GV (Google Ventures)", shares: 666667, type: "preferred" },
        ],
      },
      {
        id: "series-b",
        name: "Series B",
        type: "priced",
        pricePerShare: 3.75,
        moneyRaised: 35000000,
        date: "2021-11-15",
        color: "#ec4899",
        allocations: [
          { id: "b-1", holderName: "Tiger Global", shares: 5600000, type: "preferred", notes: "Lead investor" },
          { id: "b-2", holderName: "Insight Partners", shares: 2400000, type: "preferred" },
          { id: "b-3", holderName: "Coatue Management", shares: 1333333, type: "preferred" },
          { id: "b-4", holderName: "Andreessen Horowitz", shares: 666667, type: "preferred", notes: "Follow-on" },
        ],
      },
      {
        id: "series-c",
        name: "Series C",
        type: "priced",
        pricePerShare: 8.00,
        moneyRaised: 80000000,
        date: "2023-04-20",
        color: "#06b6d4",
        allocations: [
          { id: "c-1", holderName: "SoftBank Vision Fund", shares: 5000000, type: "preferred", notes: "Lead investor" },
          { id: "c-2", holderName: "Fidelity Investments", shares: 2500000, type: "preferred" },
          { id: "c-3", holderName: "T. Rowe Price", shares: 1250000, type: "preferred" },
          { id: "c-4", holderName: "Tiger Global", shares: 1250000, type: "preferred", notes: "Follow-on" },
        ],
      },
      {
        id: "series-d",
        name: "Series D",
        type: "priced",
        pricePerShare: 15.00,
        moneyRaised: 150000000,
        date: "2024-09-10",
        color: "#f43f5e",
        allocations: [
          { id: "d-1", holderName: "Sequoia Capital", shares: 4000000, type: "preferred", notes: "Lead investor" },
          { id: "d-2", holderName: "Thrive Capital", shares: 2000000, type: "preferred" },
          { id: "d-3", holderName: "General Catalyst", shares: 1333333, type: "preferred" },
          { id: "d-4", holderName: "Lightspeed Venture Partners", shares: 1333333, type: "preferred" },
          { id: "d-5", holderName: "SoftBank Vision Fund", shares: 1333334, type: "preferred", notes: "Follow-on" },
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

  const fullyDiluted = calculateFullyDilutedShares();

  // Auto-calculate authorized shares: fully diluted + 20% buffer
  const authorized = Math.ceil(fullyDiluted * 1.2);
  const unallocated = authorized - fullyDiluted;

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

    if (round.type === "safe") {
      if (round.valuationCap) {
        roundDetails += ` • $${formatNumber(round.valuationCap)} cap`;
      }
      if (round.investmentAmount) {
        const totalInvested = round.allocations.reduce((sum, a) => sum + (a.investmentAmount || 0), 0);
        roundDetails += ` • $${formatNumber(totalInvested)}/$${formatNumber(round.investmentAmount)} raised`;
      }
    } else if (round.type === "equity-pool") {
      roundDetails += ` • Equity Pool`;
      if (round.authorizedShares) {
        roundDetails += ` • ${formatNumber(totalShares)}/${formatNumber(round.authorizedShares)} allocated`;
      }
    } else if (round.type === "priced") {
      if (round.pricePerShare) {
        roundDetails += ` • $${round.pricePerShare}/share`;
      }
      if (round.moneyRaised) {
        const targetShares = Math.round(round.moneyRaised / round.pricePerShare);
        roundDetails += ` • ${formatNumber(totalShares)}/${formatNumber(targetShares)} sold`;
      }
    }

    item.innerHTML = `
      <div class="list-item-info">
        <div class="list-item-title" style="color: ${round.color}; text-shadow: 0 0 10px ${round.color}40;">${round.name}</div>
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

  // Parse values first
  const price = priceStr ? parseFloat(priceStr) : undefined;
  const moneyRaised = moneyRaisedStr ? parseFloat(moneyRaisedStr) : undefined;
  const cap = capStr ? parseFloat(capStr) : undefined;
  const investment = investmentStr ? parseFloat(investmentStr) : undefined;
  const poolAuthorized = poolAuthorizedStr ? parseInt(poolAuthorizedStr) : undefined;

  // Validate type-specific required fields
  if (type === "priced") {
    if (!price || price <= 0) {
      alert("❌ Price per share must be greater than 0 for priced rounds");
      document.getElementById("round-price").focus();
      return;
    }
  } else if (type === "safe") {
    if (!cap || cap <= 0) {
      alert("❌ Valuation cap must be greater than 0 for SAFE rounds");
      document.getElementById("round-valuation-cap").focus();
      return;
    }
  } else if (type === "equity-pool") {
    if (!poolAuthorized || poolAuthorized <= 0) {
      alert("❌ Pool authorized shares must be greater than 0");
      document.getElementById("round-pool-authorized").focus();
      return;
    }
  }

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

  // Update label and visibility based on round type
  const sharesLabel = document.querySelector('label[for="allocation-shares"]');
  const fdPctGroup = document.getElementById("allocation-fd-pct").closest('.form-group');

  if (round.type === 'safe') {
    sharesLabel.textContent = 'Investment Amount ($)';
    document.getElementById("allocation-shares").placeholder = "100000";
    // Hide FD % field for SAFE rounds
    fdPctGroup.style.display = 'none';
  } else {
    sharesLabel.textContent = 'Shares';
    document.getElementById("allocation-shares").placeholder = "100000";
    // Show FD % field for equity-pool and priced rounds
    fdPctGroup.style.display = 'block';
  }

  if (allocationId) {
    const allocation = round.allocations.find((a) => a.id === allocationId);
    title.textContent = "Edit Allocation";
    document.getElementById("allocation-holder").value = allocation.holderName;
    // For SAFE rounds, show investment amount; otherwise show shares
    if (round.type === 'safe' && allocation.investmentAmount) {
      document.getElementById("allocation-shares").value = allocation.investmentAmount;
      document.getElementById("allocation-fd-pct").value = "";
    } else {
      document.getElementById("allocation-shares").value = allocation.shares;
      // Calculate and populate FD %
      const fullyDiluted = calculateFullyDilutedShares();
      const fdPct = ((allocation.shares / fullyDiluted) * 100).toFixed(4);
      document.getElementById("allocation-fd-pct").value = fdPct;
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
    document.getElementById("allocation-fd-pct").value = "";
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

// Handle shares input - update FD % field
function onSharesInput() {
  const sharesInput = document.getElementById("allocation-shares").value.trim();
  const fdPctField = document.getElementById("allocation-fd-pct");

  if (sharesInput && !isNaN(sharesInput) && parseFloat(sharesInput) > 0) {
    const shares = parseFloat(sharesInput);
    const fullyDiluted = calculateFullyDilutedShares();
    const fdPct = ((shares / fullyDiluted) * 100).toFixed(4);

    // Update FD % field without triggering its input event
    fdPctField.value = fdPct;
  } else {
    fdPctField.value = '';
  }

  updateOfferCalculator();
}

// Handle FD % input - update shares field
function onFdPctInput() {
  const fdPctInput = document.getElementById("allocation-fd-pct").value.trim();
  const sharesField = document.getElementById("allocation-shares");

  if (fdPctInput && !isNaN(fdPctInput) && parseFloat(fdPctInput) > 0) {
    const fdPct = parseFloat(fdPctInput);
    const fullyDiluted = calculateFullyDilutedShares();
    const shares = Math.round((fdPct / 100) * fullyDiluted);

    // Update shares field without triggering its input event
    sharesField.value = shares;
  } else {
    sharesField.value = '';
  }

  updateOfferCalculator();
}

// Update the Quick Offer Calculator as user types
function updateOfferCalculator() {
  const sharesInput = document.getElementById("allocation-shares").value.trim();
  const calculator = document.getElementById("offer-calculator");

  // Only show calculator for equity-pool and priced rounds (NOT SAFE rounds)
  const round = capTable.rounds.find((r) => r.id === editingRoundId);
  if (!round || round.type === 'safe') {
    calculator.style.display = "none";
    return;
  }

  if (!sharesInput || isNaN(sharesInput) || parseFloat(sharesInput) <= 0) {
    calculator.style.display = "none";
    return;
  }

  const shares = parseFloat(sharesInput);
  const totalIssued = capTable.rounds.reduce(
    (sum, round) => sum + round.allocations.reduce((s, a) => s + a.shares, 0),
    0
  );
  const fullyDiluted = calculateFullyDilutedShares();
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

  // Validate: For SAFE rounds, check if total investment exceeds target
  if (round.type === 'safe' && round.investmentAmount && investmentAmount) {
    const currentInvested = round.allocations
      .filter(a => !editingAllocation || a.id !== editingAllocation)
      .reduce((sum, a) => sum + (a.investmentAmount || 0), 0);
    const newTotal = currentInvested + investmentAmount;

    if (newTotal > round.investmentAmount) {
      const overage = newTotal - round.investmentAmount;
      const shouldContinue = confirm(
        `Warning: Total invested ($${formatNumber(newTotal)}) exceeds target ($${formatNumber(round.investmentAmount)}) by $${formatNumber(overage)}.\n\n` +
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

