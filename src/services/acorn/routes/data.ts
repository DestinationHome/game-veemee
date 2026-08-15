import challenges from "@static/challenges.json";
import tasks from "@static/tasks.json";

import type { Hono } from "hono";

export function dataRoutes(app: Hono) {
  app.post("/data/parkChallenges.php", async (c) => {
    return c.json(challenges);
  });

  app.post("/data/parkTasks.php", async (c) => {
    return c.json(tasks);
  });
}
