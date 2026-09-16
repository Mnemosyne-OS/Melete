/**
 * log.ts — one tagged logger, so a session can be read back afterwards.
 *
 * A cartridge runs in an iframe: its console is the one in that frame's
 * devtools, and nothing about it reaches the host's main log. So the value of a
 * line here is entirely in whether it lets somebody answer a question they
 * could not otherwise answer — "why is this text short?", "did the vault take
 * the passages?", "which route generated this?".
 *
 * 🎭 The rule every call obeys: log MEASURED facts, not intentions. `starting
 * import` tells you nothing an hour later; `read 41320 chars as cp1252, cut to
 * 24000 kept` tells you exactly what happened. Never log a value the code has
 * not actually computed.
 *
 * ⛔ Never log the course TEXT itself, or a quote from it. A student's course
 * can be their medical notes; the console is a place people paste from.
 */

const TAG = '[melete]';

/** Timestamps are relative to load: absolute clock times say nothing about how
 *  long a step took, which is the only thing anyone reads a log for here. */
const started = Date.now();

function stamp(): string {
  const ms = Date.now() - started;
  return `+${(ms / 1000).toFixed(1)}s`;
}

export const log = {
  info(scope: string, message: string, facts?: Record<string, unknown>): void {
    console.log(`${TAG} ${stamp()} ${scope}: ${message}`, facts ?? '');
  },
  /** Something degraded but the session continues — the honest-degradation paths. */
  warn(scope: string, message: string, facts?: Record<string, unknown>): void {
    console.warn(`${TAG} ${stamp()} ${scope}: ${message}`, facts ?? '');
  },
  /** Something the user will see fail. */
  error(scope: string, message: string, facts?: Record<string, unknown>): void {
    console.error(`${TAG} ${stamp()} ${scope}: ${message}`, facts ?? '');
  },
};
