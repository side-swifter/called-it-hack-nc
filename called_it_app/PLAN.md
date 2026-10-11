# CalledIt Flutter app: plan and work split

Source of truth: the 4 reference screenshots in the repo root (`Screenshot 2026-10-10 1900*.png`) and the product spec. Frutiger Aero look: frosted glass cards, glossy buttons, bubbles, blue/green. Mobile-first, runs as Flutter web served by the bot on :8787.

## Rules for every screen
- Never hardcode balances/pool/names. Render only from `appState.snap` (GET /api/state, polled every 2s). The UI never changes balances itself; it POSTs via `appState.post(key, path, body)` and re-renders from the next snapshot. Pass a unique `key` per action and disable the button while `appState.busy.contains(key)`.
- If `appState.error != null`, show a small "Showing last confirmed data" strip; if `snap == null`, show a loading state.
- Never show a success state (transfer settled, Photon delivered) before the backend reports it.
- Label chips as fictional ("Demo chips", "No cash value"). Payout (+3) and net (+1) are different numbers; Jordan-type losers show "No distribution".
- Use `Glass`, `GlossyButton`, `Pill`, `Avatar`, `ChipsBadge`, `Aero` tokens from `lib/widgets/aero.dart` and `lib/core/theme.dart`. Do not edit those, `lib/core/*`, or `lib/app.dart`; ask in your final report if you need a change.
- Navigation: tabs via `goTab(context, i)` (0 Home, 1 Room, 2 Activity, 3 Chips). Secondary routes via `Navigator.pushNamed(context, '/host' | '/result' | '/insights' | '/prediction' | '/settings' | '/green', arguments: predictionId)`.
- Verify with `cd called_it_app && flutter analyze` (must be clean) and `flutter build web --release`.

## Backend contract (src/vibebet/api.ts; the backend agent implements, UI agents code against it)
`GET /api/state` returns the `Snapshot` in `lib/core/models.dart` (field names there are the contract). `prediction` is null when nothing is live. `result` is the latest settled result or null.
Mutations (JSON body, return `{ok:true}` or HTTP 4xx `{error:"..."}`):
- `POST /api/predictions/:id/select` `{choice:"YES"|"NO"}`: one pick per player, chips move to the pot, idempotent.
- `POST /api/demo/start | /generate | /simulate-picks | /lock`
- `POST /api/demo/resolve` `{outcome:"YES"|"NO"}`: settles exactly once, second call returns existing result.
- `POST /api/demo/reset`: blocked while settling.
- `POST /api/rooms/messages` `{text}`: posts to the Telegram group through the bot; returns delivered/failed.
Host-only routes require `me.isHost`.

## Work split (each owner touches only their files)
| Owner | Files |
|---|---|
| A: Room + Home | `screens/room_screen.dart`, `screens/home_screen.dart`, `widgets/prediction_card.dart` (shared YES/NO card) |
| B: Chips + Result | `screens/chips_screen.dart`, `screens/result_screen.dart` |
| C: Host + Activity | `screens/host_screen.dart`, `screens/activity_screen.dart` |
| D: Secondary | `screens/secondary_screens.dart` (Insights, Prediction details, Settings, Green Moments) |
| E: Backend | `src/vibebet/api.ts` (+ new `src/vibebet/snapshot.ts`, `src/vibebet/events.ts`), minimal hooks in `vibebet.ts`/`state.ts`/`chips.ts` |

Screen specs are in sections 6-13 of the product spec; screenshots define layout for Room, Chips, Host, Result.
