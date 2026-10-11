import { startVibeBetMessaging } from "./messaging/vibebet.js";

async function main(): Promise<void> {
  const messaging = await startVibeBetMessaging();

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await messaging.stop().catch(() => undefined);
    process.exit(0);
  };

  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

main().catch(() => {
  console.error("Called It! failed to start.");
  process.exitCode = 1;
});
