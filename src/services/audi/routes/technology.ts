import { eq, sql, inArray } from "drizzle-orm";
import type { Hono } from "hono";
import { Builder } from "xml2js";
import { log } from "@main";
import { audiTechnologyProfiles, audiTechnologyScores, db } from "../db";

const xmlBuilder = new Builder({ headless: true });

function getTrackName(t: number): string {
  if (t === 1) return "City";
  if (t === 2) return "Mountain";
  if (t === 3) return "Autobahn";
  return "Unknown";
}

function getChallengeName(c: number): string {
  if (c === 1) return "Time Trial";
  if (c === 2) return "Comfort";
  return "Unknown";
}

function getModifierName(m: number): string {
  if (m === 1) return "Normal";
  if (m === 2) return "Reverse";
  if (m === 3) return "Gates";
  if (m === 4) return "Reverse Gates";
  return "Unknown";
}

function createDefaultProfile(psnid: string): any {
  return {
    psnID: psnid,
    chosenTrack: 1,
    chosenChallenge: 1,
    chosenModifiers: 1,
    equippedQuattro: 1,
    equippedTransmission: 1,
    equippedUltra: 1,
    chosenGhostType: 1,
    unlockedQuattro: [1],
    unlockedTransmission: [1],
    unlockedUltra: [1],
    unlockedTracks: [1],
    unlockedChallenges: [1],
    unlockedModifiers: [],
    newUnlocks: [],
    ghostDefs: [],
    isValid: true,
    medalsWon: [],
    hiScores: [],
  };
}

function exportProfile(profile: any): any {
  const medalsWon: Record<string, number> = {};
  const hiScores: Record<string, any> = {};

  for (let track = 1; track <= 3; track++) {
    for (let challenge = 1; challenge <= 2; challenge++) {
      for (let modifier = 1; modifier <= 4; modifier++) {
        const key = `${track} ${challenge} ${modifier}`;

        // Count medals
        const count = (profile.medalsWon || []).filter(
          (m: any) =>
            m.track === track &&
            m.challenge === challenge &&
            m.modifier === modifier,
        ).length;
        medalsWon[key] = count;

        // Find high score
        const score = (profile.hiScores || []).find(
          (s: any) =>
            s.track === track &&
            s.challenge === challenge &&
            s.modifier === modifier,
        );

        hiScores[key] = score
          ? {
              timeTaken: score.timeTaken,
              penalties: score.penalties,
              comfort: score.comfort,
              efficiency: score.efficiency,
            }
          : {
              timeTaken: 60,
              penalties: 0,
              comfort: 1,
              efficiency: 1,
            };
      }
    }
  }

  return {
    ...profile,
    medalsWon,
    hiScores,
  };
}

export function technologyRoutes(app: Hono) {
  // 1. Get Profile
  app.post("/audi_tech/getprofile.php", async (c) => {
    const form = await c.req.formData();
    const psnid = form.get("psnid")?.toString();

    if (!psnid) {
      log.error("getprofile.php: Missing psnid");
      return c.text("Bad Request", 400);
    }

    try {
      const record = await db
        .select()
        .from(audiTechnologyProfiles)
        .where(eq(audiTechnologyProfiles.psnid, psnid));

      let profileObj;
      if (record.length === 0) {
        profileObj = createDefaultProfile(psnid);
      } else {
        profileObj = JSON.parse(record[0].profile);
      }

      const exported = exportProfile(profileObj);
      return c.json(exported);
    } catch (error) {
      log.withError(error).error("Failed to get technology profile");
      return c.text("Internal Server Error", 500);
    }
  });

  // 2. Set Profile
  app.post("/audi_tech/setprofile.php", async (c) => {
    const form = await c.req.formData();
    const profileStr = form.get("profile")?.toString();

    if (!profileStr) {
      log.error("setprofile.php: Missing profile payload");
      return c.text("Bad Request", 400);
    }

    try {
      const update = JSON.parse(profileStr);
      const psnid = update.psnID;

      if (!psnid) {
        log.error("setprofile.php: Missing psnID inside profile payload");
        return c.text("Bad Request", 400);
      }

      // Get existing profile or default
      const record = await db
        .select()
        .from(audiTechnologyProfiles)
        .where(eq(audiTechnologyProfiles.psnid, psnid));

      const existingProfile =
        record.length > 0
          ? JSON.parse(record[0].profile)
          : createDefaultProfile(psnid);

      // Convert medalsWon map back to array
      const medalsWon: any[] = [];
      if (update.medalsWon) {
        for (const [key, countVal] of Object.entries(update.medalsWon)) {
          const parts = key.split(" ");
          if (parts.length === 3) {
            const [track, challenge, modifier] = parts.map(Number);
            const count = Number(countVal) || 0;
            for (let i = 0; i < count; i++) {
              medalsWon.push({ track, challenge, modifier });
            }
          }
        }
      }

      // Convert hiScores map back to array and update database scores table
      const hiScores: any[] = [];
      if (update.hiScores) {
        for (const [combination, scoreVal] of Object.entries(update.hiScores)) {
          const parts = combination.split(" ");
          if (parts.length === 3) {
            const [track, challenge, modifier] = parts.map(Number);
            const s = scoreVal as any;
            const timeTaken = Number(s.timeTaken) || 0;
            const penalties = Number(s.penalties) || 0;
            const comfort = Number(s.comfort) || 0;
            const efficiency = Number(s.efficiency) || 0;

            // Ignore defaults (either all 0s or our placeholder 60/0/1/1 default score)
            if (
              (timeTaken === 0 &&
                penalties === 0 &&
                comfort === 0 &&
                efficiency === 0) ||
              (timeTaken === 60 &&
                penalties === 0 &&
                comfort === 1 &&
                efficiency === 1)
            ) {
              continue;
            }

            hiScores.push({
              track,
              challenge,
              modifier,
              timeTaken,
              penalties,
              comfort,
              efficiency,
            });

            // Upsert in database table
            const computedScore =
              comfort * 100 - timeTaken - penalties + efficiency;
            await db.run(sql`
              INSERT INTO audi_technology_scores (psnid, track, challenge, modifier, time_taken, penalties, comfort, efficiency, score)
              VALUES (${psnid}, ${track}, ${challenge}, ${modifier}, ${timeTaken}, ${penalties}, ${comfort}, ${efficiency}, ${computedScore})
              ON CONFLICT(psnid, track, challenge, modifier) DO UPDATE SET
                time_taken = excluded.time_taken,
                penalties = excluded.penalties,
                comfort = excluded.comfort,
                efficiency = excluded.efficiency,
                score = excluded.score
            `);
          }
        }
      }

      // Merge standard fields
      const mergedProfile = {
        ...existingProfile,
        ...update,
        isValid: true,
        medalsWon,
        hiScores,
      };

      // Save profile JSON
      if (record.length === 0) {
        await db.insert(audiTechnologyProfiles).values({
          psnid,
          profile: JSON.stringify(mergedProfile),
        });
      } else {
        await db
          .update(audiTechnologyProfiles)
          .set({
            profile: JSON.stringify(mergedProfile),
          })
          .where(eq(audiTechnologyProfiles.psnid, psnid));
      }

      const exported = exportProfile(mergedProfile);
      return c.json(exported);
    } catch (error) {
      log.withError(error).error("Failed to update technology profile");
      return c.text("Internal Server Error", 500);
    }
  });

  // 3. Leaderboard XML
  app.get("/audi_tech/hiscores.xml", async (c) => {
    try {
      const allScores = await db.select().from(audiTechnologyScores);

      // Group and find top score for each combination
      const topScoresMap = new Map<string, any>();
      for (const s of allScores) {
        const combination = `Track${s.track}${s.challenge}${s.modifier}`;
        const existing = topScoresMap.get(combination);

        if (!existing || s.score > existing.score) {
          topScoresMap.set(combination, s);
        } else if (s.score === existing.score) {
          if (s.timeTaken < existing.timeTaken) {
            topScoresMap.set(combination, s);
          } else if (s.timeTaken === existing.timeTaken) {
            if (s.penalties < existing.penalties) {
              topScoresMap.set(combination, s);
            }
          }
        }
      }

      const formattedScores: Record<string, any> = {};
      for (const [combination, s] of topScoresMap.entries()) {
        const trackName = getTrackName(s.track);
        const challengeName = getChallengeName(s.challenge);
        const modifierName = getModifierName(s.modifier);
        const nameStr = `${trackName} (${challengeName}) [${modifierName}]`;

        formattedScores[combination] = {
          Name: nameStr,
          Time: s.timeTaken,
          Penalties: s.penalties,
          Comfort: s.comfort,
          Efficiency: s.efficiency,
          TotalScore: s.score,
        };
      }

      const xmlObj = {
        AudiTechHighScore: formattedScores,
      };

      const xml = xmlBuilder.buildObject(xmlObj);
      return c.text(xml, 200, { "Content-Type": "application/xml" });
    } catch (error) {
      log.withError(error).error("Failed to get high scores xml");
      return c.text("Internal Server Error", 500);
    }
  });

  // 4. Get Friends Ghost Times
  app.post("/audi_tech/getFriendsGhostTimes.php", async (c) => {
    const form = await c.req.formData();
    const friendsStr = form.get("friends")?.toString();

    if (!friendsStr) {
      log.error("getFriendsGhostTimes.php: Missing friends parameter");
      return c.json({});
    }

    try {
      const friendNames: string[] = JSON.parse(friendsStr);
      if (!Array.isArray(friendNames) || friendNames.length === 0) {
        return c.json({});
      }

      // Query all scores for these friends
      const scores = await db
        .select()
        .from(audiTechnologyScores)
        .where(inArray(audiTechnologyScores.psnid, friendNames));

      // Initialize the map with empty arrays for all requested friends
      const responseMap: Record<string, [number[], number[], number[]]> = {};
      for (const name of friendNames) {
        responseMap[name] = [[], [], []];
      }

      // Populate high scores
      for (const s of scores) {
        const u = s.track - 1 + (s.challenge - 1) * 3 + (s.modifier - 1) * 6;
        if (responseMap[s.psnid]) {
          responseMap[s.psnid][0].push(u);
          responseMap[s.psnid][1].push(s.timeTaken);
          responseMap[s.psnid][2].push(1); // equippedConfig dummy
        }
      }

      return c.json(responseMap);
    } catch (error) {
      log.withError(error).error("Failed to get friends ghost times");
      return c.json({});
    }
  });
}
