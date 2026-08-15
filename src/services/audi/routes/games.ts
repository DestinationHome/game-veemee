import { log } from "@main";
import { and, eq, gte, lte } from "drizzle-orm";
import type { Hono } from "hono";
import { Builder } from "xml2js";

import { audiGameScores, audiGameTrophies, db } from "../db";

const xmlBuilder = new Builder({ headless: true });

// Helper to query and construct leaderboard XML based on date range
async function getLeaderboardXml(
  gameId: string,
  startTs: number,
  endTs: number,
): Promise<string> {
  // Query scores for the game within the date range
  const scores = await db
    .select()
    .from(audiGameScores)
    .where(
      and(
        eq(audiGameScores.game, gameId),
        gte(audiGameScores.createdAt, startTs),
        lte(audiGameScores.createdAt, endTs),
      ),
    );

  // Group scores by player to calculate max values
  const playerMap = new Map<
    string,
    {
      psnid: string;
      maxScore1: number;
      maxScore2: number | null;
      maxScoreSum: number;
    }
  >();

  for (const s of scores) {
    const s2 = s.score_2 !== null ? s.score_2 : 0;
    const sum = s.score_1 + s2;
    const existing = playerMap.get(s.psnid);

    if (!existing) {
      playerMap.set(s.psnid, {
        psnid: s.psnid,
        maxScore1: s.score_1,
        maxScore2: s.score_2,
        maxScoreSum: sum,
      });
    } else {
      if (sum > existing.maxScoreSum) {
        existing.maxScoreSum = sum;
      }
      if (s.score_1 > existing.maxScore1) {
        existing.maxScore1 = s.score_1;
      }
      if (
        s.score_2 !== null &&
        (existing.maxScore2 === null || s.score_2 > existing.maxScore2)
      ) {
        existing.maxScore2 = s.score_2;
      }
    }
  }

  // Sort players by maximum scoreSum descending
  const sortedPlayers = Array.from(playerMap.values()).sort(
    (a, b) => b.maxScoreSum - a.maxScoreSum,
  );

  // Populate trophies for each player
  const playersXmlList = [];
  for (const p of sortedPlayers) {
    const trophiesRecord = await db
      .select()
      .from(audiGameTrophies)
      .where(
        and(
          eq(audiGameTrophies.psnid, p.psnid),
          eq(audiGameTrophies.gameId, gameId),
        ),
      );

    const trophyIDs = trophiesRecord.map((t) => t.trophyId);

    playersXmlList.push({
      psn: p.psnid,
      psnid: p.psnid,
      score_1: p.maxScore1,
      score_2: p.maxScore2 !== null ? p.maxScore2 : undefined,
      trophy: {
        trophyID: trophyIDs,
      },
    });
  }

  const xmlObj = {
    leaderboard: {
      player: playersXmlList,
    },
  };

  return xmlBuilder.buildObject(xmlObj);
}

export function gamesRoutes(app: Hono) {
  // 1. Set Score
  app.post("/MetaScores/setScore.php", async (c) => {
    const form = await c.req.formData();
    const psnid = form.get("psnid")?.toString();
    const gameId = form.get("game_id")?.toString();
    const score1Str = form.get("score_1")?.toString();
    const score2Str = form.get("score_2")?.toString();

    if (!psnid || !gameId || score1Str === undefined) {
      log.error("setScore.php: Missing parameters");
      return c.text("Bad Request", 400);
    }

    const score1 = parseFloat(score1Str);
    const score2 =
      score2Str !== undefined && score2Str !== ""
        ? parseFloat(score2Str)
        : null;

    if (isNaN(score1) || (score2 !== null && isNaN(score2))) {
      log.error(
        `setScore.php: Invalid score formats: score_1=${
          score1Str
        }, score_2=${score2Str}`,
      );
      return c.text("Bad Request", 400);
    }

    try {
      // Insert new score entry
      await db.insert(audiGameScores).values({
        psnid,
        game: gameId,
        score_1: score1,
        score_2: score2,
        createdAt: Date.now(),
      });

      const xmlObj = {
        score: {
          player: {
            psn: psnid,
            psnid: psnid,
            score_1: score1,
            score_2: score2 !== null ? score2 : undefined,
            trophy: {},
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to set game score");
      return c.text("Internal Server Error", 500);
    }
  });

  // 2. Get Score
  app.post("/MetaScores/getScore.php", async (c) => {
    const form = await c.req.formData();
    const psnid = form.get("psnid")?.toString();
    const gameId = form.get("game_id")?.toString();

    if (!psnid || !gameId) {
      log.error("getScore.php: Missing parameters");
      return c.text("Bad Request", 400);
    }

    try {
      // Find player's highest score for the game (max by score_1)
      const scores = await db
        .select()
        .from(audiGameScores)
        .where(
          and(eq(audiGameScores.psnid, psnid), eq(audiGameScores.game, gameId)),
        );

      if (scores.length === 0) {
        return c.text(
          "<xml><error>Player has no scores for this game</error></xml>",
          200,
          {
            "Content-Type": "application/xml",
          },
        );
      }

      // Find max by score_1
      const highestScore = scores.reduce((max, current) => {
        return current.score_1 > max.score_1 ? current : max;
      }, scores[0]);

      const xmlObj = {
        score: {
          player: {
            psn: psnid,
            psnid: psnid,
            score_1: highestScore.score_1,
            score_2:
              highestScore.score_2 !== null ? highestScore.score_2 : undefined,
            trophy: {},
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get game score");
      return c.text("Internal Server Error", 500);
    }
  });

  // 3. Set Trophy
  app.post("/MetaScores/setTrophy.php", async (c) => {
    const form = await c.req.formData();
    const psnid = form.get("psnid")?.toString();
    const gameId = form.get("gameid")?.toString();
    const trophyIdStr = form.get("trophyid")?.toString();

    if (!psnid || !gameId || !trophyIdStr) {
      log.error("setTrophy.php: Missing parameters");
      return c.text("Bad Request", 400);
    }

    const trophyId = parseInt(trophyIdStr, 10);
    if (isNaN(trophyId)) {
      log.error(`setTrophy.php: Invalid trophyid: ${trophyIdStr}`);
      return c.text("Bad Request", 400);
    }

    try {
      // Award trophy, ignoring duplicate constraint conflict
      try {
        await db.insert(audiGameTrophies).values({
          psnid,
          gameId,
          trophyId,
        });
      } catch {
        // Duplicate ignored (already awarded)
      }

      // Get all trophies for player & game
      const trophiesRecord = await db
        .select()
        .from(audiGameTrophies)
        .where(
          and(
            eq(audiGameTrophies.psnid, psnid),
            eq(audiGameTrophies.gameId, gameId),
          ),
        );

      const trophyIDs = trophiesRecord.map((t) => t.trophyId);

      const xmlObj = {
        player: {
          psn: psnid,
          psnid: psnid,
          trophy: {
            trophyID: trophyIDs,
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to set game trophy");
      return c.text("Internal Server Error", 500);
    }
  });

  // 4. Get Trophies
  app.post("/MetaScores/getTrophies.php", async (c) => {
    const form = await c.req.formData();
    const psnid = form.get("psnid")?.toString();
    const gameId = form.get("gameid")?.toString();

    if (!psnid || !gameId) {
      log.error("getTrophies.php: Missing parameters");
      return c.text("Bad Request", 400);
    }

    try {
      // Get trophies
      const trophiesRecord = await db
        .select()
        .from(audiGameTrophies)
        .where(
          and(
            eq(audiGameTrophies.psnid, psnid),
            eq(audiGameTrophies.gameId, gameId),
          ),
        );

      const trophyIDs = trophiesRecord.map((t) => t.trophyId);

      const xmlObj = {
        player: {
          psn: psnid,
          psnid: psnid,
          trophy: {
            trophyID: trophyIDs,
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get game trophies");
      return c.text("Internal Server Error", 500);
    }
  });

  // 5. Get High Scores (All Time)
  app.post("/MetaScores/getHighScores.php", async (c) => {
    const form = await c.req.formData();
    const gameId = form.get("game_id")?.toString();

    if (!gameId) {
      log.error("getHighScores.php: Missing game_id");
      return c.text("Bad Request", 400);
    }

    try {
      const xml = await getLeaderboardXml(gameId, 0, Date.now() + 100000);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get high scores");
      return c.text("Internal Server Error", 500);
    }
  });

  // 6. Get High Scores Today
  app.post("/MetaScores/getHighScoresToday.php", async (c) => {
    const form = await c.req.formData();
    const gameId = form.get("game_id")?.toString();

    if (!gameId) {
      log.error("getHighScoresToday.php: Missing game_id");
      return c.text("Bad Request", 400);
    }

    try {
      const now = new Date();
      const startOfDay = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      ).getTime();
      const endOfDay = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      ).getTime();

      const xml = await getLeaderboardXml(gameId, startOfDay, endOfDay);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get today high scores");
      return c.text("Internal Server Error", 500);
    }
  });

  // 7. Get High Scores Yesterday
  app.post("/MetaScores/getHighScoresYesterday.php", async (c) => {
    const form = await c.req.formData();
    const gameId = form.get("game_id")?.toString();

    if (!gameId) {
      log.error("getHighScoresYesterday.php: Missing game_id");
      return c.text("Bad Request", 400);
    }

    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const startOfYesterday = new Date(
        Date.UTC(
          yesterday.getUTCFullYear(),
          yesterday.getUTCMonth(),
          yesterday.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      ).getTime();
      const endOfYesterday = new Date(
        Date.UTC(
          yesterday.getUTCFullYear(),
          yesterday.getUTCMonth(),
          yesterday.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      ).getTime();

      const xml = await getLeaderboardXml(
        gameId,
        startOfYesterday,
        endOfYesterday,
      );
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get yesterday high scores");
      return c.text("Internal Server Error", 500);
    }
  });

  // 8. Get High Scores Friends (falls back to All Time)
  app.post("/MetaScores/getHighScoresFriends.php", async (c) => {
    const form = await c.req.formData();
    const gameId = form.get("game_id")?.toString();

    if (!gameId) {
      log.error("getHighScoresFriends.php: Missing game_id");
      return c.text("Bad Request", 400);
    }

    try {
      const xml = await getLeaderboardXml(gameId, 0, Date.now() + 100000);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get friends high scores");
      return c.text("Internal Server Error", 500);
    }
  });
}
