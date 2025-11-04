// Scenario management for cap table
// Allows saving/loading different future scenarios

let currentScenario = "current"; // "current" or scenario name

export function getCurrentScenario() {
  return currentScenario;
}

export function setCurrentScenario(name) {
  currentScenario = name;
}

export function loadScenariosList() {
  const scenarios = JSON.parse(localStorage.getItem("scenarios") || "{}");
  const select = document.getElementById("scenario-select");
  
  // Clear existing options except "current"
  select.innerHTML = '<option value="current">Current (Live Data)</option>';
  
  // Add saved scenarios
  Object.keys(scenarios).forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
  
  // Set current selection
  select.value = currentScenario;
}

export async function loadScenario(scenarioName, onLoad) {
  if (scenarioName === "current") {
    // Load live data
    currentScenario = "current";
    await onLoad(); // Callback to reload from API/localStorage
  } else {
    // Load saved scenario
    const scenarios = JSON.parse(localStorage.getItem("scenarios") || "{}");
    if (scenarios[scenarioName]) {
      currentScenario = scenarioName;
      const capTable = JSON.parse(scenarios[scenarioName]);
      return capTable;
    }
  }
  return null;
}

export function saveScenario(capTable) {
  const name = prompt("Enter scenario name:");
  if (!name || name === "current") {
    alert("Invalid scenario name. Cannot use 'current' as a name.");
    return false;
  }

  const scenarios = JSON.parse(localStorage.getItem("scenarios") || "{}");
  scenarios[name] = JSON.stringify(capTable);
  localStorage.setItem("scenarios", JSON.stringify(scenarios));

  currentScenario = name;
  loadScenariosList();
  alert(`Scenario "${name}" saved!`);
  return true;
}

export function quickSaveScenario(capTable) {
  if (currentScenario === "current") {
    // If on "current", prompt for name (same as Save As)
    return saveScenario(capTable);
  }

  // Save to existing scenario without prompting
  const scenarios = JSON.parse(localStorage.getItem("scenarios") || "{}");
  scenarios[currentScenario] = JSON.stringify(capTable);
  localStorage.setItem("scenarios", JSON.stringify(scenarios));

  // Show brief success indicator without blocking alert
  showToast(`✓ Saved to "${currentScenario}"`);
  return true;
}

// Non-blocking toast notification
function showToast(message) {
  // Remove existing toast if any
  const existing = document.getElementById("toast-notification");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast-notification";
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(toast);

  // Auto-remove after 2 seconds
  setTimeout(() => {
    toast.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

export function deleteScenario(onDelete) {
  if (currentScenario === "current") {
    alert("Cannot delete current live data");
    return false;
  }
  
  if (!confirm(`Delete scenario "${currentScenario}"?`)) return false;
  
  const scenarios = JSON.parse(localStorage.getItem("scenarios") || "{}");
  delete scenarios[currentScenario];
  localStorage.setItem("scenarios", JSON.stringify(scenarios));
  
  // Switch back to current
  currentScenario = "current";
  document.getElementById("scenario-select").value = "current";
  loadScenariosList();
  
  // Callback to reload current data
  if (onDelete) onDelete();
  
  return true;
}

export function getAllScenarios() {
  return JSON.parse(localStorage.getItem("scenarios") || "{}");
}

