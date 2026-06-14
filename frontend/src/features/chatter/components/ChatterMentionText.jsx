'use client';

import { formatMessageHtml } from '../utils/mention-utils';

export function ChatterMentionText({ message, users = [], className = '' }) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: formatMessageHtml(message, users) }}
    />
  );
}
