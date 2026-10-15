export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLocalWorker } = await import("./lib/server/worker");
    startLocalWorker();
  }
}
