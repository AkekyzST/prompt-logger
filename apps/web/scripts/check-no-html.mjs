#!/usr/bin/env node
/**
 * CI guard: fails the build if `{@html …}` appears anywhere under
 * `apps/web/src`. Prompt content is user-supplied and must always be rendered
 * as escaped text to prevent XSS. Matches inside `//`, `/* … *\/`, or
 * `<!-- … -->` comments are ignored so the rule can be discussed in code.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', 'src');

/** @type {string[]} */
const offenders = [];

/** @param {string} dir */
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      walk(full);
      continue;
    }
    if (!/\.(svelte|ts|tsx|js|mjs)$/.test(entry)) continue;
    const source = readFileSync(full, 'utf8');
    // Strip JS/TS line + block comments and Svelte/HTML comments before
    // scanning so commented-out references to the pattern are allowed.
    const stripped = source
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    if (/\{@html\b/.test(stripped)) {
      offenders.push(full);
    }
  }
}

walk(ROOT);

if (offenders.length > 0) {
  console.error('check:no-html — found banned {@html} usage:');
  for (const f of offenders) console.error(`  ${f}`);
  console.error(
    '\nPrompt content must be rendered as escaped text. If you need raw HTML, add a server-side sanitizer first and document the exception.'
  );
  process.exit(1);
}

console.log('check:no-html — OK (0 occurrences under apps/web/src)');
