import { EventEmitter } from 'node:events';

/**
 * Per-session in-memory event emitters.
 *
 * The ingest path calls `broadcast(sessionId, 'prompt', payload)` after a
 * successful insert; the SSE stream route subscribes via
 * `getOrCreateEmitter(sessionId).on('prompt', ...)`.
 *
 * Access checks happen at subscribe time only — the broadcast path does not
 * re-check ACLs. See CLAUDE.md "Access control" and docs/ARCHITECTURE.md §10.
 *
 * Single-process only by design.
 */

const emitters = new Map<string, EventEmitter>();

export function getOrCreateEmitter(sessionId: string): EventEmitter {
  let e = emitters.get(sessionId);
  if (!e) {
    e = new EventEmitter();
    e.setMaxListeners(0); // unlimited — global cap enforced at SSE route level
    emitters.set(sessionId, e);
  }
  return e;
}

export function removeEmitter(sessionId: string): void {
  const e = emitters.get(sessionId);
  if (e) {
    e.removeAllListeners();
    emitters.delete(sessionId);
  }
}

export function broadcast<T>(sessionId: string, event: string, data: T): void {
  const e = emitters.get(sessionId);
  if (!e) return;
  e.emit(event, data);
}

/** Exposed for tests. */
export function _emittersForTest(): Map<string, EventEmitter> {
  return emitters;
}
