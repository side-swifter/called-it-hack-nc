# Optional analytics sink

This module is isolated from the chat path and has no required runtime dependency. It never imports `snowflake-sdk`; Snowflake support is opt-in and injected by the caller. With analytics disabled, `createAnalyticsSink()` returns a no-op sink.

## Public API

CommonJS module exports from `src/integrations/analytics`:

- `createAnalyticsSink({ enabled = false, snowflake })`: returns a no-op sink unless `enabled === true`; when enabled, `snowflake` is passed to `createSnowflakeAnalyticsSink`. If enabled configuration is invalid, it reports the setup error to `snowflake.onError` when provided and returns a no-op sink instead of throwing.
- `createNoopAnalyticsSink()`: returns a sink with resolved `track(event)`, `flush()`, and `close()` methods.
- `createSnowflakeAnalyticsSink({ driver, connectionOptions, table, maxPendingEvents = 256, onError })`: returns the enabled sink. `driver` is the injected `snowflake-sdk` export; the sink uses its `createConnection(options)` API.

All sink methods return promises. `track(event)` validates and copies only `category`, `resultType`, and `timestamp`, then queues a bound insert and resolves without waiting for Snowflake. The bounded queue drops new events when full. `flush()` waits for queued work; `close()` stops accepting events, flushes, and disconnects. Connection establishment is lazy (on the first event). Connection/query/validation failures are reported to the optional `onError(error)` callback and swallowed so analytics failures do not become chat failures. The high-level factory also returns a no-op sink if enabled configuration is invalid. Do not log error details if your deployment's driver errors might contain sensitive connection information.

Events have this shape:

```js
{
  category: 'weather_intent', // short machine-readable label
  resultType: 'reply_sent',   // short machine-readable label
  timestamp: new Date(),     // optional; defaults to current time
}
```

`category` and `resultType` must match `[A-Za-z][A-Za-z0-9_:-]{0,63}`. Use only derived, non-sensitive labels (for example, an intent category and a result classification). Never pass iMessage text, phone/sender identifiers, API keys, or transaction/financial details. Extra event properties are ignored. The sink sends only these three values to Snowflake.

## Enabling Snowflake

1. In the application environment that enables the feature, install the optional `snowflake-sdk` package (for example, `npm install snowflake-sdk`). This repository integration does not change package manifests or load the package when disabled.
2. Create the destination table yourself and grant a service identity permission to insert into it. The sink does not create schemas/tables or issue setup queries. The destination must have `CATEGORY`, `RESULT_TYPE`, and `EVENT_TIMESTAMP` columns; a timestamp-with-time-zone column is recommended for `EVENT_TIMESTAMP`.
3. Set `SNOWFLAKE_ANALYTICS_ENABLED=true`, plus the connection values required by your chosen Snowflake authentication method. The password-auth example below reads `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USERNAME`, and `SNOWFLAKE_PASSWORD`. `SNOWFLAKE_ANALYTICS_TABLE` is required and must be a simple unquoted table name with one, two, or three identifier parts (for example, supplied by deployment as `TABLE`, `SCHEMA.TABLE`, or `DATABASE.SCHEMA.TABLE`). Optional connection values commonly include `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`, and `SNOWFLAKE_ROLE`. No account, database, schema, warehouse, role, or credentials are provided by this module.
4. Use a server/service identity; this module does not add end-user login or authentication. Other driver-supported auth options can be provided through `connectionOptions` instead of username/password.

Example application wiring (keep SDK loading inside the enabled branch):

```js
const {
  createAnalyticsSink,
} = require('./src/integrations/analytics');

const enabled = process.env.SNOWFLAKE_ANALYTICS_ENABLED === 'true';
let snowflake;
if (enabled) {
  try {
    snowflake = require('snowflake-sdk');
  } catch (error) {
    // Keep chat online if the optional package is absent.
    console.warn('Snowflake analytics disabled: snowflake-sdk is unavailable');
  }
}

const analytics = createAnalyticsSink({
  enabled: enabled && Boolean(snowflake),
  snowflake: enabled && snowflake ? {
    driver: snowflake,
    table: process.env.SNOWFLAKE_ANALYTICS_TABLE,
    connectionOptions: {
      account: process.env.SNOWFLAKE_ACCOUNT,
      username: process.env.SNOWFLAKE_USERNAME,
      password: process.env.SNOWFLAKE_PASSWORD,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE,
      database: process.env.SNOWFLAKE_DATABASE,
      schema: process.env.SNOWFLAKE_SCHEMA,
      role: process.env.SNOWFLAKE_ROLE,
    },
    onError: (error) => console.warn('Analytics event was not stored:', error.message),
  } : undefined,
});

// In the chat handler, do not await analytics before replying.
void analytics.track({ category: intentCategory, resultType: 'reply_sent' });

// During graceful server shutdown:
await analytics.close();
```

The adapter uses the driver's callback-based `createConnection`, `connect`, `execute`, and `destroy` APIs, with `?` bind parameters for event values. Table identifiers are strictly validated before being included in SQL; event values are never interpolated. See Snowflake's official [Node.js Driver](https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver), [Managing connections](https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-connect), [Executing statements](https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-execute), and [Authenticating connections](https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-authenticate) documentation.
