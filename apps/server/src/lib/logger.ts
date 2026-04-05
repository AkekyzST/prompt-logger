import { pino } from 'pino';
import { config } from './config.js';

/**
 * Structured JSON logger to stdout. The 'pretty' format is intentionally
 * implemented as plain JSON here as well — we do not pull in pino-pretty to
 * keep runtime deps minimal. Operators who want pretty logs can pipe stdout
 * through `pino-pretty` or `jq` themselves.
 */
export const logger = pino({
  level: config.LOG_LEVEL,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});
