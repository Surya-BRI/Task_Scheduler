import { sanitizeChatterHtml } from '../mention-utils';

describe('sanitizeChatterHtml', () => {
  it('strips script tags and event handlers', () => {
    const dirty = '<strong>Hi</strong><script>alert(1)</script><img src=x onerror=alert(1)>';
    const clean = sanitizeChatterHtml(dirty);
    expect(clean).toContain('<strong>Hi</strong>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onerror');
  });

  it('allows mention links with safe attributes', () => {
    const html =
      '<a href="/designer/11111111-1111-1111-1111-111111111111/requests" class="font-semibold" data-mention-user="11111111-1111-1111-1111-111111111111">@Alex</a>';
    expect(sanitizeChatterHtml(html)).toContain('data-mention-user');
  });
});
