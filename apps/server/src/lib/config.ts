import { z } from 'zod';

/**
 * Environment variable schema. Parsed once at boot; invalid config causes the
 * process to exit with code 1 and a single structured error line.
 */
const booleanFromString = z.union([z.boolean(), z.string()]).transform((v) => {
  if (typeof v === 'boolean') return v;
  const s = v.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
});

const csvToArray = z.string().transform((s) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
);

const redactionExtraPatternsSchema = z
  .array(
    z.object({
      name: z.string().min(1),
      regex: z.string().min(1),
      replace: z.string(),
    })
  )
  .default([]);

const rawSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  PUBLIC_BASE_URL: z.string().url(),
  DATABASE_PATH: z.string().min(1),

  INGEST_TOKEN: z.string().min(16, 'INGEST_TOKEN must be at least 16 characters'),
  INGEST_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),
  INGEST_MAX_BODY_KB: z.coerce.number().int().positive().default(256),

  OIDC_ISSUER: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  OIDC_REDIRECT_URI: z.string().url(),
  OIDC_SCOPES: z.string().default('openid profile email'),

  ADMIN_EMAILS: csvToArray,

  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SESSION_COOKIE_NAME: z.string().min(1).default('pl_sess'),

  REDACTION_EXTRA_PATTERNS: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s || s.trim() === '') return [];
      try {
        const parsed: unknown = JSON.parse(s);
        return redactionExtraPatternsSchema.parse(parsed);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `REDACTION_EXTRA_PATTERNS is not valid JSON: ${(err as Error).message}`,
        });
        return z.NEVER;
      }
    }),
  REDACTION_REDACT_EMAILS: booleanFromString.default(false),

  SSE_MAX_CONNECTIONS: z.coerce.number().int().positive().default(500),
  SSE_HEARTBEAT_SECONDS: z.coerce.number().int().positive().default(15),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
});

export type Config = z.infer<typeof rawSchema>;

function loadConfig(): Config {
  const parsed = rawSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    // One structured error line to stderr — matches logger JSON shape.
    const line = JSON.stringify({
      level: 'fatal',
      time: new Date().toISOString(),
      msg: 'invalid configuration',
      issues,
    });
    process.stderr.write(`${line}\n`);
    process.exit(1);
  }
  return parsed.data;
}

export const config: Config = loadConfig();
