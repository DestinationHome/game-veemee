import type { Hono } from "hono";
import { Builder } from "xml2js";
import { log } from "@main";
import { audiSledScores, db } from "../db";
import { DrizzleScoreboardStore } from "../../../common/scoreboard/store";

const VEEMEE_HOME_KEY = "k7dEUsKF3YvrfAxg";
const xmlBuilder = new Builder({ headless: true });

const sledStore = new DrizzleScoreboardStore({
  db,
  table: audiSledScores,
  psnidCol: audiSledScores.psnid,
  scoreCol: audiSledScores.score,
  racesCol: audiSledScores.races,
  isBetter: (newScore, existingScore) =>
    existingScore === 0 || newScore < existingScore, // lower time is better
  leaderboardOrder: "asc",
});

function formatSledTime(time: number): string {
  if (time <= 0) {
    return "-- : -- . --";
  }
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const hundreds = Math.floor((time - Math.floor(time)) * 100 + 0.5) % 100;

  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)}.${pad(hundreds)}`;
}

export function sledRoutes(app: Hono) {
  // 1. Set User Data
  app.post("/audisled/audisledHSSetUserData.php", async (c) => {
    const form = await c.req.formData();
    const key = form.get("key")?.toString();
    const psnid = form.get("psnid")?.toString();
    const scoreStr = form.get("score")?.toString();

    if (key !== VEEMEE_HOME_KEY) {
      log.warn(`audisledHSSetUserData.php: Unauthorized key: ${key}`);
      return c.text("Unauthorized", 401);
    }

    if (!psnid || scoreStr === undefined) {
      log.error("audisledHSSetUserData.php: Missing psnid or score");
      return c.text("Bad Request", 400);
    }

    const playerScore = parseFloat(scoreStr);
    if (isNaN(playerScore)) {
      log.error(`audisledHSSetUserData.php: Invalid score: ${scoreStr}`);
      return c.text("Bad Request", 400);
    }

    try {
      const finalRecord = await sledStore.setPlayerScore(psnid, playerScore);

      const xmlObj = {
        scores: {
          entry: {
            psnid: finalRecord.psnid,
            races: finalRecord.races,
            score: finalRecord.score,
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to set user score");
      return c.text("Internal Server Error", 500);
    }
  });

  // 2. Get User Data
  app.post("/audisled/audisledHSGetUserData.php", async (c) => {
    const form = await c.req.formData();
    const key = form.get("key")?.toString();
    const psnid = form.get("psnid")?.toString();

    if (key !== VEEMEE_HOME_KEY) {
      log.warn(`audisledHSGetUserData.php: Unauthorized key: ${key}`);
      return c.text("Unauthorized", 401);
    }

    if (!psnid) {
      log.error("audisledHSGetUserData.php: Missing psnid");
      return c.text("Bad Request", 400);
    }

    try {
      const record = (await sledStore.getPlayerScore(psnid)) || {
        psnid,
        races: 0,
        score: 0.0,
      };

      const xmlObj = {
        scores: {
          entry: {
            psnid: record.psnid,
            races: record.races,
            score: record.score,
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get user score");
      return c.text("Internal Server Error", 500);
    }
  });

  // 3. Get Top User
  app.post("/audisled/audisledHSGetTopUser.php", async (c) => {
    const form = await c.req.formData();
    const key = form.get("key")?.toString();

    if (key !== VEEMEE_HOME_KEY) {
      log.warn(`audisledHSGetTopUser.php: Unauthorized key: ${key}`);
      return c.text("Unauthorized", 401);
    }

    try {
      const results = await sledStore.getTopScores(1);
      const record = results[0] || { psnid: "None", races: 0, score: 0.0 };

      const xmlObj = {
        scores: {
          entry: {
            psnid: record.psnid,
            races: record.races,
            score: record.score,
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get top user");
      return c.text("Internal Server Error", 500);
    }
  });

  // 4. Global High-Score Table (HSML)
  app.post("/audisled/audisledHSGlobalTable.php", async (c) => {
    const form = await c.req.formData();
    const key = form.get("key")?.toString();
    const title = form.get("title")?.toString() || "Leaderboard";

    if (key !== VEEMEE_HOME_KEY) {
      log.warn(`audisledHSGlobalTable.php: Unauthorized key: ${key}`);
      return c.text("Unauthorized", 401);
    }

    try {
      const topScores = await sledStore.getTopScores(8);

      // Build the HSML format
      const textElements: any[] = [
        { $: { X: "100", Y: "70", col: "#FFFFFF", size: "4" }, _: title },
      ];

      let iY = 142;
      for (let i = 0; i < 8; i++) {
        const scoreNum = i + 1;
        textElements.push({
          $: { X: "100", Y: (iY + 7).toString(), col: "#FFFFFF", size: "3" },
          _: scoreNum.toString(),
        });

        const record = topScores[i];
        if (record) {
          textElements.push({
            $: { X: "190", Y: (iY + 5).toString(), col: "#FFFFFF", size: "3" },
            _: record.psnid,
          });
          textElements.push({
            $: { X: "1060", Y: (iY + 5).toString(), col: "#FFFFFF", size: "3" },
            _: formatSledTime(record.score),
          });
        } else {
          textElements.push({
            $: { X: "190", Y: (iY + 5).toString(), col: "#FFFFFF", size: "3" },
            _: "---",
          });
          textElements.push({
            $: {
              X: "1060",
              Y: (iY + 5).toString(),
              col: "#FFFFFF",
              size: "3",
            },
            _: "-- : -- . --",
          });
        }
        iY += 46;
      }

      const xmlObj = {
        XML: {
          PAGE: {
            TEXT: textElements,
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get global high-score table");
      return c.text("Internal Server Error", 500);
    }
  });

  // 5. Get Random Scores
  app.post("/audisled/audisledHSGetRandomScores.php", async (c) => {
    const form = await c.req.formData();
    const key = form.get("key")?.toString();

    if (key !== VEEMEE_HOME_KEY) {
      log.warn(`audisledHSGetRandomScores.php: Unauthorized key: ${key}`);
      return c.text("Unauthorized", 401);
    }

    try {
      const randomUsers = await sledStore.getRandomScores(8);

      const xmlObj = {
        XML: {
          scores: {
            entry: randomUsers.map((u: any) => ({
              psnid: u.psnid,
              races: u.races,
              score: u.score,
            })),
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get random scores");
      return c.text("Internal Server Error", 500);
    }
  });
}
