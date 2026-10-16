export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Demo mode has no cron and no webhooks, so it runs its own in-process loop.
    const { startLocalWorker } = await import("./lib/server/worker");
    startLocalWorker();

    // Production: set up the once-a-minute scheduler by ourselves (idempotent). Capped so a slow database can't
    // hold up the server starting; failures are logged, never thrown.
    const { registerScheduler } = await import("./lib/server/scheduler");
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([registerScheduler(), new Promise<void>((resolve) => (timer = setTimeout(resolve, 4000)))]);
    clearTimeout(timer);
  }
}
