import { execSync } from "node:child_process";
import { startVibeBetMessaging } from "./messaging/vibebet.js";

async function main(): Promise<void> {
  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {}
  console.log(`[boot] Called It! code ${commit} started ${new Date().toISOString()}`);
  const messaging = await startVibeBetMessaging();

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => process.exit(0), 3000).unref(); // never hang on shutdown
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
