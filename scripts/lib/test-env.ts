// Shared test harness utilities.
//
// Why this exists: the embedded-Postgres / app harnesses previously pinned fixed ports
// (54398-54403, 4597-4599). When a prior run or a stray process still held one of those
// ports, the next run hung or crashed non-deterministically. We now ask the OS for an
// ephemeral free port, and every harness installs a hard wall-clock timeout that forces
// process exit so a hung server/pool/embedded-PG can never hang CI forever.
import { createServer } from 'node:net';

/** Ask the OS for an ephemeral free TCP port bound to loopback, then release it. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

/**
 * Hard backstop: force-exit after `ms`. The timer is unref'd so a clean run exits on its
 * own without waiting; if a hung server/pool/embedded-PG keeps the loop alive, the timer
 * still fires and we exit non-zero instead of hanging.
 */
export function hardTimeout(ms: number, label = 'test'): void {
  setTimeout(() => {
    console.error(`[FATAL][${label}] exceeded ${ms}ms hard timeout; forcing exit`);
    process.exit(2);
  }, ms).unref();
}
