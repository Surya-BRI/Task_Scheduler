import { describe, it, expect } from 'vitest';
import {
  formatMessageHtml,
  parseMentionUserIdsFromMessage,
  sanitizeChatterHtml,
} from './mention-utils';

describe('mention-utils', () => {
  const users = [
    { id: 'u1', fullName: 'Alex Johnson' },
    { id: 'u2', fullName: 'Sam' },
  ];

  it('parses mention user ids from message text', () => {
    expect(parseMentionUserIdsFromMessage('Hey @Alex Johnson please review', users)).toEqual(['u1']);
    expect(parseMentionUserIdsFromMessage('Ping @Sam now', users)).toEqual(['u2']);
  });

  it('ignores partial name matches', () => {
    expect(parseMentionUserIdsFromMessage('@Alex Johnsonson', users)).toEqual([]);
  });

  it('strips script tags and event handlers', () => {
    const dirty = '<strong>Hi</strong><script>alert(1)</script><img src=x onerror=alert(1)>';
    const clean = sanitizeChatterHtml(dirty);
    expect(clean).toContain('<strong>Hi</strong>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onerror');
  });

  it('renders styled non-clickable mentions', () => {
    const html = formatMessageHtml('Hey @Alex Johnson please review', users);
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href=');
    expect(html).toContain('<span class="font-semibold text-blue-600"');
    expect(html).toContain('data-mention-user="u1"');
    expect(html).toContain('@Alex Johnson');
  });
});
