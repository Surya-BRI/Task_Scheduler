// Task ids are still GUIDs (SchedulerTask/Task PKs were not migrated to bigint).
export function isUuidString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
  );
}

// User ids (designerId/requesterId/etc.) now point at ErpUser.userId, a bigint —
// validate a positive integer string instead of a GUID.
export function isPositiveIntegerString(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value.trim());
}
