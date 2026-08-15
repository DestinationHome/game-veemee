import "./instrumentation";

import { openTelemetryPlugin } from "@loglayer/plugin-opentelemetry";
import { OpenTelemetryTransport } from "@loglayer/transport-opentelemetry";
import { PinoTransport } from "@loglayer/transport-pino";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { stream } from "hono/streaming";
import { LogLayer } from "loglayer";
import pino from "pino";
import { serializeError } from "serialize-error";

import { AcornService } from "./services/acorn/service";
import { AudiService } from "./services/audi/service";
import { NmlService } from "./services/nml/service";
import { GoFishService } from "./services/gofish/service";

const FallbackThumbnail = Bun.file("./public/thumbnails/notfound.png");

const app = new Hono();
const services = [
  new AcornService(),
  new AudiService(),
  new NmlService(),
  new GoFishService(),
];

// middleware and logging
export const log = new LogLayer({
  errorSerializer: serializeError,
  transport: [
    new PinoTransport({
      logger: pino({
        transport: {
          target: "pino-pretty",
        },
      }),
    }),
    new OpenTelemetryTransport(),
  ],
  // @ts-ignore The types are correct
  plugins: [openTelemetryPlugin()],
});

app.use(async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;

  const layer = log.withContext({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
  });

  layer.info(`--> ${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
});

// services
for (const service of services) {
  service.registerRoutes(app);
}

app.use(
  "/*",
  serveStatic({
    root: "./public",
    onNotFound: async (_, c) => {
      if (!c.req.path.includes("thumbnails")) {
        return;
      }
      c.res.headers.set("Content-Type", "image/png");
      c.res = stream(c, async (s) => {
        const reader = FallbackThumbnail.stream();
        for await (const chunk of reader) {
          await s.write(chunk);
        }
      });
    },
  }),
);

log
  .withContext({
    services: services.map((s) => ({
      name: s.name,
      description: s.description,
    })),
  })
  .info("Server is running!");

export default app;
