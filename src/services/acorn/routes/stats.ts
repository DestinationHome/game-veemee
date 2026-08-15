import { log } from "@main";
import stats from "@static/stats.json";

import type { Hono } from "hono";

export function statsRoutes(app: Hono) {
  app.get("/stats/crash.php", async (c) => {
    const form = await c.req.formData();

    log.withMetadata({ form }).error("Crash reported");

    return c.json({ success: true });
  });

  app.get("/stats/getconfig.php", async (c) => {
    return c.json(stats);
  });

  app.post("/stats/getconfig.php", async (c) => {
    return c.json(stats);
  });

  app.post("/stats_tracking/usage.php", async (c) => {
    const form = await c.req.formData();

    const action = form.get("action");
    const type = form.get("type");
    const id = form.get("id");
    const value = form.get("value");

    log.withMetadata({ action, type, id, value }).info("Usage tracked");

    return c.json({ success: true });
  });

  app.post("/stats_tracking/achievements.php", async (c) => {
    const form = await c.req.formData();

    const action = form.get("action");
    const type = form.get("type");
    const id = form.get("id");
    const value = form.get("value");

    log.withMetadata({ action, type, id, value }).error("Achievement tracked");

    return c.json({ success: true });
  });
}
