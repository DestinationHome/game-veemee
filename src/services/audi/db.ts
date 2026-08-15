import Database from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const sqlite = new Database("data/audi.db");

// Initialize tables if they do not exist
sqlite.run(`
  CREATE TABLE IF NOT EXISTS audi_sled_scores (
    psnid TEXT PRIMARY KEY,
    races INTEGER NOT NULL DEFAULT 0,
    score REAL NOT NULL DEFAULT 0.0
  );
`);

sqlite.run(`
  CREATE TABLE IF NOT EXISTS audi_vertical_run_scores (
    psnid TEXT PRIMARY KEY,
    races INTEGER NOT NULL DEFAULT 0,
    time REAL NOT NULL DEFAULT 0.0,
    distance REAL NOT NULL DEFAULT 0.0
  );
`);

sqlite.run(`
  CREATE TABLE IF NOT EXISTS audi_game_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    psnid TEXT NOT NULL,
    game TEXT NOT NULL,
    score_1 REAL NOT NULL,
    score_2 REAL,
    created_at INTEGER NOT NULL
  );
`);

sqlite.run(`
  CREATE TABLE IF NOT EXISTS audi_game_trophies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    psnid TEXT NOT NULL,
    game_id TEXT NOT NULL,
    trophy_id INTEGER NOT NULL,
    UNIQUE(psnid, game_id, trophy_id)
  );
`);

sqlite.run(`
  CREATE TABLE IF NOT EXISTS audi_technology_profiles (
    psnid TEXT PRIMARY KEY,
    profile TEXT NOT NULL
  );
`);

sqlite.run(`
  CREATE TABLE IF NOT EXISTS audi_technology_scores (
    psnid TEXT NOT NULL,
    track INTEGER NOT NULL,
    challenge INTEGER NOT NULL,
    modifier INTEGER NOT NULL,
    time_taken INTEGER NOT NULL,
    penalties INTEGER NOT NULL,
    comfort INTEGER NOT NULL,
    efficiency INTEGER NOT NULL,
    score INTEGER NOT NULL,
    PRIMARY KEY (psnid, track, challenge, modifier)
  );
`);

export const db = drizzle(sqlite);

export const audiSledScores = sqliteTable("audi_sled_scores", {
  psnid: text("psnid").primaryKey(),
  races: integer("races").notNull().default(0),
  score: real("score").notNull().default(0.0),
});

export const audiVerticalRunScores = sqliteTable("audi_vertical_run_scores", {
  psnid: text("psnid").primaryKey(),
  races: integer("races").notNull().default(0),
  time: real("time").notNull().default(0.0),
  distance: real("distance").notNull().default(0.0),
});

export const audiGameScores = sqliteTable("audi_game_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  psnid: text("psnid").notNull(),
  game: text("game").notNull(),
  score_1: real("score_1").notNull(),
  score_2: real("score_2"),
  createdAt: integer("created_at").notNull(),
});

export const audiGameTrophies = sqliteTable("audi_game_trophies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  psnid: text("psnid").notNull(),
  gameId: text("game_id").notNull(),
  trophyId: integer("trophy_id").notNull(),
});

export const audiTechnologyProfiles = sqliteTable("audi_technology_profiles", {
  psnid: text("psnid").primaryKey(),
  profile: text("profile").notNull(),
});

export const audiTechnologyScores = sqliteTable("audi_technology_scores", {
  psnid: text("psnid").notNull(),
  track: integer("track").notNull(),
  challenge: integer("challenge").notNull(),
  modifier: integer("modifier").notNull(),
  timeTaken: integer("time_taken").notNull(),
  penalties: integer("penalties").notNull(),
  comfort: integer("comfort").notNull(),
  efficiency: integer("efficiency").notNull(),
  score: integer("score").notNull(),
});
