import Database from "bun:sqlite";
import { log } from "@main";
import config from "@static/config.json";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Hono } from "hono";

// Connect to SQLite databases using bun-sqlite
const itemsDb = drizzle(new Database("data/items.db"));
const locatorsDb = drizzle(new Database("data/locators.db"));
const shopsDb = drizzle(new Database("data/shops.db"));

// Constants
const DefaultProfile = {
  ph: 0,
  challenges: { doneList: {} },
  xp: 1,
  vv: 69420,
  cakeLastPlay: 0,
  dayPasses: { All: "/BigInt(0x000000006A6B2BA5)/" },
  level: 2,
};

// Dynamic schemas
const getItemsTable = (tableName: string) =>
  sqliteTable(tableName, {
    uuid: text("UUID").primaryKey(),
    cost: integer("Cost").notNull(),
    xp: integer("XP").notNull(),
  });

const getShopsTable = (tableName: string) =>
  sqliteTable(tableName, {
    uuid: text("UUID").primaryKey(),
  });

const getLocatorsTable = (tableName: string) =>
  sqliteTable(tableName, {
    identifier: text("Identifier").primaryKey(),
    locator: integer("Locator").notNull(),
  });

// Detect potential SQL injection by checking if anything other than alphanum + `:` is found
function sqlDetect(str: string): boolean {
  return /[^a-zA-Z0-9:]/.test(str);
}

// Config loader fallback from local JSON
function loadFromJson(product: string, configKey: string): unknown {
  log.info(`Requested config ${configKey} for product: ${product}`);
  const productData = (config as Record<string, unknown>)[product];
  if (!productData) return null;
  return (productData as Record<string, unknown>)[configKey] ?? null;
}

// Relocators compiler
function loadRelocatorsJson(sceneFrom: string): unknown[] {
  const sceneKey = [
    "AcornPark_Winter",
    "AcornPark_Thanksgiving",
    "AcornPark_4thJuly",
  ].includes(sceneFrom)
    ? sceneFrom
    : "Default";

  const parkRelocators = config.parkrelocators;
  if (!parkRelocators) return [];

  return Object.entries(parkRelocators)
    .filter(([scene]) => scene !== sceneKey)
    .map(([scene, image]) => ({
      destination: scene,
      image: image,
    }));
}

// Locators db query
async function loadLocatorsDb(scene: string) {
  let sceneName = scene === "AcornPark" ? "Default" : scene;
  if (sceneName.startsWith("AcornPark_")) {
    sceneName = sceneName.slice(10);
  }

  const tableName = `Locators::${sceneName}`;
  if (sqlDetect(tableName)) {
    log.warn(`Possible SQL injection detected! Triggered by: ${tableName}`);
    return [];
  }

  const tableDef = getLocatorsTable(tableName);
  try {
    const locators = await locatorsDb.select().from(tableDef);
    return locators.map((item) => ({
      identifier: item.identifier,
      locator: `intLocator${item.locator}`,
    }));
  } catch {
    log.warn(`Scene ${sceneName} did not exist in database or query failed`);
    return [];
  }
}

// Items/Shops db query
async function loadItemsDb(configKey: string) {
  if (["items", "Bundles", "Exclusives", "Tokens"].includes(configKey)) {
    const tableName = configKey === "items" ? "Items" : `Items::${configKey}`;
    if (sqlDetect(tableName)) {
      log.warn(`Possible SQL injection detected! Triggered by: ${tableName}`);
      return [];
    }

    const tableDef = getItemsTable(tableName);
    try {
      const items = await itemsDb.select().from(tableDef);
      return items.map((item) => ({
        identifier: item.uuid,
        cost: item.cost,
        xp: item.xp,
      }));
    } catch {
      log.warn(`Table ${tableName} did not exist in database or query failed`);
      return [];
    }
  } else {
    let shopName = configKey;
    if (shopName.startsWith("park")) {
      shopName = shopName.slice(4);
    }
    if (shopName.endsWith("Shop")) {
      shopName = shopName.slice(0, -4);
    }

    const tableName = `Shops::${shopName}`;
    if (sqlDetect(tableName)) {
      log.warn(`Possible SQL injection detected! Triggered by: ${tableName}`);
      return [];
    }

    const tableDef = getShopsTable(tableName);
    try {
      const shopItems = await shopsDb.select().from(tableDef);
      return shopItems.map((item) => ({
        identifier: item.uuid,
      }));
    } catch {
      log.warn(`Shop ${shopName} did not exist in database or query failed`);
      return [];
    }
  }
}

export function storageRoutes(app: Hono) {
  app.post("/storage/readconfig.php", async (c) => {
    const form = await c.req.formData();

    const configKey = form.get("config")?.toString();
    const product = form.get("product")?.toString();
    const scene = form.get("scene")?.toString();

    if (!configKey || !product) {
      log.error("Missing config or product in readconfig request");
      return c.json({});
    }

    let data: unknown = null;

    if (product === "vcommerce") {
      data = await loadItemsDb(configKey);
    } else if (product === "parklocators") {
      if (scene) {
        data = await loadLocatorsDb(scene);
      } else {
        log.error("Missing scene in readconfig request for parklocators");
      }
    } else if (product === "parkrelocators") {
      if (scene) {
        data = loadRelocatorsJson(scene);
      } else {
        log.error("Missing scene in readconfig request for parkrelocators");
      }
    } else {
      data = loadFromJson(product, configKey);
    }

    if (data === null) {
      log.warn(`Missing config ${configKey} for product: ${product}`);
      return c.json({});
    }

    return c.json(data);
  });

  app.post("/storage/readtable.php", async (c) => {
    const form = await c.req.formData();

    const psnid = form.get("psnid")?.toString();
    if (!psnid) {
      log.error("Missing psnid in readtable request");
      return c.json({});
    }

    return c.json(DefaultProfile);
  });

  app.post("/storage/writetable.php", async (c) => {
    const form = await c.req.formData();

    const psnid = form.get("psnid")?.toString();
    const profileStr = form.get("profile")?.toString();

    if (!psnid || !profileStr) {
      log.error("Missing psnid or profile in writetable request");
      return c.json({});
    }

    try {
      const data = JSON.parse(profileStr);
      return c.json(data);
    } catch (error) {
      log.withError(error).error(`Failed to parse profile JSON for ${psnid}`);
      return c.json({});
    }
  });
}
