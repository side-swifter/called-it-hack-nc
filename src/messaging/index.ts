import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { identifyFinanceIntent, type FinanceIntent } from "./intent.js";

export { identifyFinanceIntent } from "./intent.js";
export type { FinanceIntent } from "./intent.js";

/** Finance access is injected so this messaging slice does not depend on a
 * particular bank, ledger, or mock-data implementation. */
export interface FinanceProvider {
  getSummary(intent: FinanceIntent): Promise<string>;
}

export interface FinanceMessagingService {
  /** Resolves when the incoming message stream ends; rejects on an unhandled
   * messaging/runtime error. */
  done: Promise<void>;
  /** Gracefully stop Spectrum and wait for the message loop to finish. */
  stop(): Promise<void>;
}

const GENERIC_FAILURE_REPLY = "I can't retrieve that summary right now. Please try again shortly.";

function processEnvironment(name: string): string | undefined {
  const env = (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
  return env?.[name];
}

function requiredEnvironmentValue(name: string): string {
  const env = (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
  const value = env?.[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

/**
 * Start the managed Spectrum Cloud iMessage integration.
 *
 * Configure `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET` in the
 * environment. Direct-message text/markdown asking about balance or recent
 * spending is processed by default; set IMESSAGE_ALLOW_GROUP_CHAT=true to opt
 * into existing group chats. Unrelated messages are ignored. Sender identifiers
 * and raw message text are never logged or passed to the injected finance provider.
 */
export async function startFinanceMessaging(
  financeProvider: FinanceProvider,
): Promise<FinanceMessagingService> {
  const app = await Spectrum({
    projectId: requiredEnvironmentValue("SPECTRUM_PROJECT_ID"),
    projectSecret: requiredEnvironmentValue("SPECTRUM_PROJECT_SECRET"),
    providers: [imessage.config()],
    options: { logLevel: "error" },
  });

  const done = consumeMessages(app, financeProvider);
  // Keep a caller that only uses stop() from triggering an unhandled rejection;
  // the original promise remains rejectable/awaitable through `done`.
  void done.catch(() => undefined);

  return {
    done,
    stop: async () => {
      await app.stop();
      await done;
    },
  };
}

async function consumeMessages(
  app: Awaited<ReturnType<typeof Spectrum>>,
  financeProvider: FinanceProvider,
): Promise<void> {
  for await (const [space, message] of app.messages) {
    if (message.platform !== "imessage") continue;

    // Avoid broadcasting a person's financial summary to other group members.
    if (
      imessage(space).type !== "dm" &&
      processEnvironment("IMESSAGE_ALLOW_GROUP_CHAT") !== "true"
    ) continue;

    const content = message.content;
    const text =
      content.type === "text"
        ? content.text
        : content.type === "markdown"
          ? content.markdown
          : undefined;
    if (text === undefined) continue;

    const intent = identifyFinanceIntent(text);
    if (!intent) continue;

    await space.responding(async () => {
      let reply: string;
      try {
        reply = await financeProvider.getSummary(intent);
        if (!reply.trim()) reply = GENERIC_FAILURE_REPLY;
      } catch {
        // Do not print exceptions: provider errors can contain sensitive data.
        reply = GENERIC_FAILURE_REPLY;
      }

      await space.send(reply);
    });
  }
}
