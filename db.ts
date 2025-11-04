// SQLite database for cap table persistence
import { Database } from "jsr:@db/sqlite@0.11";

const db = new Database("captable.db");

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS company (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    authorized_shares INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'priced',
    price_per_share REAL,
    valuation_cap REAL,
    date TEXT NOT NULL,
    color TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS allocations (
    id TEXT PRIMARY KEY,
    round_id TEXT NOT NULL,
    holder_name TEXT NOT NULL,
    shares INTEGER NOT NULL,
    type TEXT NOT NULL,
    vesting_schedule TEXT,
    notes TEXT,
    FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_allocations_round ON allocations(round_id);
`);

export interface CapTable {
  companyName: string;
  authorizedShares: number;
  rounds: Round[];
}

export interface Round {
  id: string;
  name: string;
  type?: "priced" | "safe" | "equity-pool";
  pricePerShare?: number;
  valuationCap?: number;
  date: string;
  allocations: Allocation[];
  color: string;
}

export interface Allocation {
  id: string;
  holderName: string;
  shares: number;
  type: "common" | "preferred" | "option" | "rsu";
  vestingSchedule?: string;
  notes?: string;
}

export function getCapTable(): CapTable | null {
  // Get company info
  const companyRow = db.prepare("SELECT name, authorized_shares FROM company WHERE id = 1").get();
  
  if (!companyRow) {
    return null;
  }

  const company = companyRow as { name: string; authorized_shares: number };

  // Get all rounds
  const roundRows = db.prepare(`
    SELECT id, name, type, price_per_share, valuation_cap, date, color
    FROM rounds
    ORDER BY date
  `).all() as Array<{
    id: string;
    name: string;
    type: string;
    price_per_share: number | null;
    valuation_cap: number | null;
    date: string;
    color: string;
  }>;

  const rounds: Round[] = roundRows.map((row) => {
    // Get allocations for this round
    const allocationRows = db.prepare(`
      SELECT id, holder_name, shares, type, vesting_schedule, notes
      FROM allocations
      WHERE round_id = ?
      ORDER BY shares DESC
    `).all(row.id) as Array<{
      id: string;
      holder_name: string;
      shares: number;
      type: string;
      vesting_schedule: string | null;
      notes: string | null;
    }>;

    const allocations: Allocation[] = allocationRows.map((a) => ({
      id: a.id,
      holderName: a.holder_name,
      shares: a.shares,
      type: a.type as "common" | "preferred" | "option" | "rsu",
      vestingSchedule: a.vesting_schedule || undefined,
      notes: a.notes || undefined,
    }));

    return {
      id: row.id,
      name: row.name,
      type: row.type as "priced" | "safe" | "equity-pool",
      pricePerShare: row.price_per_share || undefined,
      valuationCap: row.valuation_cap || undefined,
      date: row.date,
      color: row.color,
      allocations,
    };
  });

  return {
    companyName: company.name,
    authorizedShares: company.authorized_shares,
    rounds,
  };
}

export function saveCapTable(capTable: CapTable): void {
  db.transaction(() => {
    // Upsert company
    db.prepare(`
      INSERT INTO company (id, name, authorized_shares)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        authorized_shares = excluded.authorized_shares
    `).run(capTable.companyName, capTable.authorizedShares);

    // Delete all existing rounds and allocations (cascade will handle allocations)
    db.prepare("DELETE FROM rounds").run();

    // Insert rounds and allocations
    const insertRound = db.prepare(`
      INSERT INTO rounds (id, name, type, price_per_share, valuation_cap, date, color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAllocation = db.prepare(`
      INSERT INTO allocations (id, round_id, holder_name, shares, type, vesting_schedule, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const round of capTable.rounds) {
      insertRound.run(
        round.id,
        round.name,
        round.type || "priced",
        round.pricePerShare || null,
        round.valuationCap || null,
        round.date,
        round.color
      );

      for (const allocation of round.allocations) {
        insertAllocation.run(
          allocation.id,
          round.id,
          allocation.holderName,
          allocation.shares,
          allocation.type,
          allocation.vestingSchedule || null,
          allocation.notes || null
        );
      }
    }
  })();
}

export function initializeSampleData(): void {
  const existing = getCapTable();
  if (existing) {
    return; // Already has data
  }

  const sampleData: CapTable = {
    companyName: "Elide",
    authorizedShares: 12893506,
    rounds: [
      {
        id: "common",
        name: "Common Shares",
        type: "priced",
        date: "2020-01-01",
        color: "#3b82f6",
        allocations: [
          {
            id: "common-1",
            holderName: "Common Stockholders",
            shares: 11400000,
            type: "common",
          },
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
          {
            id: "safe-1",
            holderName: "Sarah Chen (Angel)",
            shares: 200050,
            type: "preferred",
          },
          {
            id: "safe-2",
            holderName: "Angel Investor 2",
            shares: 200051,
            type: "preferred",
          },
        ],
      },
      {
        id: "equity-plan",
        name: "2023 Equity Incentive Plan",
        type: "equity-pool",
        date: "2023-01-01",
        color: "#f59e0b",
        allocations: [
          {
            id: "equity-1",
            holderName: "Employee Options Pool",
            shares: 1093405,
            type: "option",
            vestingSchedule: "4 year vest, 1 year cliff",
          },
        ],
      },
    ],
  };

  saveCapTable(sampleData);
}

export { db };

