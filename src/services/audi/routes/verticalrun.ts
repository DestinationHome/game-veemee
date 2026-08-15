import type { Hono } from "hono";
import { Builder } from "xml2js";
import { log } from "@main";
import { audiVerticalRunScores, db } from "../db";
import { DrizzleScoreboardStore } from "../../../common/scoreboard/store";

const VEEMEE_HOME_KEY = "3Ebadrebr6qezag8";
const xmlBuilder = new Builder({ headless: true });

const verticalRunStore = new DrizzleScoreboardStore({
  db,
  table: audiVerticalRunScores,
  psnidCol: audiVerticalRunScores.psnid,
  scoreCol: audiVerticalRunScores.distance,
  racesCol: audiVerticalRunScores.races,
  isBetter: (newDist, existingDist, newRec, existingRec) => {
    if (existingDist === 0) return true;
    if (newDist > existingDist) return true;
    if (newDist === existingDist && newRec && newRec.time < existingRec.time)
      return true;
    return false;
  },
  leaderboardOrder: "desc",
});

export function verticalRunRoutes(app: Hono) {
  // 1. Set User Data
  app.post("/audiHSSetUserData.php", async (c) => {
    const form = await c.req.formData();
    const key = form.get("key")?.toString();
    const psnid = form.get("psnid")?.toString();
    const timeStr = form.get("time")?.toString();
    const distStr = form.get("dist")?.toString();

    if (key !== VEEMEE_HOME_KEY) {
      log.warn(`audiHSSetUserData.php: Unauthorized key: ${key}`);
      return c.text("Unauthorized", 401);
    }

    if (!psnid || timeStr === undefined || distStr === undefined) {
      log.error("audiHSSetUserData.php: Missing psnid, time or dist");
      return c.text("Bad Request", 400);
    }

    const playerTime = parseFloat(timeStr);
    const playerDistance = parseFloat(distStr);

    if (isNaN(playerTime) || isNaN(playerDistance)) {
      log.error(
        `audiHSSetUserData.php: Invalid numeric inputs: time=${timeStr}, dist=${distStr}`,
      );
      return c.text("Bad Request", 400);
    }

    try {
      const finalRecord = await verticalRunStore.setPlayerScore(
        psnid,
        playerDistance,
        { time: playerTime },
      );

      const xmlObj = {
        scores: {
          entry: {
            psnid: finalRecord.psnid,
            races: finalRecord.races,
            time: finalRecord.time,
            distance: finalRecord.distance,
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to set Vertical Run user score");
      return c.text("Internal Server Error", 500);
    }
  });

  // 2. Get User Data
  app.post("/audiHSGetUserData.php", async (c) => {
    const form = await c.req.formData();
    const key = form.get("key")?.toString();
    const psnid = form.get("psnid")?.toString();

    if (key !== VEEMEE_HOME_KEY) {
      log.warn(`audiHSGetUserData.php: Unauthorized key: ${key}`);
      return c.text("Unauthorized", 401);
    }

    if (!psnid) {
      log.error("audiHSGetUserData.php: Missing psnid");
      return c.text("Bad Request", 400);
    }

    try {
      const record = (await verticalRunStore.getPlayerScore(psnid)) || {
        psnid,
        races: 0,
        time: 0.0,
        distance: 0.0,
      };

      const xmlObj = {
        scores: {
          entry: {
            psnid: record.psnid,
            races: record.races,
            time: record.time,
            distance: record.distance,
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get Vertical Run user score");
      return c.text("Internal Server Error", 500);
    }
  });

  // 3. Get Top User
  app.post("/audiHSGetTopUser.php", async (c) => {
    const form = await c.req.formData();
    const key = form.get("key")?.toString();

    if (key !== VEEMEE_HOME_KEY) {
      log.warn(`audiHSGetTopUser.php: Unauthorized key: ${key}`);
      return c.text("Unauthorized", 401);
    }

    try {
      const results = await verticalRunStore.getTopScores(1);
      const record = results[0] || {
        psnid: "None",
        races: 0,
        time: 0.0,
        distance: 0.0,
      };

      const xmlObj = {
        scores: {
          entry: {
            psnid: record.psnid,
            races: record.races,
            time: record.time,
            distance: record.distance,
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get Vertical Run top user");
      return c.text("Internal Server Error", 500);
    }
  });

  // 4. Global High-Score Table (HSML)
  app.post("/audiHSGlobalTable.php", async (c) => {
    const form = await c.req.formData();
    const key = form.get("key")?.toString();
    const title = form.get("title")?.toString() || "Leaderboard";
    const localPsnid = form.get("psnid")?.toString();

    if (key !== VEEMEE_HOME_KEY) {
      log.warn(`audiHSGlobalTable.php: Unauthorized key: ${key}`);
      return c.text("Unauthorized", 401);
    }

    try {
      const topScores = await verticalRunStore.getTopScores(8);

      const rectElements: any[] = [
        { $: { X: "0", Y: "1", W: "0", H: "0", col: "#C0C0C0" } },
        { $: { X: "0", Y: "0", W: "1280", H: "720", col: "#000000" } },
      ];

      const textElements: any[] = [
        { $: { X: "57", Y: "42", col: "#FFFFFF", size: "4" }, _: title },
      ];

      let iY = 114;
      for (let i = 0; i < 8; i++) {
        const record = topScores[i];
        const szPSNID = record ? record.psnid : "";

        // Rank rect
        rectElements.push({
          $: { X: "57", Y: iY.toString(), W: "50", H: "50", col: "#662020" },
        });
        rectElements.push({
          $: {
            X: "57",
            Y: (iY + 45).toString(),
            W: "50",
            H: "4",
            col: "#873030",
          },
        });

        // Score rect
        rectElements.push({
          $: { X: "973", Y: iY.toString(), W: "254", H: "50", col: "#662020" },
        });
        rectElements.push({
          $: {
            X: "973",
            Y: (iY + 45).toString(),
            W: "254",
            H: "4",
            col: "#873030",
          },
        });

        // Name rect
        const isLocal = szPSNID !== "" && szPSNID === localPsnid;
        const nameBgCol = isLocal ? "#662020" : "#313131";
        const nameShadowCol = isLocal ? "#873030" : "#4D4D4D";

        rectElements.push({
          $: { X: "107", Y: iY.toString(), W: "867", H: "50", col: nameBgCol },
        });
        rectElements.push({
          $: {
            X: "107",
            Y: (iY + 45).toString(),
            W: "867",
            H: "4",
            col: nameShadowCol,
          },
        });

        // Rank Text
        textElements.push({
          $: { X: "70", Y: (iY + 5).toString(), col: "#FFFFFF", size: "3" },
          _: (i + 1).toString(),
        });

        if (record) {
          // Name Text
          textElements.push({
            $: { X: "145", Y: (iY + 5).toString(), col: "#FFFFFF", size: "3" },
            _: record.psnid,
          });
          // Score Text
          textElements.push({
            $: { X: "1015", Y: (iY + 5).toString(), col: "#FFFFFF", size: "3" },
            _: `${record.distance.toFixed(2)} m`,
          });
        } else {
          textElements.push({
            $: { X: "145", Y: (iY + 5).toString(), col: "#FFFFFF", size: "3" },
            _: "---",
          });
          textElements.push({
            $: { X: "1015", Y: (iY + 5).toString(), col: "#FFFFFF", size: "3" },
            _: "0.00 m",
          });
        }

        iY += 49;
      }

      const xmlObj = {
        XML: {
          PAGE: {
            RECT: rectElements,
            TEXT: textElements,
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log
        .withError(error)
        .error("Failed to get Vertical Run global high-score table");
      return c.text("Internal Server Error", 500);
    }
  });

  // 5. Get Random Scores
  app.post("/audiHSGetRandomScores.php", async (c) => {
    const form = await c.req.formData();
    const key = form.get("key")?.toString();

    if (key !== VEEMEE_HOME_KEY) {
      log.warn(`audiHSGetRandomScores.php: Unauthorized key: ${key}`);
      return c.text("Unauthorized", 401);
    }

    try {
      const randomUsers = await verticalRunStore.getRandomScores(8);

      const xmlObj = {
        XML: {
          scores: {
            entry: randomUsers.map((u: any) => ({
              psnid: u.psnid,
              races: u.races,
              time: u.time,
              distance: u.distance,
            })),
          },
        },
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get random Vertical Run scores");
      return c.text("Internal Server Error", 500);
    }
  });
}
