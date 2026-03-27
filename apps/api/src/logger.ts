const isProduction = process.env.NODE_ENV === 'production';

interface LogEntry {
  level: string;
  msg: string;
  [key: string]: unknown;
}

function formatLog(entry: LogEntry): string {
  if (isProduction) {
    return JSON.stringify(entry);
  }
  const { level, msg, ...extra } = entry;
  const extraStr = Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : '';
  return `[${level}] ${msg}${extraStr}`;
}

export const logger = {
  info(msg: string, extra: Record<string, unknown> = {}) {
    console.log(formatLog({ level: 'info', msg, ...extra }));
  },
  warn(msg: string, extra: Record<string, unknown> = {}) {
    console.warn(formatLog({ level: 'warn', msg, ...extra }));
  },
  error(msg: string, extra: Record<string, unknown> = {}) {
    console.error(formatLog({ level: 'error', msg, ...extra }));
  },
};
