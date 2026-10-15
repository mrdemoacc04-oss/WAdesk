import { mode } from "./env";
import { rootAdapter } from "./context";
import { dispatchTick } from "./services/campaigns";
import { maybeAmbient, processSimEvents } from "./wa/sim-run";

/* Local demo mode has no cron and no webhooks, so one in-process loop plays both roles:
   it advances campaigns and replays the simulator's delivery receipts and replies. */

const g = globalThis as unknown as { __wadeskWorker?: NodeJS.Timeout; __wadeskBusy?: boolean; __wadeskAmbientAt?: number };

export function startLocalWorker() {
  if (mode() !== "local" || g.__wadeskWorker || process.env.WADESK_NO_WORKER) return;
  g.__wadeskWorker = setInterval(async () => {
    if (g.__wadeskBusy) return;
    g.__wadeskBusy = true;
    try {
      const root = rootAdapter();
      await processSimEvents(root);
      await dispatchTick(root, 2500);
      await processSimEvents(root);
      if (Date.now() - (g.__wadeskAmbientAt ?? 0) > 75_000) {
        g.__wadeskAmbientAt = Date.now();
        await maybeAmbient(root);
      }
    } catch (e) {
      console.error("[worker]", e);
    } finally {
      g.__wadeskBusy = false;
    }
  }, 1500);
  g.__wadeskWorker.unref?.();
  console.log("[wadesk] local worker running (demo mode)");
}
