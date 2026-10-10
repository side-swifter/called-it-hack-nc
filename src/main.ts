import { startVibeBetMessaging } from "./messaging/vibebet.js";

async function main(): Promise<void> {
  const messaging = await startVibeBetMessaging();

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await messaging.stop().catch(() => undefined);
  };

  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

main().catch(() => {
  console.error("VibeBet failed to start.");
  process.exitCode = 1;
});
