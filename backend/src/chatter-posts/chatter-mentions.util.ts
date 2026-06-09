const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function optionalUuid(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export function uniqueUuids(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = optionalUuid(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export type MentionUserRef = { id: string; fullName: string };

/** Parse @Full Name tokens from message text against a user directory. */
export function parseMentionUserIdsFromMessage(
  message: string,
  users: MentionUserRef[],
): string[] {
  const text = message ?? '';
  const found: string[] = [];
  const pattern = /@([A-Za-z][A-Za-z0-9._\s-]{1,80})/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const needle = match[1].trim().toLowerCase();
    if (!needle) continue;
    const user = users.find((u) => {
      const name = u.fullName.trim().toLowerCase();
      return name === needle || name.startsWith(`${needle} `) || needle.startsWith(name);
    });
    if (user) found.push(user.id);
  }
  return uniqueUuids(found);
}

/** Monday 00:00:00.000 — Sunday 23:59:59.999 UTC for the week containing `dateStr` (YYYY-MM-DD). */
export function weekRangeContaining(dateStr: string): { start: Date; end: Date } | null {
  const parts = dateStr.trim().split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [yyyy, mm, dd] = parts;
  const anchor = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0, 0));
  if (Number.isNaN(anchor.getTime())) return null;
  const day = anchor.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(yyyy, mm - 1, dd + mondayOffset, 0, 0, 0, 0));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

export function resolveTaskOpNo(opNo?: string | null, taskNo?: string | null): string | null {
  const op = opNo?.trim();
  if (op) return op;
  const no = taskNo?.trim() ?? '';
  if (no && !/^TSK(?:[\s-]|$)/i.test(no)) return no;
  return no || null;
}

export function resolveProjectNo(projectNo?: string | null): string | null {
  const no = projectNo?.trim();
  return no || null;
}
