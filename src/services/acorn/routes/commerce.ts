import type { Hono } from "hono";
import { unimplemented } from "../middleware";

export function commerceRoutes(app: Hono) {
  app.use("/commerce/*", unimplemented);

  app.post("/commerce/get_count.php", (c) => {
    return c.json({ count: 0 });
  });

  app.post("/commerce/get_ownership.php", (c) => {
    return c.json({ owner: "zeph" });
  });

  app.post("/commerce/get_categories.php", (c) => {
    return c.json({});
  });
}
