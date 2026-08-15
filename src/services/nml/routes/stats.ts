import type { Hono } from "hono";

export function statsRoutes(app: Hono) {
  // TODO: implement this
  app.post("/nml/rc2/stats/getConfig.php", async (c) => {
    return c.json({
      exitScene: false,
      exitSceneHook: {
        "1": "off",
      },
      ownerExitOnly: false,
      shouldReboot: false,
      reflect: "4534moerktm34!534m134Gg54FDG",
    });
  });
}
