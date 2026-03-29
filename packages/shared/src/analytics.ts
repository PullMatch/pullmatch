import { randomUUID } from 'node:crypto';

export type AnalyticsEventName =
  | 'pr_received'
  | 'analysis_complete'
  | 'comment_posted'
  | 'analysis_skipped'
  | 'analysis_error'
  | 'installation_event';

export type AnalyticsValue = string | number | boolean | null | string[];

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  requestId?: string;
  properties?: Record<string, AnalyticsValue>;
}

export interface SerializedAnalyticsEvent {
  type: 'analytics';
  name: AnalyticsEventName;
  requestId?: string;
  timestamp: string;
  properties: Record<string, AnalyticsValue>;
}

export function createRequestId(): string {
  return randomUUID();
}

export function serializeAnalyticsEvent(event: AnalyticsEvent): SerializedAnalyticsEvent {
  return {
    type: 'analytics',
    name: event.name,
    requestId: event.requestId,
    timestamp: new Date().toISOString(),
    properties: event.properties ?? {},
  };
}

export function trackEvent(event: AnalyticsEvent): void {
  const serialized = serializeAnalyticsEvent(event);
  console.log(JSON.stringify(serialized));
}
