'use strict';

const INSERT_SQL = (table) =>
  `INSERT INTO ${table} (CATEGORY, RESULT_TYPE, EVENT_TIMESTAMP) VALUES (?, ?, TO_TIMESTAMP_TZ(?))`;
const IDENTIFIER_PART = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const EVENT_VALUE = /^[A-Za-z][A-Za-z0-9_:-]{0,63}$/;

/** Return a UTC timestamp in the representation accepted by TO_TIMESTAMP_TZ. */
function normalizeTimestamp(value) {
  const date = value === undefined ? new Date() : value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('event.timestamp must be a valid date or ISO timestamp');
  }
  return date.toISOString();
}

/**
 * Copies only the three permitted fields. Category and resultType are intended
 * to be machine-readable labels, never user-provided text or identifiers.
 */
function normalizeEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('analytics event must be an object');
  }
  if (typeof event.category !== 'string' || !EVENT_VALUE.test(event.category)) {
    throw new TypeError('event.category must be a short machine-readable label');
  }
  if (typeof event.resultType !== 'string' || !EVENT_VALUE.test(event.resultType)) {
    throw new TypeError('event.resultType must be a short machine-readable label');
  }
  return {
    category: event.category,
    resultType: event.resultType,
    timestamp: normalizeTimestamp(event.timestamp),
  };
}

/** Accept only simple unquoted Snowflake identifiers; never interpolate values. */
function normalizeTable(table) {
  if (typeof table !== 'string' || !table) {
    throw new TypeError('table must be supplied as TABLE, SCHEMA.TABLE, or DATABASE.SCHEMA.TABLE');
  }
  const parts = table.split('.');
  if (parts.length > 3 || parts.some((part) => !IDENTIFIER_PART.test(part))) {
    throw new TypeError('table must contain one to three simple Snowflake identifiers');
  }
  return parts.join('.');
}

function callWithCallback(invoke, operation) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const complete = (error, ...values) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(values);
    };
    try {
      invoke(complete);
    } catch (error) {
      complete(error);
    }
  }).catch((error) => {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${operation}: ${detail}`);
  });
}

function destroyQuietly(connection) {
  if (!connection || typeof connection.destroy !== 'function') return Promise.resolve();
  return callWithCallback((complete) => connection.destroy(complete), 'Snowflake disconnect').catch(() => {});
}

/** A disabled sink with the same lifecycle surface as the Snowflake sink. */
function createNoopAnalyticsSink() {
  return Object.freeze({
    track: async () => {},
    flush: async () => {},
    close: async () => {},
  });
}

/**
 * Create a best-effort, bounded, asynchronous Snowflake sink.
 *
 * `driver` is the object exported by snowflake-sdk (injected so the SDK remains
 * an optional dependency). `connectionOptions` are passed to createConnection.
 * Track never waits for Snowflake; call flush/close during graceful shutdown.
 */
function createSnowflakeAnalyticsSink(options = {}) {
  const {
    driver,
    connectionOptions,
    table,
    maxPendingEvents = 256,
    onError,
  } = options;
  const destination = normalizeTable(table);
  if (!driver || typeof driver.createConnection !== 'function') {
    throw new TypeError('driver must expose snowflake-sdk createConnection(options)');
  }
  if (!connectionOptions || typeof connectionOptions !== 'object' || Array.isArray(connectionOptions)) {
    throw new TypeError('connectionOptions must be a Snowflake connection options object');
  }
  if (!Number.isInteger(maxPendingEvents) || maxPendingEvents < 1) {
    throw new TypeError('maxPendingEvents must be a positive integer');
  }

  let connectionPromise;
  let pending = Promise.resolve();
  let pendingCount = 0;
  let closed = false;
  let closePromise;

  function report(error) {
    if (typeof onError === 'function') {
      try {
        onError(error);
      } catch (_) {
        // Analytics must not turn an error reporter failure into a chat failure.
      }
    }
  }

  function getConnection() {
    if (!connectionPromise) {
      let connection;
      try {
        connection = driver.createConnection({ ...connectionOptions });
      } catch (error) {
        return Promise.reject(error);
      }
      const opening = callWithCallback((complete) => connection.connect(complete), 'Snowflake connect')
        .then(() => connection)
        .catch((error) => {
          if (connectionPromise === opening) connectionPromise = undefined;
          void destroyQuietly(connection);
          throw error;
        });
      connectionPromise = opening;
    }
    return connectionPromise;
  }

  async function insert(event) {
    const connection = await getConnection();
    try {
      await callWithCallback(
        (complete) => connection.execute({
          sqlText: INSERT_SQL(destination),
          binds: [event.category, event.resultType, event.timestamp],
          complete,
        }),
        'Snowflake insert',
      );
    } catch (error) {
      if (connectionPromise) {
        const current = await connectionPromise.catch(() => undefined);
        if (current === connection) connectionPromise = undefined;
      }
      void destroyQuietly(connection);
      throw error;
    }
  }

  function track(event) {
    if (closed) {
      report(new Error('Analytics sink is closed'));
      return Promise.resolve();
    }

    let safeEvent;
    try {
      safeEvent = normalizeEvent(event);
    } catch (error) {
      report(error);
      return Promise.resolve();
    }

    if (pendingCount >= maxPendingEvents) {
      report(new Error('Analytics queue is full; event dropped'));
      return Promise.resolve();
    }

    pendingCount += 1;
    pending = pending
      .then(() => insert(safeEvent))
      .catch(report)
      .finally(() => {
        pendingCount -= 1;
      });
    return Promise.resolve();
  }

  function flush() {
    return pending;
  }

  function close() {
    if (!closePromise) {
      closed = true;
      closePromise = flush().then(async () => {
        if (connectionPromise) {
          const connection = await connectionPromise.catch(() => undefined);
          connectionPromise = undefined;
          await destroyQuietly(connection);
        }
      });
    }
    return closePromise;
  }

  return Object.freeze({ track, flush, close });
}

/** Select no-op unless explicitly enabled; no SDK import or connection is made here. */
function createAnalyticsSink({ enabled = false, snowflake } = {}) {
  if (enabled !== true) return createNoopAnalyticsSink();
  try {
    return createSnowflakeAnalyticsSink(snowflake);
  } catch (error) {
    if (snowflake && typeof snowflake.onError === 'function') {
      try {
        snowflake.onError(error);
      } catch (_) {
        // Optional analytics setup must not prevent the chat service from starting.
      }
    }
    return createNoopAnalyticsSink();
  }
}

export {
  createAnalyticsSink,
  createNoopAnalyticsSink,
  createSnowflakeAnalyticsSink,
};
