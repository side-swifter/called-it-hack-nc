# Hackathon finance iMessage agent

The first vertical slice uses iMessage as the product interface. It responds to balance and recent-spending questions with seeded demo data by default. There is no end-user login and no money movement.

## Run locally on server1

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and add Photon Spectrum project credentials. Keep `.env` private; it is ignored by Git.
3. Start the agent with `npm run dev`.
4. Message the Photon-managed iMessage line. By default, the agent responds only in direct messages. Set `IMESSAGE_ALLOW_GROUP_CHAT=true` to allow replies in existing group chats; do that only for the fake/demo dataset.

The mock finance provider is the default. To opt into the Nessie sandbox, set `FINANCE_PROVIDER=nessie`, `NESSIE_API_KEY`, and `NESSIE_CUSTOMER_ID`. The adapter only reads accounts and purchases.

Snowflake analytics is optional and disabled by default. The message response does not wait for analytics. Configure the Snowflake variables in `.env` and set `SNOWFLAKE_ANALYTICS_ENABLED=true` only after creating the destination table and confirming account credentials.

## Commands

- `npm run dev` — run with file watching
- `npm test` — unit tests
- `npm run typecheck` — TypeScript check
- `npm run build` — compile to `dist/`
- `npm start` — run the compiled app
