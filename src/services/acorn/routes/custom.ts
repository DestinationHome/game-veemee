import config from "@static/config.json";

import type { Hono } from "hono";

const {
  custom: { boatTypes },
} = config;

export function customRoutes(app: Hono) {
  app.post("/custom/boats", async (c) => {
    const form = await c.req.formData();

    const scene = (form.get("scene") as string).split("_").at(1) || "AcornPark";
    const boats = boatTypes[scene as keyof typeof boatTypes] || [0, 0, 0, 0, 0];

    return c.json({ boatTypes: boats });
  });
}
