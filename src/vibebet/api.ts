// Tiny HTTP server for the Flutter leaderboard app: JSON at /api/leaderboard, built web app at /.
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { balanceOf, leaderboard, POT } from "./chips.js";
import { NAMES, aliasFor, saveNames } from "./config.js";
import { getState } from "./state.js";
import { logEvent } from "./events.js";
import * as game from "./snapshot.js";

export interface ResultRecord {
  at: string;
  target: string;
  item: string;
  winners: string[];
  losers: string[];
  pot: number;
  outcome: "yes" | "no";
  betId?: string;
}
const results: ResultRecord[] = [];

async function tg(method: string, params: Record<string, string>): Promise<any> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}?${new URLSearchParams(params)}`);
    return (await res.json()).result;
  } catch {
    return undefined;
  }
}

// Look up a Telegram first name: their private chat with the bot, else any group we've seen them in.
async function nameFor(id: string): Promise<string | undefined> {
  const chat = await tg("getChat", { chat_id: id });
  if (chat?.first_name) return chat.first_name;
  try {
    const groups = JSON.parse(readFileSync(".groups.json", "utf8")) as Record<string, string[]>;
    for (const [gid, members] of Object.entries(groups)) {
      if (!members.includes(id)) continue;
      const m = await tg("getChatMember", { chat_id: gid, user_id: id });
      if (m?.user?.first_name) return m.user.first_name;
    }
  } catch {}
  return undefined;
}

export function recordResult(r: Omit<ResultRecord, "at">): void {
  results.unshift({ at: new Date().toISOString(), ...r });
  logEvent("chips", `Bet settled: ${r.winners.length ? r.winners.join(", ") + " called it" : "nobody called it"} (pot ${r.pot})`, r.betId);
  if (results.length > 20) results.pop();
}

const WEB_DIR = join(process.cwd(), "called_it_app", "build", "web");
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
};

export function startApi(knownIds: () => string[], port = Number(process.env.API_PORT || 8787)): void {
  game.bindKnown(knownIds);
  const server = createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    res.setHeader("access-control-allow-origin", "*");

    if (url === "/api/state" && req.method === "GET") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(game.snapshot()));
      return;
    }

    if (req.method === "OPTIONS") {
      res.setHeader("access-control-allow-headers", "content-type");
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "POST" && url.startsWith("/api/")) {
      let raw = "";
      for await (const c of req) raw += c;
      let body: any = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {}
      let out: { status: number; body: unknown } = { status: 404, body: { error: "Unknown route" } };
      try {
        const sel = url.match(/^\/api\/predictions\/([^/]+)\/select$/);
        if (sel) out = await game.select(sel[1], body.choice);
        else if (url === "/api/demo/start") out = game.startDemo();
        else if (url === "/api/demo/generate") out = await game.generate();
        else if (url === "/api/demo/simulate-picks") out = await game.simulatePicks();
        else if (url === "/api/demo/lock") out = game.lock();
        else if (url === "/api/demo/resolve") out = await game.resolve(body.outcome);
        else if (url === "/api/demo/reset") out = await game.reset();
        else if (url === "/api/demo/seed") out = await game.seed();
        else if (url === "/api/rooms/messages") out = await game.postMessage(body.text);
      } catch (e) {
        console.error("[api] error:", e);
        out = { status: 500, body: { error: "Server error" } };
      }
      res.statusCode = out.status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(out.body));
      return;
    }

    if (url === "/api/leaderboard") {
      const ids = knownIds().filter((h) => /^\d+$/.test(h));
      let learned = false;
      await Promise.all(
        ids.filter((id) => !NAMES.has(id)).map(async (id) => {
          const n = await nameFor(id);
          if (n) {
            NAMES.set(id, n);
            learned = true;
          }
        }),
      );
      if (learned) saveNames();
      const state = getState();
      const body = {
        players: leaderboard(ids.filter((id) => NAMES.has(id))).map(([id, chips], i) => ({ rank: i + 1, id, name: aliasFor(id), chips })),
        pot: balanceOf(POT),
        live: state.phase === "open" ? { stakes: state.picks.size, players: state.players.length } : null, // never exposes the target
        results,
        updatedAt: new Date().toISOString(),
      };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
      return;
    }

    // Static Flutter web build.
    const rel = normalize(url === "/" ? "/index.html" : url).replace(/^(\.\.[/\\])+/, "");
    const file = join(WEB_DIR, rel);
    if (file.startsWith(WEB_DIR) && existsSync(file)) {
      res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
      res.end(readFileSync(file));
      return;
    }
    res.statusCode = 404;
    res.end("not found (build the app: cd called_it_app && flutter build web)");
  });
  server.on("error", (e) => console.error("[api] failed:", (e as Error).message));
  server.listen(port, "0.0.0.0", () => console.log(`Leaderboard API on :${port}`));
}
