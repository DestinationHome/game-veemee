import { Hono } from "hono";
import { Builder } from "xml2js";
import { log } from "@main";
import { eq } from "drizzle-orm";
import { goFishScores, db } from "./db";
import { DrizzleScoreboardStore } from "../../common/scoreboard/store";
import { getUtcDayBounds } from "../../common/scoreboard/utils";
import type { Service } from "../service";

const xmlBuilder = new Builder({ headless: true });
const GO_FISH_KEY = "tHeHuYUmuDa54qur";

const goFishStore = new DrizzleScoreboardStore({
  db,
  table: goFishScores,
  psnidCol: goFishScores.psnid,
  scoreCol: goFishScores.score,
  racesCol: goFishScores.races,
  createdAtCol: goFishScores.createdAt,
  isBetter: (newScore, existingScore) => newScore > existingScore, // higher score is better
  leaderboardOrder: "desc",
});

export class GoFishService implements Service {
  name = "GoFish";
  description = "Go Fish minigame service";

  registerRoutes(app: Hono) {
    // 1. Set User Data
    app.post("/gofish/goFishHSSetUserData.php", async (c) => {
      const form = await c.req.formData();
      const key = form.get("key")?.toString();
      const psnid = form.get("psnid")?.toString();
      const scoreStr = form.get("score")?.toString();
      const fishcountStr = form.get("fishcount")?.toString();
      const biggestStr = form.get("biggestfishweight")?.toString();
      const totalStr = form.get("totalfishweight")?.toString();

      if (key !== GO_FISH_KEY) {
        log.warn(`goFishHSSetUserData: Unauthorized key: ${key}`);
        return c.text("Unauthorized", 401);
      }
      if (!psnid || scoreStr === undefined) {
        log.error("goFishHSSetUserData: Missing psnid or score");
        return c.text("Bad Request", 400);
      }

      const score = parseFloat(scoreStr);
      if (isNaN(score)) {
        log.error(`goFishHSSetUserData: Invalid score: ${scoreStr}`);
        return c.text("Bad Request", 400);
      }

      const extraData = {
        fishCount: parseInt(fishcountStr || "0", 10),
        biggestWeight: parseFloat(biggestStr || "0"),
        totalWeight: parseFloat(totalStr || "0"),
      };

      try {
        const record = await goFishStore.setPlayerScore(
          psnid,
          score,
          extraData,
        );
        const xml = xmlBuilder.buildObject({
          games: {
            game: {
              psnid: record.psnid,
              races: record.races,
              score: record.score,
              fishcount: record.fishCount,
              biggestfishweight: record.biggestWeight,
              totalfishweight: record.totalWeight,
            },
          },
        });
        return c.text(xml, 200, { "Content-Type": "application/xml" });
      } catch (err) {
        log.withError(err).error("Failed to set Go Fish score");
        return c.text("Internal Server Error", 500);
      }
    });

    // 2. Get User Data
    app.post("/gofish/goFishHSGetUserData.php", async (c) => {
      const form = await c.req.formData();
      const key = form.get("key")?.toString();
      const psnid = form.get("psnid")?.toString();

      if (key !== GO_FISH_KEY) {
        log.warn(`goFishHSGetUserData: Unauthorized key: ${key}`);
        return c.text("Unauthorized", 401);
      }
      if (!psnid) {
        log.error("goFishHSGetUserData: Missing psnid");
        return c.text("Bad Request", 400);
      }

      try {
        const record = (await goFishStore.getPlayerScore(psnid)) || {
          psnid,
          races: 0,
          score: 0.0,
          fishCount: 0,
          biggestWeight: 0.0,
          totalWeight: 0.0,
        };

        const xml = xmlBuilder.buildObject({
          games: {
            game: {
              psnid: record.psnid,
              races: record.races,
              score: record.score,
              fishcount: (record as any).fishCount,
              biggestfishweight: (record as any).biggestWeight,
              totalfishweight: (record as any).totalWeight,
            },
          },
        });
        return c.text(xml, 200, { "Content-Type": "application/xml" });
      } catch (err) {
        log.withError(err).error("Failed to get Go Fish score");
        return c.text("Internal Server Error", 500);
      }
    });

    // 3. Get Leaderboard All-Time
    app.post("/gofish/goFishHSGetLeaderboard.php", async (c) => {
      const form = await c.req.formData();
      const key = form.get("key")?.toString();

      if (key !== GO_FISH_KEY) {
        log.warn(`goFishHSGetLeaderboard: Unauthorized key: ${key}`);
        return c.text("Unauthorized", 401);
      }

      try {
        const topScores = await goFishStore.getTopScores(10);
        const playerXmlList = topScores.map((record: any) => ({
          psnid: record.psnid,
          score: record.score,
          fishcount: record.fishCount,
          biggestfishweight: record.biggestWeight,
          totalfishweight: record.totalWeight,
        }));

        const xml = xmlBuilder.buildObject({
          leaderboard: {
            player: playerXmlList,
          },
        });
        return c.text(xml, 200, { "Content-Type": "application/xml" });
      } catch (err) {
        log.withError(err).error("Failed to get Go Fish leaderboard");
        return c.text("Internal Server Error", 500);
      }
    });

    // 4. Get Leaderboard Today
    app.post("/gofish/goFishHSGetLeaderboardToday.php", async (c) => {
      const form = await c.req.formData();
      const key = form.get("key")?.toString();

      if (key !== GO_FISH_KEY) {
        log.warn(`goFishHSGetLeaderboardToday: Unauthorized key: ${key}`);
        return c.text("Unauthorized", 401);
      }

      try {
        const { start, end } = getUtcDayBounds(0);
        const topScores = await goFishStore.getTopScores(10, start, end);
        const playerXmlList = topScores.map((record: any) => ({
          psnid: record.psnid,
          score: record.score,
          fishcount: record.fishCount,
          biggestfishweight: record.biggestWeight,
          totalfishweight: record.totalWeight,
        }));

        const xml = xmlBuilder.buildObject({
          leaderboard: {
            player: playerXmlList,
          },
        });
        return c.text(xml, 200, { "Content-Type": "application/xml" });
      } catch (err) {
        log.withError(err).error("Failed to get Go Fish today leaderboard");
        return c.text("Internal Server Error", 500);
      }
    });

    // 5. Get Leaderboard Yesterday
    app.post("/gofish/goFishHSGetLeaderboardYesterday.php", async (c) => {
      const form = await c.req.formData();
      const key = form.get("key")?.toString();

      if (key !== GO_FISH_KEY) {
        log.warn(`goFishHSGetLeaderboardYesterday: Unauthorized key: ${key}`);
        return c.text("Unauthorized", 401);
      }

      try {
        const { start, end } = getUtcDayBounds(-1);
        const topScores = await goFishStore.getTopScores(10, start, end);
        const playerXmlList = topScores.map((record: any) => ({
          psnid: record.psnid,
          score: record.score,
          fishcount: record.fishCount,
          biggestfishweight: record.biggestWeight,
          totalfishweight: record.totalWeight,
        }));

        const xml = xmlBuilder.buildObject({
          leaderboard: {
            player: playerXmlList,
          },
        });
        return c.text(xml, 200, { "Content-Type": "application/xml" });
      } catch (err) {
        log.withError(err).error("Failed to get Go Fish yesterday leaderboard");
        return c.text("Internal Server Error", 500);
      }
    });

    // 6. Get Fish Caught (Inventory)
    app.post("/gofish/goFishHSGetFishCaught.php", async (c) => {
      const form = await c.req.formData();
      const key = form.get("key")?.toString();
      const psnid = form.get("psnid")?.toString();

      if (key !== GO_FISH_KEY) {
        log.warn(`goFishHSGetFishCaught.php: Unauthorized key: ${key}`);
        return c.text("Unauthorized", 401);
      }

      if (!psnid) {
        log.error("goFishHSGetFishCaught.php: Missing psnid");
        return c.text("Bad Request", 400);
      }

      try {
        const record = await goFishStore.getPlayerScore(psnid);
        const lower = record ? (record as any).fishMaskLower : 0;
        const upper = record ? (record as any).fishMaskUpper : 0;

        const xml = xmlBuilder.buildObject({
          inventory: {
            fish_mask_lower: lower,
            fish_mask_upper: upper,
          },
        });
        return c.text(xml, 200, { "Content-Type": "application/xml" });
      } catch (err) {
        log.withError(err).error("Failed to get Go Fish caught inventory");
        return c.text("Internal Server Error", 500);
      }
    });

    // 7. Set Fish Caught (Inventory)
    app.post("/gofish/goFishHSSetFishCaught.php", async (c) => {
      const form = await c.req.formData();
      const key = form.get("key")?.toString();
      const psnid = form.get("psnid")?.toString();
      const lowerStr = form.get("fish_mask_lower")?.toString();
      const upperStr = form.get("fish_mask_upper")?.toString();

      if (key !== GO_FISH_KEY) {
        log.warn(`goFishHSSetFishCaught.php: Unauthorized key: ${key}`);
        return c.text("Unauthorized", 401);
      }

      if (!psnid || lowerStr === undefined || upperStr === undefined) {
        log.error(
          "goFishHSSetFishCaught.php: Missing psnid, fish_mask_lower, or fish_mask_upper",
        );
        return c.text("Bad Request", 400);
      }

      const lowerVal = parseInt(lowerStr, 10);
      const upperVal = parseInt(upperStr, 10);

      if (isNaN(lowerVal) || isNaN(upperVal)) {
        log.error(
          `goFishHSSetFishCaught.php: Invalid masks: lower=${lowerStr}, upper=${upperStr}`,
        );
        return c.text("Bad Request", 400);
      }

      try {
        const record = await goFishStore.getPlayerScore(psnid);
        if (!record) {
          await db.insert(goFishScores).values({
            psnid,
            createdAt: Date.now(),
            fishMaskLower: lowerVal,
            fishMaskUpper: upperVal,
          });
        } else {
          await db
            .update(goFishScores)
            .set({
              fishMaskLower: lowerVal,
              fishMaskUpper: upperVal,
            })
            .where(eq(goFishScores.psnid, psnid));
        }

        const xml = xmlBuilder.buildObject({
          inventory: {
            fish_mask_lower: lowerVal,
            fish_mask_upper: upperVal,
          },
        });
        return c.text(xml, 200, { "Content-Type": "application/xml" });
      } catch (err) {
        log.withError(err).error("Failed to set Go Fish caught inventory");
        return c.text("Internal Server Error", 500);
      }
    });
  }
}
