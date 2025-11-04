/**
 * Cap Table Data Model
 * 
 * Hierarchy:
 * Company (Total Authorized Shares)
 * └── Rounds (Common, Seed, Series A, etc.)
 *     └── Allocations (Individual holdings)
 */

export interface CapTable {
  companyName: string;
  authorizedShares: number;
  rounds: Round[];
}

export interface Round {
  id: string;
  name: string; // "Common Stock", "Seed", "Series A", etc.
  type?: "priced" | "safe" | "equity-pool"; // Round type (defaults to priced)
  pricePerShare?: number; // For priced rounds
  valuationCap?: number; // For SAFE rounds
  moneyRaised?: number; // Amount raised in this round (for priced rounds)
  investmentAmount?: number; // Investment amount (for SAFE rounds)
  date: string; // ISO date string
  allocations: Allocation[];
  color: string; // Hex color for this round
}

export interface Allocation {
  id: string;
  holderName: string;
  shares: number;
  type: "common" | "preferred" | "option" | "rsu";
  vestingSchedule?: string;
  notes?: string;
}

/**
 * Hierarchical data structure for D3 treemap
 */
export interface TreeNode {
  name: string;
  value: number; // shares or dollar value
  children?: TreeNode[];
  // Metadata for display
  round?: string;
  roundColor?: string;
  type?: string;
  pricePerShare?: number;
  holderName?: string;
  vestingSchedule?: string;
}

/**
 * View mode for the treemap
 */
export type ViewMode = "shares" | "value";

/**
 * Sample data generator
 */
export function createSampleCapTable(): CapTable {
  return {
    companyName: "Acme Corp",
    authorizedShares: 10_000_000,
    rounds: [
      {
        id: "common",
        name: "Common Stock",
        date: "2020-01-01",
        color: "#3b82f6", // blue
        allocations: [
          {
            id: "founder-1",
            holderName: "Alice (Founder)",
            shares: 3_000_000,
            type: "common",
          },
          {
            id: "founder-2",
            holderName: "Bob (Founder)",
            shares: 2_000_000,
            type: "common",
          },
          {
            id: "employee-pool",
            holderName: "Employee Option Pool",
            shares: 1_000_000,
            type: "option",
            vestingSchedule: "4 year vest, 1 year cliff",
          },
        ],
      },
      {
        id: "seed",
        name: "Seed Round",
        pricePerShare: 0.50,
        date: "2021-06-01",
        color: "#10b981", // green
        allocations: [
          {
            id: "seed-1",
            holderName: "Seed Investor A",
            shares: 1_000_000,
            type: "preferred",
          },
          {
            id: "seed-2",
            holderName: "Seed Investor B",
            shares: 500_000,
            type: "preferred",
          },
        ],
      },
      {
        id: "series-a",
        name: "Series A",
        pricePerShare: 2.00,
        date: "2023-03-15",
        color: "#f59e0b", // amber
        allocations: [
          {
            id: "series-a-1",
            holderName: "VC Fund Alpha",
            shares: 1_500_000,
            type: "preferred",
          },
          {
            id: "series-a-2",
            holderName: "VC Fund Beta",
            shares: 1_000_000,
            type: "preferred",
          },
        ],
      },
    ],
  };
}

/**
 * Convert CapTable to D3 hierarchical format
 */
export function capTableToTree(
  capTable: CapTable,
  mode: ViewMode = "shares"
): TreeNode {
  const getValue = (shares: number, pricePerShare?: number): number => {
    if (mode === "shares") return shares;
    return shares * (pricePerShare || 0);
  };

  const children: TreeNode[] = capTable.rounds.map((round) => ({
    name: round.name,
    round: round.name,
    roundColor: round.color,
    value: 0, // Will be sum of children
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

  // Calculate unallocated shares
  const totalAllocated = capTable.rounds.reduce(
    (sum, round) =>
      sum + round.allocations.reduce((s, a) => s + a.shares, 0),
    0
  );
  const unallocated = capTable.authorizedShares - totalAllocated;

  if (unallocated > 0) {
    children.push({
      name: "Unallocated",
      value: unallocated,
      round: "Unallocated",
      roundColor: "#6b7280", // gray
    });
  }

  return {
    name: capTable.companyName,
    value: 0, // Will be sum of children
    children,
  };
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format currency
 */
export function formatCurrency(num: number): string {
  return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Calculate percentage
 */
export function calculatePercentage(part: number, total: number): string {
  return ((part / total) * 100).toFixed(2) + "%";
}

