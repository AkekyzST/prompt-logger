/**
 * Secret redaction pipeline — pure, server-side only.
 *
 * This module is the single source of truth for prompt redaction. It is
 * intentionally pure: no I/O, no global state, no logger side effects. The
 * only inputs are the string to redact and an options bag; the only output is
 * the redacted string plus a per-type hit count.
 *
 * Redaction is documented as **best-effort defense-in-depth**, not a
 * guarantee. See SECURITY.md and docs/ARCHITECTURE.md §9.
 *
 * Patterns are anchored to token prefixes wherever possible. We prefer false
 * negatives (missing a secret) over false positives (mangling normal code).
 */

export interface RedactionHit {
  type: string;
  count: number;
}

export interface RedactResult {
  content: string;
  redactions: RedactionHit[];
}

export interface ExtraPattern {
  name: string;
  regex: string;
  replace: string;
}

export interface RedactOptions {
  redactEmails?: boolean;
  extraPatterns?: ExtraPattern[];
}

interface PatternDef {
  type: string;
  regex: RegExp;
  replace: string;
}

/**
 * Built-in patterns. Order matters: earlier patterns run first. Multi-line
 * patterns (PEM, env blocks) should generally run before single-line ones so
 * their contents are replaced wholesale rather than token-by-token.
 */
const BUILTIN_PATTERNS: readonly PatternDef[] = [
  // PEM private key blocks — run first so env-var scanning inside the block
  // does not also match.
  {
    type: 'private-key',
    regex:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
    replace: '[REDACTED:private-key]',
  },

  // Anthropic keys — must run before the generic `sk-` OpenAI matcher so the
  // more specific prefix wins.
  {
    type: 'ai-key',
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
    replace: '[REDACTED:ai-key]',
  },
  // OpenAI-style `sk-` keys. Anchored on `sk-` + a realistic length band.
  {
    type: 'ai-key',
    regex: /\bsk-(?!ant-)[A-Za-z0-9_-]{20,}/g,
    replace: '[REDACTED:ai-key]',
  },

  // GitHub tokens — prefixed, fixed-length 36-char body.
  {
    type: 'github-token',
    regex: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g,
    replace: '[REDACTED:github-token]',
  },

  // AWS access key IDs. 20 uppercase chars starting with AKIA / ASIA.
  {
    type: 'aws-key',
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replace: '[REDACTED:aws-key]',
  },

  // Slack tokens. xox[baprso]-...
  {
    type: 'slack-token',
    regex: /\bxox[baprso]-[A-Za-z0-9-]{10,}/g,
    replace: '[REDACTED:slack-token]',
  },

  // JWTs: three base64url-ish segments separated by dots, with the standard
  // `eyJ` header prefix.
  {
    type: 'jwt',
    regex: /\beyJ[A-Za-z0-9_-]+=*\.eyJ[A-Za-z0-9_-]+=*\.[A-Za-z0-9_-]+=*\b/g,
    replace: '[REDACTED:jwt]',
  },
];

/**
 * Env-var block detection.
 *
 * We do NOT redact bare `KEY=value` lines globally — that would mangle
 * legitimate code (e.g. `const x = 1`, shell `export FOO=bar`). Instead we
 * look for runs of two or more adjacent lines that match the `.env` shape
 * (`[A-Z_][A-Z0-9_]* = <non-whitespace>`) and only redact inside those runs.
 */
const ENV_LINE = /^([A-Z_][A-Z0-9_]*)\s*=\s*(\S.*)$/;

function redactEnvBlocks(input: string): { content: string; count: number } {
  const lines = input.split('\n');
  const matches: boolean[] = lines.map((l) => ENV_LINE.test(l));
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!matches[i]) continue;
    // Only redact if at least one neighbour (prev or next) is also an env line.
    const prev = i > 0 && matches[i - 1];
    const next = i < lines.length - 1 && matches[i + 1];
    if (prev || next) {
      const current = lines[i] ?? '';
      const m = current.match(ENV_LINE);
      if (m?.[1]) {
        lines[i] = `${m[1]}=[REDACTED:env-var]`;
        count += 1;
      }
    }
  }
  return { content: lines.join('\n'), count };
}

// Email addresses — opt-in via options.redactEmails. Intentionally simple.
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

function countMatches(input: string, regex: RegExp): number {
  // Fresh regex so we don't share `lastIndex` state across invocations.
  const r = new RegExp(regex.source, regex.flags);
  let n = 0;
  while (r.exec(input) !== null) {
    n += 1;
    if (!r.global) break;
  }
  return n;
}

function applyPattern(input: string, pattern: PatternDef): { content: string; count: number } {
  const count = countMatches(input, pattern.regex);
  if (count === 0) return { content: input, count: 0 };
  const r = new RegExp(pattern.regex.source, pattern.regex.flags);
  return { content: input.replace(r, pattern.replace), count };
}

function compileExtraPatterns(extras: ExtraPattern[] | undefined): PatternDef[] {
  if (!extras || extras.length === 0) return [];
  return extras.map((e) => ({
    type: e.name,
    // Extra patterns are user-supplied; we force the global flag so counting
    // and replacing behave consistently. Invalid regexes throw to the caller
    // (config validation should have caught them at boot).
    regex: new RegExp(e.regex, 'g'),
    replace: e.replace,
  }));
}

/**
 * Redact secrets from a string. Pure function: same input + options always
 * produce the same output.
 */
export function redact(input: string, opts: RedactOptions = {}): RedactResult {
  if (input === '') {
    return { content: '', redactions: [] };
  }

  const hits = new Map<string, number>();
  const bump = (type: string, n: number): void => {
    if (n <= 0) return;
    hits.set(type, (hits.get(type) ?? 0) + n);
  };

  let content = input;

  for (const pattern of BUILTIN_PATTERNS) {
    const out = applyPattern(content, pattern);
    content = out.content;
    bump(pattern.type, out.count);
  }

  // Env-var blocks (structural, not a single regex).
  const envOut = redactEnvBlocks(content);
  content = envOut.content;
  bump('env-var', envOut.count);

  // Extra user patterns run after built-ins so operators can layer on top.
  for (const pattern of compileExtraPatterns(opts.extraPatterns)) {
    const out = applyPattern(content, pattern);
    content = out.content;
    bump(pattern.type, out.count);
  }

  // Email redaction is opt-in and runs last so it cannot eat characters out of
  // a JWT or other structured token.
  if (opts.redactEmails) {
    const count = countMatches(content, EMAIL_REGEX);
    if (count > 0) {
      content = content.replace(
        new RegExp(EMAIL_REGEX.source, EMAIL_REGEX.flags),
        '[REDACTED:email]'
      );
      bump('email', count);
    }
  }

  const redactions: RedactionHit[] = [];
  for (const [type, count] of hits) {
    redactions.push({ type, count });
  }
  return { content, redactions };
}
