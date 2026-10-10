export type AnalyticsEvent = {
  category: string;
  resultType: string;
  timestamp?: Date | string;
};

export interface AnalyticsSink {
  track(event: AnalyticsEvent): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export type SnowflakeAnalyticsOptions = {
  driver: unknown;
  connectionOptions: Record<string, unknown>;
  table: string;
  maxPendingEvents?: number;
  onError?: (error: unknown) => void;
};

export declare function createNoopAnalyticsSink(): AnalyticsSink;
export declare function createSnowflakeAnalyticsSink(
  options: SnowflakeAnalyticsOptions,
): AnalyticsSink;
export declare function createAnalyticsSink(options?: {
  enabled?: boolean;
  snowflake?: SnowflakeAnalyticsOptions;
}): AnalyticsSink;
