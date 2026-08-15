import type { Hono } from "hono";
import type { Service } from "../service";
import { signer } from "./middleware";
import { commerceRoutes } from "./routes/commerce";
import { customRoutes } from "./routes/custom";
import { dataRoutes } from "./routes/data";
import { SlotManager, slotsRoutes } from "./routes/slots";
import { statsRoutes } from "./routes/stats";
import { storageRoutes } from "./routes/storage";

export class AcornService implements Service {
  name = "Acorn";
  description = "Acorn Meadows Park service";
  private slotManager = new SlotManager();

  registerRoutes(app: Hono) {
    app.use(signer);

    commerceRoutes(app);
    customRoutes(app);
    dataRoutes(app);
    statsRoutes(app);
    slotsRoutes(app, this.slotManager);
    storageRoutes(app);
  }
}
