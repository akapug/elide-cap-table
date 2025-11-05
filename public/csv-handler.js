// CSV Import/Export functionality

// Helper function to parse a CSV line (handles quoted fields)
function parseLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);

  return cells;
}

export function exportToCSV(capTable, allScenarios = null) {
  // If allScenarios provided, export multi-scenario CSV
  if (allScenarios && allScenarios.length > 1) {
    return exportMultiScenarioCSV(allScenarios);
  }

  const rows = [];

  // Metadata section
  rows.push(['# METADATA']);
  rows.push(['Company Name', capTable.companyName]);
  rows.push(['Exported On', new Date().toISOString()]);
  rows.push(['']); // Blank line separator

  // Header
  rows.push([
    'Round Name',
    'Round Type',
    'Price Per Share',
    'Money Raised',
    'Valuation Cap',
    'Investment Amount',
    'Authorized Shares',
    'Date',
    'Color',
    'Holder Name',
    'Shares',
    'Allocation Investment Amount',
    'Allocation Type',
    'Vesting Schedule',
    'Notes'
  ]);

  // Data rows
  capTable.rounds.forEach(round => {
    if (round.allocations.length === 0) {
      // Round with no allocations
      rows.push([
        round.name,
        round.type || 'priced',
        round.pricePerShare || '',
        round.moneyRaised || '',
        round.valuationCap || '',
        round.investmentAmount || '',
        round.authorizedShares || '',
        round.date,
        round.color,
        '',
        '',
        '',
        '',
        '',
        ''
      ]);
    } else {
      // Round with allocations
      round.allocations.forEach(allocation => {
        rows.push([
          round.name,
          round.type || 'priced',
          round.pricePerShare || '',
          round.moneyRaised || '',
          round.valuationCap || '',
          round.investmentAmount || '',
          round.authorizedShares || '',
          round.date,
          round.color,
          allocation.holderName,
          allocation.shares,
          allocation.investmentAmount || '',
          allocation.type,
          allocation.vestingSchedule || '',
          allocation.notes || ''
        ]);
      });
    }
  });

  // Convert to CSV string
  const csvContent = rows.map(row =>
    row.map(cell => {
      // Escape quotes and wrap in quotes if contains comma
      const str = String(cell);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(',')
  ).join('\n');

  // Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${capTable.companyName}_cap_table_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export multiple scenarios in a single CSV with section markers
function exportMultiScenarioCSV(scenarios) {
  const rows = [];
  const exportDate = new Date().toISOString();

  // Global metadata
  rows.push(['# MULTI-SCENARIO EXPORT']);
  rows.push(['Exported On', exportDate]);
  rows.push(['Total Scenarios', scenarios.length]);
  rows.push(['']); // Blank line

  scenarios.forEach((scenario, index) => {
    const capTable = scenario.data;

    // Scenario header
    rows.push([`# SCENARIO: ${scenario.name}`]);
    rows.push(['Company Name', capTable.companyName]);
    rows.push(['Scenario Name', scenario.name]);
    rows.push(['']); // Blank line

    // Data header
    rows.push([
      'Round Name',
      'Round Type',
      'Price Per Share',
      'Money Raised',
      'Valuation Cap',
      'Investment Amount',
      'Authorized Shares',
      'Date',
      'Color',
      'Holder Name',
      'Shares',
      'Allocation Investment Amount',
      'Allocation Type',
      'Vesting Schedule',
      'Notes'
    ]);

    // Data rows for this scenario
    capTable.rounds.forEach(round => {
      if (round.allocations.length === 0) {
        rows.push([
          round.name,
          round.type || 'priced',
          round.pricePerShare || '',
          round.moneyRaised || '',
          round.valuationCap || '',
          round.investmentAmount || '',
          round.authorizedShares || '',
          round.date,
          round.color,
          '',
          '',
          '',
          '',
          '',
          ''
        ]);
      } else {
        round.allocations.forEach(allocation => {
          rows.push([
            round.name,
            round.type || 'priced',
            round.pricePerShare || '',
            round.moneyRaised || '',
            round.valuationCap || '',
            round.investmentAmount || '',
            round.authorizedShares || '',
            round.date,
            round.color,
            allocation.holderName,
            allocation.shares,
            allocation.investmentAmount || '',
            allocation.type,
            allocation.vestingSchedule || '',
            allocation.notes || ''
          ]);
        });
      }
    });

    // Blank line between scenarios
    if (index < scenarios.length - 1) {
      rows.push(['']);
    }
  });

  // Convert to CSV string
  const csvContent = rows.map(row =>
    row.map(cell => {
      const str = String(cell);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(',')
  ).join('\n');

  // Download
  const companyName = scenarios[0]?.data?.companyName || 'company';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${companyName}_all_scenarios_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV file is empty or invalid');
  }

  // Check if this is a multi-scenario export
  if (lines[0].startsWith('# MULTI-SCENARIO')) {
    return parseMultiScenarioCSV(lines);
  }

  // Single scenario import
  return parseSingleScenario(lines, 0);
}

// Parse a single scenario from lines starting at startIndex
function parseSingleScenario(lines, startIndex) {
  let companyName = 'My Company';
  let currentLine = startIndex;

  // Parse metadata if present
  if (lines[currentLine].startsWith('# METADATA') || lines[currentLine].startsWith('# SCENARIO:')) {
    currentLine++;
    while (currentLine < lines.length && !lines[currentLine].startsWith('Round Name')) {
      const cells = parseLine(lines[currentLine]);
      if (cells[0] === 'Company Name' && cells[1]) {
        companyName = cells[1];
      }
      currentLine++;
    }
  }

  // Find header line
  while (currentLine < lines.length && !lines[currentLine].startsWith('Round Name')) {
    currentLine++;
  }

  if (currentLine >= lines.length) {
    throw new Error('CSV header not found');
  }

  // Skip header
  currentLine++;

  const roundsMap = new Map();

  for (; currentLine < lines.length; currentLine++) {
    const line = lines[currentLine];

    // Stop at next scenario marker
    if (line.startsWith('# SCENARIO:')) {
      break;
    }

    // Skip section markers and blank lines
    if (line.startsWith('#') || !line.trim()) {
      continue;
    }

    const cells = parseLine(line);

    const [
      roundName,
      roundType,
      pricePerShare,
      moneyRaised,
      valuationCap,
      investmentAmount,
      authorizedShares,
      date,
      color,
      holderName,
      shares,
      allocationInvestmentAmount,
      type,
      vestingSchedule,
      notes
    ] = cells;

    if (!roundName) continue;

    // Get or create round
    if (!roundsMap.has(roundName)) {
      roundsMap.set(roundName, {
        id: 'round-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        name: roundName,
        type: roundType || 'priced',
        pricePerShare: pricePerShare ? parseFloat(pricePerShare) : undefined,
        moneyRaised: moneyRaised ? parseFloat(moneyRaised) : undefined,
        valuationCap: valuationCap ? parseFloat(valuationCap) : undefined,
        investmentAmount: investmentAmount ? parseFloat(investmentAmount) : undefined,
        authorizedShares: authorizedShares ? parseInt(authorizedShares) : undefined,
        date: date || new Date().toISOString().split('T')[0],
        color: color || '#' + Math.floor(Math.random() * 16777215).toString(16),
        allocations: []
      });
    }

    // Add allocation if holder name exists
    if (holderName && shares) {
      const round = roundsMap.get(roundName);
      round.allocations.push({
        id: 'allocation-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        holderName,
        shares: parseInt(shares),
        investmentAmount: allocationInvestmentAmount ? parseFloat(allocationInvestmentAmount) : undefined,
        type: type || 'common',
        vestingSchedule: vestingSchedule || undefined,
        notes: notes || undefined
      });
    }
  }

  return {
    companyName,
    rounds: Array.from(roundsMap.values())
  };
}

// Parse multi-scenario CSV
function parseMultiScenarioCSV(lines) {
  const scenarios = [];
  let currentLine = 0;

  // Skip global metadata
  while (currentLine < lines.length && !lines[currentLine].startsWith('# SCENARIO:')) {
    currentLine++;
  }

  // Parse each scenario
  while (currentLine < lines.length) {
    if (lines[currentLine].startsWith('# SCENARIO:')) {
      const scenarioName = lines[currentLine].substring(12).trim(); // Remove "# SCENARIO: "
      const scenarioData = parseSingleScenario(lines, currentLine);

      scenarios.push({
        name: scenarioName,
        data: scenarioData
      });

      // Find next scenario or end
      currentLine++;
      while (currentLine < lines.length && !lines[currentLine].startsWith('# SCENARIO:')) {
        currentLine++;
      }
    } else {
      currentLine++;
    }
  }

  return {
    isMultiScenario: true,
    scenarios: scenarios
  };
}

export function downloadCSVTemplate() {
  const template = [
    ['# METADATA'],
    ['Company Name', 'My Startup Inc'],
    ['Exported On', new Date().toISOString()],
    [''],
    ['Round Name', 'Round Type', 'Price Per Share', 'Money Raised', 'Valuation Cap', 'Investment Amount', 'Authorized Shares', 'Date', 'Color', 'Holder Name', 'Shares', 'Allocation Investment Amount', 'Allocation Type', 'Vesting Schedule', 'Notes'],
    ['Common Shares', 'priced', '', '', '', '', '', '2020-01-01', '#3b82f6', 'Founder 1', '5000000', '', 'common', '', 'CEO'],
    ['Common Shares', 'priced', '', '', '', '', '', '2020-01-01', '#3b82f6', 'Founder 2', '3000000', '', 'common', '', 'CTO'],
    ['Pre-Seed SAFE', 'safe', '', '', '10000000', '800000', '', '2023-01-01', '#10b981', 'Angel Investor 1', '400000', '400000', 'preferred', '', ''],
    ['Pre-Seed SAFE', 'safe', '', '', '10000000', '800000', '', '2023-01-01', '#10b981', 'Angel Investor 2', '400000', '400000', 'preferred', '', ''],
    ['2024 Equity Plan', 'equity-pool', '', '', '', '', '10000000', '2024-01-01', '#f59e0b', 'Employee 1', '500000', '', 'option', '4 year vest, 1 year cliff', ''],
    ['2024 Equity Plan', 'equity-pool', '', '', '', '', '10000000', '2024-01-01', '#f59e0b', 'Employee 2', '500000', '', 'option', '4 year vest, 1 year cliff', ''],
  ];

  const csvContent = template.map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', 'cap_table_template.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

