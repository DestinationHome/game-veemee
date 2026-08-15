import type { Hono } from "hono";

import type { Service } from "../service";

import { sledRoutes } from "./routes/sled";
import { verticalRunRoutes } from "./routes/verticalrun";
import { gamesRoutes } from "./routes/games";
import { technologyRoutes } from "./routes/technology";

export class AudiService implements Service {
  name = "Audi";
  description = "Audi Space service";

  registerRoutes(app: Hono) {
    sledRoutes(app);
    verticalRunRoutes(app);
    gamesRoutes(app);
    technologyRoutes(app);
  }
}
