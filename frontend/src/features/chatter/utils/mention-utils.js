/**
 * @param {Array<{ id: string, fullName: string }>} users
 * @returns {string[]}
 */
export function parseMentionUserIdsFromMessage(message, users) {
  const text = message ?? '';
  const sorted = [...(users ?? [])].sort(
    (a, b) => (b.fullName?.length ?? 0) - (a.fullName?.length ?? 0),
  );
  const found = [];
  const seen = new Set();
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '@') {
      i += 1;
      continue;
    }
    const rest = text.slice(i + 1);
    let matched = null;
    for (const user of sorted) {
      const name = String(user.fullName ?? '').trim();
      if (!name) continue;
      const lowerRest = rest.toLowerCase();
      const lowerName = name.toLowerCase();
      if (!lowerRest.startsWith(lowerName)) continue;
      const nextChar = rest[name.length];
      if (!nextChar || /[\s.,!?;:\n]/.test(nextChar)) {
        matched = user;
        break;
      }
    }
    if (matched?.id && !seen.has(matched.id)) {
      seen.add(matched.id);
      found.push(matched.id);
      i += 1 + String(matched.fullName).trim().length;
    } else {
      i += 1;
    }
  }
  return found;
}

/**
 * @param {Array<{ id: string, fullName: string }>} users
 */
export function buildMentionUserMap(users) {
  const map = new Map();
  for (const u of users ?? []) {
    if (u?.id && u?.fullName) map.set(u.id, u);
    const key = String(u.fullName ?? '').trim().toLowerCase();
    if (key) map.set(key, u);
  }
  return map;
}

/**
 * Highlight @mentions; link to designer profile when user id is known.
 * @param {Array<{ id: string, fullName: string }>} users
 */
export function formatMessageHtml(message, users = []) {
  const sorted = [...users].sort(
    (a, b) => (b.fullName?.length ?? 0) - (a.fullName?.length ?? 0),
  );
  let html = (message ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const replacements = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] !== '@') {
      i += 1;
      continue;
    }
    const rest = html.slice(i + 1);
    let matched = null;
    for (const user of sorted) {
      const name = String(user.fullName ?? '').trim();
      if (!name) continue;
      const escapedName = name
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (!rest.startsWith(escapedName)) continue;
      const nextChar = rest[escapedName.length];
      if (!nextChar || /[\s.,!?;:\n]/.test(nextChar)) {
        matched = { user, name: escapedName, len: 1 + escapedName.length };
        break;
      }
    }
    if (matched) {
      const href = `/designer/${matched.user.id}/requests`;
      replacements.push({
        start: i,
        end: i + matched.len,
        html: `<a href="${href}" class="font-semibold text-blue-600 hover:underline" data-mention-user="${matched.user.id}">@${matched.name}</a>`,
      });
      i += matched.len;
    } else {
      i += 1;
    }
  }

  if (replacements.length === 0) {
    return html
      .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
      .replace(/~~(.+?)~~/gs, '<del>$1</del>')
      .replace(/__(.+?)__/gs, '<u>$1</u>')
      .replace(/\*(.+?)\*/gs, '<em>$1</em>')
      .replace(/\n/g, '<br />');
  }

  let out = '';
  let cursor = 0;
  for (const rep of replacements) {
    out += html.slice(cursor, rep.start);
    out += rep.html;
    cursor = rep.end;
  }
  out += html.slice(cursor);

  return out
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/gs, '<del>$1</del>')
    .replace(/__(.+?)__/gs, '<u>$1</u>')
    .replace(/\*(.+?)\*/gs, '<em>$1</em>')
    .replace(/\n/g, '<br />');
}
