import Database from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const sqlite = new Database("data/gofish.db");

sqlite.run(`
  CREATE TABLE IF NOT EXISTS gofish_scores (
    psnid TEXT PRIMARY KEY,
    races INTEGER NOT NULL DEFAULT 0,
    score REAL NOT NULL DEFAULT 0.0,
    fish_count INTEGER NOT NULL DEFAULT 0,
    biggest_weight REAL NOT NULL DEFAULT 0.0,
    total_weight REAL NOT NULL DEFAULT 0.0,
    created_at INTEGER NOT NULL,
    fish_mask_lower INTEGER NOT NULL DEFAULT 0,
    fish_mask_upper INTEGER NOT NULL DEFAULT 0
  );
`);

try {
  sqlite.run(
    "ALTER TABLE gofish_scores ADD COLUMN fish_mask_lower INTEGER NOT NULL DEFAULT 0;",
  );
} catch (e) {}
try {
  sqlite.run(
    "ALTER TABLE gofish_scores ADD COLUMN fish_mask_upper INTEGER NOT NULL DEFAULT 0;",
  );
} catch (e) {}

export const db = drizzle(sqlite);

export const goFishScores = sqliteTable("gofish_scores", {
  psnid: text("psnid").primaryKey(),
  races: integer("races").notNull().default(0),
  score: real("score").notNull().default(0.0),
  fishCount: integer("fish_count").notNull().default(0),
  biggestWeight: real("biggest_weight").notNull().default(0.0),
  totalWeight: real("total_weight").notNull().default(0.0),
  createdAt: integer("created_at").notNull(),
  fishMaskLower: integer("fish_mask_lower").notNull().default(0),
  fishMaskUpper: integer("fish_mask_upper").notNull().default(0),
});
