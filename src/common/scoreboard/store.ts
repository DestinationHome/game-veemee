import { eq, sql, asc, desc, and, gte, lte, gt } from "drizzle-orm";
import type { SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";

export interface ScoreboardStoreConfig<
  TTable extends SQLiteTableWithColumns<any>,
> {
  db: any;
  table: TTable;
  psnidCol: any;
  scoreCol: any;
  racesCol?: any;
  createdAtCol?: any;

  // Custom comparator: returns true if newScore (and its extraData) is better than existing
  isBetter: (
    newScore: number,
    existingScore: number,
    newExtra?: Record<string, any>,
    existingRecord?: any,
  ) => boolean;

  // Sort order for high-scores
  leaderboardOrder: "asc" | "desc";
}

export class DrizzleScoreboardStore<
  TTable extends SQLiteTableWithColumns<any>,
> {
  constructor(private config: ScoreboardStoreConfig<TTable>) {}

  async getPlayerScore(psnid: string) {
    const results = await this.config.db
      .select()
      .from(this.config.table)
      .where(eq(this.config.psnidCol, psnid));
    return results[0] || null;
  }

  async setPlayerScore(
    psnid: string,
    newScore: number,
    extraData?: Record<string, any>,
  ) {
    const current = await this.getPlayerScore(psnid);

    if (!current) {
      const values: Record<string, any> = {
        [this.config.psnidCol.name]: psnid,
        [this.config.scoreCol.name]: newScore,
      };
      if (this.config.racesCol) {
        values[this.config.racesCol.name] = 1;
      }
      if (this.config.createdAtCol) {
        values[this.config.createdAtCol.name] = Date.now();
      }
      if (extraData) {
        for (const [k, v] of Object.entries(extraData)) {
          values[k] = v;
        }
      }

      const inserted = await this.config.db
        .insert(this.config.table)
        .values(values as any)
        .returning();
      return inserted[0];
    } else {
      const currentScore = (current as any)[this.config.scoreCol.name];
      const currentRaces = this.config.racesCol
        ? (current as any)[this.config.racesCol.name]
        : 0;

      const updateValues: Record<string, any> = {};
      if (this.config.racesCol) {
        updateValues[this.config.racesCol.name] = currentRaces + 1;
      }

      if (this.config.isBetter(newScore, currentScore, extraData, current)) {
        updateValues[this.config.scoreCol.name] = newScore;
        if (this.config.createdAtCol) {
          updateValues[this.config.createdAtCol.name] = Date.now();
        }
        if (extraData) {
          for (const [k, v] of Object.entries(extraData)) {
            updateValues[k] = v;
          }
        }
      }

      const updated = await this.config.db
        .update(this.config.table)
        .set(updateValues)
        .where(eq(this.config.psnidCol, psnid))
        .returning();
      return updated[0];
    }
  }

  async getTopScores(limit: number, startTs?: number, endTs?: number) {
    const orderFunc = this.config.leaderboardOrder === "asc" ? asc : desc;
    let query = this.config.db.select().from(this.config.table);

    let conditions = [gt(this.config.scoreCol, 0)];

    if (
      this.config.createdAtCol &&
      startTs !== undefined &&
      endTs !== undefined
    ) {
      conditions.push(gte(this.config.createdAtCol, startTs));
      conditions.push(lte(this.config.createdAtCol, endTs));
    }

    return await query
      .where(and(...conditions))
      .orderBy(orderFunc(this.config.scoreCol))
      .limit(limit);
  }

  async getRandomScores(limit: number) {
    return await this.config.db
      .select()
      .from(this.config.table)
      .where(gt(this.config.scoreCol, 0))
      .orderBy(sql`RANDOM()`)
      .limit(limit);
  }
}
