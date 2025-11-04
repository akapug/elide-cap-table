// CSV Import/Export functionality

export function exportToCSV(capTable) {
  const rows = [];
  
  // Header
  rows.push([
    'Round Name',
    'Round Type',
    'Price Per Share',
    'Valuation Cap',
    'Date',
    'Color',
    'Holder Name',
    'Shares',
    'Type',
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
        round.valuationCap || '',
        round.date,
        round.color,
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
          round.valuationCap || '',
          round.date,
          round.color,
          allocation.holderName,
          allocation.shares,
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

export function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV file is empty or invalid');
  }
  
  // Skip header
  const dataLines = lines.slice(1);
  
  const roundsMap = new Map();
  
  dataLines.forEach(line => {
    // Simple CSV parser (handles quoted fields)
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
    
    const [
      roundName,
      roundType,
      pricePerShare,
      valuationCap,
      date,
      color,
      holderName,
      shares,
      type,
      vestingSchedule,
      notes
    ] = cells;
    
    if (!roundName) return;
    
    // Get or create round
    if (!roundsMap.has(roundName)) {
      roundsMap.set(roundName, {
        id: 'round-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        name: roundName,
        type: roundType || 'priced',
        pricePerShare: pricePerShare ? parseFloat(pricePerShare) : undefined,
        valuationCap: valuationCap ? parseFloat(valuationCap) : undefined,
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
        type: type || 'common',
        vestingSchedule: vestingSchedule || undefined,
        notes: notes || undefined
      });
    }
  });
  
  return Array.from(roundsMap.values());
}

export function downloadCSVTemplate() {
  const template = [
    ['Round Name', 'Round Type', 'Price Per Share', 'Valuation Cap', 'Date', 'Color', 'Holder Name', 'Shares', 'Type', 'Vesting Schedule', 'Notes'],
    ['Common Shares', 'priced', '', '', '2020-01-01', '#3b82f6', 'Founder 1', '5000000', 'common', '', ''],
    ['Common Shares', 'priced', '', '', '2020-01-01', '#3b82f6', 'Founder 2', '3000000', 'common', '', ''],
    ['Pre-Seed SAFE', 'safe', '', '10000000', '2023-01-01', '#10b981', 'Angel Investor 1', '200000', 'preferred', '', ''],
    ['Pre-Seed SAFE', 'safe', '', '10000000', '2023-01-01', '#10b981', 'Angel Investor 2', '200000', 'preferred', '', ''],
    ['2024 Equity Plan', 'equity-pool', '', '', '2024-01-01', '#f59e0b', 'Employee Pool', '1000000', 'option', '4 year vest, 1 year cliff', 'Unallocated options'],
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

