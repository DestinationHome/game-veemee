import type { Hono } from "hono";
import type { Service } from "../service";
import { profileRoutes } from "./routes/profile";
import { statsRoutes } from "./routes/stats";

export class NmlService implements Service {
  name = "NML";
  description = "No Man's Land service";

  registerRoutes(app: Hono) {
    profileRoutes(app);
    statsRoutes(app);
  }
}
