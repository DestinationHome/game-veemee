import { mkdir } from "node:fs/promises";
import type { Hono } from "hono";
import { Builder } from "xml2js";
import { log } from "@main";

interface ProfileData {
  variables: Record<string, { type: string; value: string; size?: string }>;
  lists: Record<string, { type: string; values: string[]; size?: string }>;
}

const xmlBuilder = new Builder({
  xmldec: { version: "1.0", encoding: "UTF-8" },
});

async function ensureDir() {
  await mkdir("data/nml_profiles", { recursive: true });
}

export function profileRoutes(app: Hono) {
  // 1. verify.php
  app.post("/nml/rc2/profile/verify.php", async (c) => {
    return c.text("1,0,0,0,0,0,0,Home Square");
  });

  // 2. reward.php
  app.post("/nml/rc2/profile/reward.php", async (c) => {
    // Return "0" to indicate no rewards/tickets to add
    return c.text("0");
  });

  // 3. get.php
  app.post("/nml/rc2/profile/get.php", async (c) => {
    const form = await c.req.formData();
    const psnid = form.get("psnid")?.toString();

    if (!psnid || /[^a-zA-Z0-9_-]/.test(psnid)) {
      log.error(`get.php: Invalid or missing psnid: ${psnid}`);
      const errXml = xmlBuilder.buildObject({
        profiles: {
          error: "Invalid PSNID",
        },
      });
      return c.text(errXml, 400, {
        "Content-Type": "application/xml",
      });
    }

    await ensureDir();
    const filePath = `data/nml_profiles/${psnid}.json`;
    const file = Bun.file(filePath);

    let profile: ProfileData = { variables: {}, lists: {} };

    if (await file.exists()) {
      try {
        profile = await file.json();
      } catch (error) {
        log.withError(error).error(`Failed to read profile JSON for ${psnid}`);
      }
    }

    // Convert variables to xml2js format
    const variablesXml = Object.entries(profile.variables).map(
      ([name, variable]) => ({
        $: { name, type: variable.type },
        _: variable.value,
      }),
    );

    // Convert lists to xml2js format
    const listsXml = Object.entries(profile.lists).map(([name, list]) => ({
      $: { name, type: list.type },
      value: list.values,
    }));

    const gameObj: any = {
      $: { game_id: "1" },
    };

    if (variablesXml.length > 0) {
      gameObj.variable = variablesXml;
    }
    if (listsXml.length > 0) {
      gameObj.list = listsXml;
    }

    // Build response XML object
    const xmlObj = {
      profiles: {
        player: {
          $: { psnid_id: "1" },
          game: gameObj,
        },
      },
    };

    const xml = xmlBuilder.buildObject(xmlObj);
    return c.text(xml, 200, { "Content-Type": "application/xml" });
  });

  // 4. set.php
  app.post("/nml/rc2/profile/set.php", async (c) => {
    const form = await c.req.formData();
    const psnid = form.get("psnid")?.toString();

    if (!psnid || /[^a-zA-Z0-9_-]/.test(psnid)) {
      log.error(`set.php: Invalid or missing psnid: ${psnid}`);
      const errXml = xmlBuilder.buildObject({
        profiles: {
          error: "Invalid PSNID",
        },
      });
      return c.text(errXml, 400, {
        "Content-Type": "application/xml",
      });
    }

    await ensureDir();
    const filePath = `data/nml_profiles/${psnid}.json`;
    const file = Bun.file(filePath);

    let profile: ProfileData = { variables: {}, lists: {} };

    if (await file.exists()) {
      try {
        profile = await file.json();
      } catch (error) {
        log
          .withError(error)
          .error(`Failed to read profile JSON for merging ${psnid}`);
      }
    }

    // Extract variables
    let i = 1;
    while (true) {
      const name = form.get(`name[${i}]`)?.toString();
      if (name === undefined) break;
      const type = form.get(`type[${i}]`)?.toString() || "";
      const value = form.get(`value[${i}]`)?.toString() || "";
      const size = form.get(`size[${i}]`)?.toString();
      profile.variables[name] = { type, value, size };
      i++;
    }

    // Extract lists
    let j = 1;
    while (true) {
      const listName = form.get(`list[${j}][name]`)?.toString();
      if (listName === undefined) break;
      const listType = form.get(`list[${j}][type]`)?.toString() || "";
      const listSize = form.get(`size[${j}]`)?.toString();
      const values: string[] = [];
      let l = 1;
      while (true) {
        const val = form.get(`list[${j}][values][${l}]`)?.toString();
        if (val === undefined) break;
        values.push(val);
        l++;
      }
      profile.lists[listName] = { type: listType, values, size: listSize };
      j++;
    }

    try {
      await Bun.write(filePath, JSON.stringify(profile, null, 2));
      log.info(`Successfully saved profile for ${psnid}`);
    } catch (error) {
      log.withError(error).error(`Failed to save profile JSON for ${psnid}`);
      const errXml = xmlBuilder.buildObject({
        profiles: {
          error: "Internal Save Error",
        },
      });
      return c.text(errXml, 500, {
        "Content-Type": "application/xml",
      });
    }

    // Response on success
    const successXml = xmlBuilder.buildObject({
      profiles: {
        success: "1",
      },
    });
    return c.text(successXml, 200, { "Content-Type": "application/xml" });
  });
}
