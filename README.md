# Cap Table Visualizer

An interactive cap table visualization tool using the **filesystem/treemap analogy** - designed for engineers who understand disk usage tools like WinDirStat but not spreadsheets.

## 🎯 Core Concept

- **Total Authorized Shares** = Disk capacity
- **Funding Rounds** = Folders (Common Stock, Seed, Series A, etc.)
- **Individual Allocations** = Files (investor stakes, employee options)
- **File Size** = Number of shares held

## ✨ Features

### Interactive Treemap (D3.js)
- **Squarified layout** for optimal readability
- **Color-coded by round** - each funding round has a distinct color
- **Click to zoom** - drill down into rounds to see individual allocations
- **Breadcrumb navigation** - click to zoom back out
- **Hover tooltips** - detailed info on shares, ownership %, value, vesting

### Dual View Modes
1. **Share Count View** (default) - Shows allocation of authorized shares
2. **Valuation View** - Shows current value based on latest round pricing

### Ownership Calculations
- **Fully Diluted Ownership** - VC-standard calculation including:
  - All issued shares (common + priced rounds)
  - All equity pool shares (allocated + unallocated reserved)
  - All SAFE shares as if converted at their cap
- **Issued Ownership** - Current ownership % of issued shares only
- **Quick Offer Calculator** - Live calculator for equity offers showing fully diluted %

### Round Types
- **Priced Rounds** - Traditional equity rounds with price per share
- **SAFE Rounds** - Simple Agreement for Future Equity with valuation cap
- **Equity Pools** - Employee/advisor option pools with authorized shares
- **Unallocated Visualization** - Shows remaining capacity in each round type

### Data Management
- **Edit company info** - name and authorized shares
- **Real-time statistics** - fully diluted shares, issued shares, unallocated capacity
- **Scenario planning** - Save/load different future cap table scenarios
- **CSV import/export** - Import from spreadsheets, export for analysis
- **localStorage persistence** - data survives page refreshes
- **Legend** - visual guide to round colors

## 🚀 Running the App

### Development (Node.js - Recommended for beta10)
```bash
cd elide-cap-table
npm install
npm run dev
```

Open http://localhost:8080

### Production (Elide - when beta11+ fixes HTTP serving)
```bash
cd elide-cap-table
elide install
elide dev
```

## 🏗️ Architecture

### Tech Stack
- **Runtime**: Elide v1.0.0-beta10 (with Node.js fallback)
- **Visualization**: D3.js v7 (treemap layout)
- **Storage**: localStorage (browser-based)
- **Styling**: Custom CSS with dark theme

### File Structure
```
elide-cap-table/
├── elide.pkl              # Elide project configuration
├── package.json           # Node.js dependencies
├── server.ts              # Elide HTTP server (primary)
├── server-node.js         # Node.js fallback (beta10 workaround)
├── public/
│   ├── index.html         # Main UI
│   └── app.js             # D3 treemap + interactions
└── src/
    └── types.ts           # TypeScript data model
```

## 📊 Data Model

```typescript
interface CapTable {
  companyName: string;
  authorizedShares: number;
  rounds: Round[];
}

interface Round {
  id: string;
  name: string;              // "Common Stock", "Seed", "Series A"
  pricePerShare?: number;    // undefined for Common Stock
  date: string;
  color: string;             // Hex color for visualization
  allocations: Allocation[];
}

interface Allocation {
  id: string;
  holderName: string;
  shares: number;
  type: "common" | "preferred" | "option";
  vestingSchedule?: string;
}
```

## 🎨 Design Decisions

### Why Treemap?
- **Familiar to engineers** - same visual language as WinDirStat, Disk Inventory X
- **Proportional representation** - box size = ownership %
- **Hierarchical drill-down** - company → rounds → allocations
- **Efficient use of space** - shows entire cap table at once

### Why Color by Round?
- **Matches folder metaphor** - each round is a distinct "folder"
- **Easy to distinguish** - funding events are visually separated
- **Consistent with hierarchy** - all allocations in a round share the same color family

### Why Dual Views?
- **Share count** - shows ownership structure (who owns what %)
- **Valuation** - shows economic value (what it's worth in $)
- **Different perspectives** - like "disk usage" vs "file count" in filesystem tools

## 🧪 Testing

Automated E2E tests using Playwright MCP:
- ✅ Treemap renders with correct data
- ✅ Click to zoom into rounds
- ✅ Breadcrumb navigation works
- ✅ View toggle (shares ↔ value)
- ✅ Company info editing
- ✅ localStorage persistence

## 🔧 Customization

### Adding New Rounds
Edit the sample data in `public/app.js` or use the UI (future feature):

```javascript
{
  id: "series-b",
  name: "Series B",
  pricePerShare: 5.00,
  date: "2024-06-01",
  color: "#ef4444", // red
  allocations: [
    { id: "b-1", holderName: "Growth Fund", shares: 2000000, type: "preferred" }
  ]
}
```

### Changing Colors
Update the `color` field in each round. Recommended palette:
- Common Stock: `#3b82f6` (blue)
- Seed: `#10b981` (green)
- Series A: `#f59e0b` (amber)
- Series B: `#ef4444` (red)
- Series C: `#8b5cf6` (purple)
- Unallocated: `#6b7280` (gray)

## 🔌 Carta API Integration (Coming Soon)

The app is designed to integrate with Carta's API for automatic cap table syncing. When Carta API access becomes available:

### Setup
1. Obtain Carta API credentials (invite-only access required)
2. Add credentials to environment variables:
   ```bash
   CARTA_API_KEY=your_api_key
   CARTA_ORG_ID=your_org_id
   ```

### Implementation Plan
- Create `public/carta-sync.js` module for API integration
- Add "Sync from Carta" button in UI
- Map Carta data model to our cap table structure:
  - Carta Securities → Rounds
  - Carta Stakeholders → Allocations
  - Carta Valuations → Price per share
- Handle SAFE notes, convertible notes, and option pools
- Implement incremental sync (only fetch changes)
- Add conflict resolution UI for manual edits vs Carta data

### Data Mapping
```javascript
// Carta API → Our Model
{
  securities: [...],        // → rounds[]
  stakeholders: [...],      // → allocations[]
  valuations: [...],        // → pricePerShare
  authorized_shares: N      // → authorizedShares
}
```

See `docs/carta-integration.md` (to be created) for detailed implementation guide.

## 🎯 Future Enhancements

- [x] Add/edit/delete rounds via UI
- [x] Add/edit/delete allocations via UI
- [x] Export to CSV/JSON
- [x] Import from CSV
- [x] Dilution calculator
- [x] SAFE round support
- [x] Equity pool management
- [x] Scenario planning
- [ ] Carta API integration (pending invite-only access)
- [ ] Waterfall analysis (liquidation preferences)
- [ ] Time-series view (cap table evolution)
- [ ] Multi-company support

## 🐛 Known Issues (beta10)

- **Elide HTTP serving broken** - using Node.js fallback
- **No backend persistence** - localStorage only (browser-based)
- **No authentication** - single-user, local-only

## 📝 License

MIT

## 🙏 Credits

- **D3.js** - Data visualization library
- **Elide** - Polyglot runtime
- **WinDirStat** - Inspiration for treemap UX

