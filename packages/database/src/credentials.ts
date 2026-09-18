/**
 * Password rotation support.
 *
 * In AWS the database password rotates monthly, but ECS injects it only when a task starts.
 * Connections that are already open keep working after a rotation; the first *new* connection
 * fails with "access denied". At that point the process shuts itself down gracefully, and ECS
 * starts a replacement task that receives the new password. Nothing is lost: the vote worker
 * only acknowledges queue messages after they are committed, so in-flight ballots are redelivered.
 */

const ACCESS_DENIED_CODES = new Set(['ER_ACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR']);
const ACCESS_DENIED_ERRNOS = new Set([1045, 1044]);

/** True when MySQL rejected the credentials (also when wrapped by TypeORM as `driverError`). */
export function isAccessDeniedError(error: unknown): boolean {
  for (let e = error as Record<string, unknown> | undefined, depth = 0; e && depth < 3; depth++) {
    if (ACCESS_DENIED_CODES.has(e.code as string) || ACCESS_DENIED_ERRNOS.has(e.errno as number)) return true;
    e = (e.driverError ?? e.cause) as Record<string, unknown> | undefined;
  }
  return false;
}

let restarting = false;

/**
 * If `error` means the credentials are no longer valid, starts a graceful shutdown (SIGTERM, so
 * Nest's shutdown hooks run) and returns true. The orchestrator restarts the task with fresh
 * credentials. Safe to call from many places; the shutdown is triggered once.
 */
export function restartOnRotatedCredentials(
  error: unknown,
  log: (message: string) => void = console.error,
): boolean {
  if (!isAccessDeniedError(error)) return false;
  if (!restarting) {
    restarting = true;
    log('Database rejected the credentials (password rotated?). Shutting down to restart with the current secret.');
    process.kill(process.pid, 'SIGTERM');
  }
  return true;
}
