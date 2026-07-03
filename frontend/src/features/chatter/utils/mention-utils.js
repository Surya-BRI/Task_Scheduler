import DOMPurify from 'isomorphic-dompurify';

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
 * @returns {Array<{ id: string, fullName: string }>}
 */
export function parseMentionedUsersFromMessage(message, users) {
  const ids = parseMentionUserIdsFromMessage(message, users);
  const byId = new Map(
    (users ?? []).filter((u) => u?.id).map((u) => [u.id, u]),
  );
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * @param {Array<Array<{ id: string, fullName: string }>>} lists
 * @returns {Array<{ id: string, fullName: string }>}
 */
export function mergeMentionUsers(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const user of list ?? []) {
      if (!user?.id) continue;
      const fullName = String(user.fullName ?? '').trim();
      if (!fullName) continue;
      map.set(user.id, { id: user.id, fullName });
    }
  }
  return [...map.values()];
}

/**
 * Build the user directory needed to render every @mention in a post/comment.
 * @param {Array<{ id: string, fullName: string }>} mentionedUsers
 * @param {Array<{ id: string, fullName: string }>} directory
 */
export function resolveMentionUsersForDisplay(message, mentionedUsers = [], directory = []) {
  const merged = mergeMentionUsers(directory, mentionedUsers);
  const parsed = parseMentionedUsersFromMessage(message, merged);
  return mergeMentionUsers(merged, mentionedUsers, parsed);
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
 * Apply lightweight markdown-style formatting to already HTML-escaped text.
 */
export function applyChatterRichTextFormatting(text) {
  return String(text ?? '')
    .replace(/\*\*\*(.+?)\*\*\*/gs, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/gs, '<del>$1</del>')
    .replace(/__(.+?)__/gs, '<u>$1</u>')
    .replace(/\*(.+?)\*/gs, '<em>$1</em>')
    .replace(/\n/g, '<br />');
}

/**
 * Highlight @mentions; link to designer profile when user id is known.
 * @param {Array<{ id: string, fullName: string }>} users
 * @param {{ linkMentions?: boolean }} [options]
 */
const CHATTER_HTML_CONFIG = {
  ALLOWED_TAGS: ['a', 'strong', 'em', 'del', 'u', 'br', 'span'],
  ALLOWED_ATTR: ['href', 'class', 'data-mention-user'],
};

export function sanitizeChatterHtml(html) {
  return DOMPurify.sanitize(String(html ?? ''), CHATTER_HTML_CONFIG);
}

export function formatMessageHtml(message, users = [], options = {}) {
  const { linkMentions = true } = options;
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
      const mentionHtml = linkMentions
        ? `<a href="/designer/${matched.user.id}/requests" class="font-semibold text-blue-600 hover:underline" data-mention-user="${matched.user.id}">@${matched.name}</a>`
        : `<span class="font-semibold text-blue-600">@${matched.name}</span>`;
      replacements.push({
        start: i,
        end: i + matched.len,
        html: mentionHtml,
      });
      i += matched.len;
    } else {
      i += 1;
    }
  }

  if (replacements.length === 0) {
    return sanitizeChatterHtml(applyChatterRichTextFormatting(html));
  }

  let out = '';
  let cursor = 0;
  for (const rep of replacements) {
    out += html.slice(cursor, rep.start);
    out += rep.html;
    cursor = rep.end;
  }
  out += html.slice(cursor);

  return sanitizeChatterHtml(applyChatterRichTextFormatting(out));
}
