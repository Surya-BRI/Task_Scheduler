'use client';

import { memo } from 'react';
import { MentionTextarea } from './MentionTextarea';

/**
 * Comment composer for embedded task/project chatter — matches main ChatterScreen behavior.
 */
export const EmbeddedChatterCommentComposer = memo(function EmbeddedChatterCommentComposer({
  value,
  onChange,
  onSubmit,
  submitting = false,
  taskId = null,
  projectId = null,
  onMentionIdsChange,
  submitLabel = 'Reply',
}) {
  return (
    <div className="mt-2 flex items-end gap-2 overflow-visible">
      <div className="min-w-0 flex-1 overflow-visible">
        <MentionTextarea
          value={value}
          onChange={onChange}
          taskId={taskId}
          projectId={projectId}
          onMentionIdsChange={onMentionIdsChange}
          minRows={2}
          placeholder="Write a comment... Use @ to mention"
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
        />
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!String(value ?? '').trim() || submitting}
        className="shrink-0 rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
      >
        {submitting ? '...' : submitLabel}
      </button>
    </div>
  );
});
