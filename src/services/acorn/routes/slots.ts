import { log } from "@main";
import type { Hono } from "hono";

export interface User {
  occupied: boolean;
  player: string | null;
  remove_at: Date | null;
}

export interface Slot {
  name: string;
  users: User[];
}

export interface Instance {
  id: string;
  slots: Slot[];
}

export class SlotManager {
  instances: Instance[] = [];

  // Cleans up expired users in a given slot
  private cleanExpiredUsers(slot: Slot) {
    const now = new Date();
    for (const u of slot.users) {
      if (u.occupied && u.remove_at && u.remove_at < now) {
        log.info(`Cleaning up expired user slot for player: ${u.player}`);
        u.occupied = false;
        u.player = null;
        u.remove_at = null;
      }
    }
  }

  getSlot(
    instanceId: string,
    slotName: string,
    maxSlot: number,
    psnId: string,
  ): number {
    let instance = this.instances.find((i) => i.id === instanceId);
    if (!instance) {
      instance = { id: instanceId, slots: [] };
      this.instances.push(instance);
    }

    let slot = instance.slots.find((s) => s.name === slotName);
    if (!slot) {
      const users: User[] = [];
      for (let i = 0; i < maxSlot; i++) {
        users.push({
          occupied: false,
          player: null,
          remove_at: null,
        });
      }
      slot = { name: slotName, users };
      instance.slots.push(slot);
    }

    // Clean up any expired users in this slot first
    this.cleanExpiredUsers(slot);

    // Try to find the user slot if this user already has it
    const existingIndex = slot.users.findIndex(
      (u) => u.occupied && u.player === psnId,
    );
    if (existingIndex !== -1) {
      // Refresh expiration time for this player
      slot.users[existingIndex].remove_at = new Date(Date.now() + 45000);
      return existingIndex + 1;
    }

    // Otherwise, find the first unoccupied position
    const freeIndex = slot.users.findIndex((u) => !u.occupied);
    if (freeIndex !== -1) {
      slot.users[freeIndex].occupied = true;
      slot.users[freeIndex].player = psnId;
      slot.users[freeIndex].remove_at = new Date(Date.now() + 45000);
      return freeIndex + 1;
    }

    return 0; // No free slots
  }

  freeSlot(instanceId: string, slotName: string, psnId: string): boolean {
    const instance = this.instances.find((i) => i.id === instanceId);
    if (!instance) return false;

    const slot = instance.slots.find((s) => s.name === slotName);
    if (!slot) return false;

    // Clean up expired users first
    this.cleanExpiredUsers(slot);

    const user = slot.users.find((u) => u.occupied && u.player === psnId);
    if (user) {
      user.occupied = false;
      user.player = null;
      user.remove_at = null;
      return true;
    }

    return false;
  }

  heartbeat(instanceId: string, slotName: string, psnId: string): boolean {
    const instance = this.instances.find((i) => i.id === instanceId);
    if (!instance) return false;

    const slot = instance.slots.find((s) => s.name === slotName);
    if (!slot) return false;

    // Clean up expired users first
    this.cleanExpiredUsers(slot);

    const user = slot.users.find((u) => u.occupied && u.player === psnId);
    if (user) {
      user.remove_at = new Date(Date.now() + 45000);
      return true;
    }

    return false;
  }
}

// biome-ignore lint/suspicious/noExplicitAny: Hono app context type parameter
export function slotsRoutes(app: Hono<any>, manager: SlotManager) {
  // Use middleware to set slots in context
  app.use("/slot-management/*", async (c, next) => {
    c.set("slots", manager);
    await next();
  });

  app.post("/slot-management/getobjectslot.php", async (c) => {
    const form = await c.req.formData();

    const psnId = form.get("psn_id")?.toString();
    const slotName = form.get("slot_name")?.toString();
    const instanceId = form.get("instance_id")?.toString();
    const maxSlotStr = form.get("max_slot")?.toString();

    if (!psnId || !slotName || !instanceId || !maxSlotStr) {
      log.error("Missing required form fields for getobjectslot");
      return c.json({ slot: 0 });
    }

    const maxSlot = parseInt(maxSlotStr, 10);
    log.info(`${psnId} is trying to get a slot for ${slotName}`);

    const slotsManager = c.get("slots") as SlotManager;
    const slotIndex = slotsManager.getSlot(
      instanceId,
      slotName,
      maxSlot,
      psnId,
    );

    return c.json({ slot: slotIndex });
  });

  app.post("/slot-management/remove.php", async (c) => {
    const form = await c.req.formData();

    const psnId = form.get("psn_id")?.toString();
    const slotName = form.get("slot_name")?.toString();
    const instanceId = form.get("instance_id")?.toString();

    if (!psnId || !slotName || !instanceId) {
      log.error("Missing required form fields for remove");
      return c.json({ success: true });
    }

    const slotsManager = c.get("slots") as SlotManager;
    slotsManager.freeSlot(instanceId, slotName, psnId);

    return c.json({ success: true });
  });

  app.post("/slot-management/heartbeat.php", async (c) => {
    const form = await c.req.formData();

    const psnId = form.get("psn_id")?.toString();
    const slotName = form.get("slot_name")?.toString();
    const instanceId = form.get("instance_id")?.toString();

    if (!psnId || !slotName || !instanceId) {
      log.error("Missing required form fields for heartbeat");
      return c.json({ success: true });
    }

    const slotsManager = c.get("slots") as SlotManager;
    slotsManager.heartbeat(instanceId, slotName, psnId);

    return c.json({ success: true });
  });
}
