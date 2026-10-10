# Finance data integration

A mock-first, read-only finance slice for an iMessage-style message handler. No user login, account linking, or money movement is implemented here.

## Use from a message handler

```ts
import { createFinanceProvider } from "./integrations/finance";

const finance = createFinanceProvider(); // mock by default
const summary = await finance.getSummary();
// summary.totalBalance, summary.recentSpending, summary.recentPurchases, ...
```

`getSummary()` defaults to the last 30 days and returns up to five newest purchases. Callers can pass `{ asOf, windowDays, purchaseLimit }` for a controlled window. Shared result types are exported from `index.ts`.

## Optional Nessie sandbox

Select Nessie explicitly; it is never the default:

```sh
FINANCE_PROVIDER=nessie
NESSIE_API_KEY=...       # required; keep secret and out of source control
NESSIE_CUSTOMER_ID=...   # required; ID for the single seeded sandbox customer
# NESSIE_BASE_URL=https://api.nessieisreal.com  # optional override
```

The Nessie adapter performs only these documented GET requests:

- `GET /customers/{customerId}/accounts?key={apiKey}`
- `GET /accounts/{accountId}/purchases?key={apiKey}` (once per returned account)

The API key is sent using Nessie's documented `key` query parameter. Error messages omit request URLs, response bodies, and underlying fetch errors so they do not reveal the key. The adapter does not call POST, PUT, PATCH, or DELETE endpoints. Requests use native `fetch` unless an alternate fetch implementation is injected.

The official Nessie docs describe the API key query parameter and customer-owned endpoints at [Getting Started](https://nessieisreal.com/getting-started), and list Accounts and Purchases resources at [API Docs](https://nessieisreal.com/docs). Account and purchase paths follow the documented customer accounts and account purchases GET routes.

## Data assumptions

- The mock customer is the seeded demo persona `Alex Morgan (demo)`; it is not a login identity.
- Balances and purchase amounts are presented as USD. Nessie account resources do not consistently provide a currency field, so the adapter assumes USD for this sandbox.
- `totalBalance` is the arithmetic sum of account balances returned by the provider. It is not a net-worth/debt calculation.
- Recent spending sums nonnegative purchase amounts dated in the lookback window. Declined/cancelled purchases are excluded; purchases with other statuses (including pending) are included.
- The Nessie API key is necessarily present in its request query string, per the official docs. Do not enable HTTP URL logging upstream.

There is no shared package manifest, TypeScript configuration, or test setup in this empty repository, so this integration adds no test runner or dependencies. `createNessieFinanceProvider` also accepts injected `fetch` for future focused tests.
