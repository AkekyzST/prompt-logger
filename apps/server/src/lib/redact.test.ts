import { describe, expect, it } from 'vitest';
import { redact } from './redact.js';

/**
 * Table-driven tests for the redaction pipeline. Each pattern category has at
 * least one positive case (secret present → redacted) and one negative case
 * (similar-looking but legitimate text → untouched).
 */

interface Case {
  name: string;
  input: string;
  expectContent?: string;
  expectContains?: string[];
  expectMissing?: string[];
  expectTypes?: Record<string, number>;
  opts?: Parameters<typeof redact>[1];
}

const POSITIVE_CASES: Case[] = [
  {
    name: 'redacts Anthropic key (sk-ant-)',
    input: 'token sk-ant-api03-abcDEF123456_ghiJKLmnoPQR-stuVWXyz rest',
    expectContains: ['[REDACTED:ai-key]'],
    expectMissing: ['sk-ant-api03'],
    expectTypes: { 'ai-key': 1 },
  },
  {
    name: 'redacts OpenAI key (sk-)',
    input: 'OPENAI=sk-proj-abcDEF123456ghiJKLmnoPQRstuVWXyz0123',
    expectContains: ['[REDACTED:ai-key]'],
    expectMissing: ['sk-proj'],
    expectTypes: { 'ai-key': 1 },
  },
  {
    name: 'redacts GitHub personal access token (ghp_)',
    input: 'export GH=ghp_0123456789abcdefABCDEF0123456789abcd',
    expectContains: ['[REDACTED:github-token]'],
    expectMissing: ['ghp_0123'],
    expectTypes: { 'github-token': 1 },
  },
  {
    name: 'redacts AWS access key (AKIA)',
    input: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE and more',
    expectContains: ['[REDACTED:aws-key]'],
    expectMissing: ['AKIAIOSFODNN7EXAMPLE'],
    expectTypes: { 'aws-key': 1 },
  },
  {
    name: 'redacts Slack bot token (xoxb-)',
    // Intentionally fake fixture — contains "EXAMPLE" so secret scanners skip
    // it, but still matches the Slack-token regex /\bxox[baprso]-[A-Za-z0-9-]{10,}/.
    input: 'slack xoxb-EXAMPLE-EXAMPLE-EXAMPLEfixturefake here',
    expectContains: ['[REDACTED:slack-token]'],
    expectMissing: ['xoxb-EXAMPLE'],
    expectTypes: { 'slack-token': 1 },
  },
  {
    name: 'redacts JWT',
    input:
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9FYR50DAVcWiU',
    expectContains: ['[REDACTED:jwt]'],
    expectMissing: ['eyJhbGciOiJIUzI1NiJ9'],
    expectTypes: { jwt: 1 },
  },
  {
    name: 'redacts PEM private key block across multiple lines',
    input: [
      'before',
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEpAIBAAKCAQEA1234567890abcdef',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ+/==',
      '-----END RSA PRIVATE KEY-----',
      'after',
    ].join('\n'),
    expectContains: ['[REDACTED:private-key]', 'before', 'after'],
    expectMissing: ['MIIEpAIBAAKCAQEA', 'BEGIN RSA'],
    expectTypes: { 'private-key': 1 },
  },
  {
    name: 'redacts .env-style block (>=2 adjacent env lines)',
    input: ['FOO=bar', 'SECRET_KEY=s3cretV4lue', 'DB_URL=postgres://x'].join('\n'),
    expectContains: ['FOO=[REDACTED:env-var]', 'SECRET_KEY=[REDACTED:env-var]'],
    expectMissing: ['s3cretV4lue', 'postgres://x'],
    expectTypes: { 'env-var': 3 },
  },
  {
    name: 'opt-in email redaction',
    input: 'contact: alice@example.com please',
    opts: { redactEmails: true },
    expectContains: ['[REDACTED:email]'],
    expectMissing: ['alice@example.com'],
    expectTypes: { email: 1 },
  },
  {
    name: 'applies custom extra pattern',
    input: 'internal token INT_ABCDEF0123456789ABCDEF0123456789AB in log',
    opts: {
      extraPatterns: [
        { name: 'internal-token', regex: 'INT_[A-Z0-9]{32}', replace: '[REDACTED:internal]' },
      ],
    },
    expectContains: ['[REDACTED:internal]'],
    expectMissing: ['INT_ABCDEF'],
    expectTypes: { 'internal-token': 1 },
  },
  {
    name: 'handles multiple different secret types in one input',
    input:
      'sk-ant-abcDEF123456_ghiJKLmnoPQRstuVWXyz and ghp_0123456789abcdefABCDEF0123456789abcd and AKIAIOSFODNN7EXAMPLE',
    expectContains: ['[REDACTED:ai-key]', '[REDACTED:github-token]', '[REDACTED:aws-key]'],
    expectTypes: { 'ai-key': 1, 'github-token': 1, 'aws-key': 1 },
  },
];

const NEGATIVE_CASES: Case[] = [
  {
    name: 'empty string returns empty, no redactions',
    input: '',
    expectContent: '',
    expectTypes: {},
  },
  {
    name: 'ordinary prose is untouched',
    input: 'This is a normal sentence about programming and databases.',
    expectContent: 'This is a normal sentence about programming and databases.',
    expectTypes: {},
  },
  {
    name: 'does not mangle normal code mentioning sk (no hyphen prefix match)',
    input: 'let sk = "skateboard"; // sk is short',
    expectContent: 'let sk = "skateboard"; // sk is short',
    expectTypes: {},
  },
  {
    name: 'does not redact a single standalone KEY=value line (not a block)',
    input: 'const message = "HELLO=world"; // just one',
    expectContent: 'const message = "HELLO=world"; // just one',
    expectTypes: {},
  },
  {
    name: 'does not redact ghp_ with wrong length',
    input: 'ghp_tooShort not a real token',
    expectContent: 'ghp_tooShort not a real token',
    expectTypes: {},
  },
  {
    name: 'does not redact emails when opt-out (default)',
    input: 'contact: alice@example.com please',
    expectContains: ['alice@example.com'],
    expectMissing: ['[REDACTED:email]'],
    expectTypes: {},
  },
  {
    name: 'does not redact AKIA-like 19-char string',
    input: 'AKIAIOSFODNN7EXAMPL not long enough',
    expectContent: 'AKIAIOSFODNN7EXAMPL not long enough',
    expectTypes: {},
  },
];

function typeMap(hits: Array<{ type: string; count: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of hits) out[h.type] = h.count;
  return out;
}

describe('redact — positive cases', () => {
  for (const tc of POSITIVE_CASES) {
    it(tc.name, () => {
      const result = redact(tc.input, tc.opts);
      if (tc.expectContent !== undefined) {
        expect(result.content).toBe(tc.expectContent);
      }
      for (const s of tc.expectContains ?? []) {
        expect(result.content).toContain(s);
      }
      for (const s of tc.expectMissing ?? []) {
        expect(result.content).not.toContain(s);
      }
      if (tc.expectTypes) {
        expect(typeMap(result.redactions)).toEqual(tc.expectTypes);
      }
    });
  }
});

describe('redact — negative cases', () => {
  for (const tc of NEGATIVE_CASES) {
    it(tc.name, () => {
      const result = redact(tc.input, tc.opts);
      if (tc.expectContent !== undefined) {
        expect(result.content).toBe(tc.expectContent);
      }
      for (const s of tc.expectContains ?? []) {
        expect(result.content).toContain(s);
      }
      for (const s of tc.expectMissing ?? []) {
        expect(result.content).not.toContain(s);
      }
      if (tc.expectTypes) {
        expect(typeMap(result.redactions)).toEqual(tc.expectTypes);
      }
    });
  }
});

describe('redact — purity', () => {
  it('is deterministic for the same input and options', () => {
    const input = 'sk-ant-abcDEF123456_ghiJKLmnoPQRstuVWXyz and alice@example.com';
    const a = redact(input, { redactEmails: true });
    const b = redact(input, { redactEmails: true });
    expect(a).toEqual(b);
  });

  it('does not mutate the input string', () => {
    const input = 'ghp_0123456789abcdefABCDEF0123456789abcd';
    const before = input;
    redact(input);
    expect(input).toBe(before);
  });
});
