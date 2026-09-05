/**
 * Logs must never include user-level payload content (docs/SPEC.md §9) — only
 * session-id, a short event description, and a timestamp.
 */
export function logEvent(sessionId: string, event: string): void {
  console.log(
    JSON.stringify({
      session_id: sessionId,
      event,
      timestamp: new Date().toISOString(),
    }),
  );
}
