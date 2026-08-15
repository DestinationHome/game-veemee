import type { Hono } from "hono";

export interface Service {
  name: string;
  description: string;

  registerRoutes(app: Hono): void;
}
