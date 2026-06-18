'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { listChatterMentionUsers } from '../services/chatter-posts.api';
import { formatMessageHtml, parseMentionUserIdsFromMessage } from '../utils/mention-utils';

/**
 * Textarea with @mention autocomplete. Works for posts and comments.
 * When `richPreview` is enabled, formatted markdown is rendered live beneath a transparent textarea.
 */
export const MentionTextarea = forwardRef(function MentionTextarea(
  {
    value,
    onChange,
    placeholder = 'Write a message…',
    className = '',
    minRows = 3,
    disabled = false,
    taskId = null,
    projectId = null,
    onMentionIdsChange,
    richPreview = false,
  },
  ref,
) {
  const textareaRef = useRef(null);
  const previewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onMentionIdsChangeRef = useRef(onMentionIdsChange);
  const mentionUsersRef = useRef([]);
  const lastReportedIdsRef = useRef('');

  onChangeRef.current = onChange;
  onMentionIdsChangeRef.current = onMentionIdsChange;

  useImperativeHandle(ref, () => textareaRef.current);

  const [mentionUsers, setMentionUsers] = useState([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownIndex, setDropdownIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState(null);

  mentionUsersRef.current = mentionUsers;

  const mentionUsersKey = useMemo(
    () => mentionUsers.map((user) => `${user.id}\u0000${user.fullName}`).join('\u0001'),
    [mentionUsers],
  );

  const previewHtml = useMemo(() => {
    if (!richPreview || !String(value ?? '').trim()) return '';
    return formatMessageHtml(value, mentionUsers, { linkMentions: false });
  }, [richPreview, value, mentionUsersKey, mentionUsers]);

  const reportMentionIds = useCallback((text) => {
    const ids = parseMentionUserIdsFromMessage(text, mentionUsersRef.current);
    const key = ids.join(',');
    if (key === lastReportedIdsRef.current) return;
    lastReportedIdsRef.current = key;
    onMentionIdsChangeRef.current?.(ids);
  }, []);

  const syncPreviewScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview) return;
    preview.scrollTop = textarea.scrollTop;
    preview.scrollLeft = textarea.scrollLeft;
  }, []);

  const updateDropdownPosition = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 200),
      zIndex: 9999,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    listChatterMentionUsers({ taskId, projectId })
      .then((rows) => {
        if (!cancelled) setMentionUsers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setMentionUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, projectId]);

  // Re-parse mentions when text changes or the mention directory finishes loading.
  useEffect(() => {
    reportMentionIds(value);
  }, [value, mentionUsersKey, reportMentionIds]);

  useEffect(() => {
    if (!richPreview) return;
    syncPreviewScroll();
  }, [richPreview, value, previewHtml, syncPreviewScroll]);

  const filteredUsers = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return mentionUsers.slice(0, 12);
    return mentionUsers
      .filter((u) => u.fullName?.toLowerCase().includes(q))
      .slice(0, 12);
  }, [mentionUsers, mentionQuery]);

  useEffect(() => {
    if (!showDropdown) return;
    updateDropdownPosition();
    const onReposition = () => updateDropdownPosition();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [showDropdown, mentionQuery, filteredUsers.length, updateDropdownPosition]);

  const detectMentionContext = useCallback((text, cursorPos) => {
    const before = text.slice(0, cursorPos);
    const at = before.lastIndexOf('@');
    if (at < 0) return null;
    const fragment = before.slice(at + 1);
    if (/\s/.test(fragment)) return null;
    return { at, query: fragment };
  }, []);

  const insertMention = useCallback(
    (user) => {
      const el = textareaRef.current;
      if (!el || !user?.fullName) return;
      const cursor = el.selectionStart ?? value.length;
      const ctx = detectMentionContext(value, cursor);
      if (!ctx) return;
      const before = value.slice(0, ctx.at);
      const after = value.slice(cursor);
      const insert = `@${user.fullName.trim()} `;
      const next = `${before}${insert}${after}`;
      if (next !== value) {
        onChangeRef.current(next);
        reportMentionIds(next);
      }
      setShowDropdown(false);
      setMentionQuery('');
      requestAnimationFrame(() => {
        const pos = before.length + insert.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    },
    [value, detectMentionContext, reportMentionIds],
  );

  const handleChange = (event) => {
    const next = event.target.value;
    if (next === value) return;
    onChangeRef.current(next);
    reportMentionIds(next);
    const cursor = event.target.selectionStart ?? next.length;
    const ctx = detectMentionContext(next, cursor);
    if (ctx) {
      setMentionQuery(ctx.query);
      setShowDropdown(true);
      setDropdownIndex(0);
      requestAnimationFrame(updateDropdownPosition);
    } else {
      setShowDropdown(false);
      setMentionQuery('');
      setDropdownStyle(null);
    }
  };

  const handleKeyDown = (event) => {
    if (!showDropdown || filteredUsers.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setDropdownIndex((i) => (i + 1) % filteredUsers.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setDropdownIndex((i) => (i - 1 + filteredUsers.length) % filteredUsers.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      insertMention(filteredUsers[dropdownIndex]);
    } else if (event.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const textareaClassName = richPreview
    ? 'relative z-[1] block min-h-[inherit] w-full resize-none overflow-auto border-0 bg-transparent px-3 py-2 text-sm leading-relaxed text-transparent caret-slate-900 outline-none'
    : className;

  const editor = (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onScroll={richPreview ? syncPreviewScroll : undefined}
      onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
      placeholder={richPreview ? '' : placeholder}
      disabled={disabled}
      rows={minRows}
      className={textareaClassName}
      spellCheck={richPreview ? false : undefined}
    />
  );

  return (
    <div className="relative">
      {richPreview ? (
        <div
          className={`chatter-rich-editor relative min-h-[80px] w-full overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 ${className}`}
        >
          <div
            ref={previewRef}
            aria-hidden
            className="chatter-rich-text pointer-events-none absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-sm leading-relaxed text-slate-900"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
          {!String(value ?? '').trim() && placeholder ? (
            <div className="pointer-events-none absolute inset-0 z-0 px-3 py-2 text-sm leading-relaxed text-slate-400">
              {placeholder}
            </div>
          ) : null}
          {editor}
        </div>
      ) : (
        editor
      )}
      {showDropdown && filteredUsers.length > 0 && dropdownStyle ? (
        <ul
          style={dropdownStyle}
          className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {filteredUsers.map((user, idx) => (
            <li key={user.id}>
              <button
                type="button"
                role="option"
                aria-selected={idx === dropdownIndex}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                  idx === dropdownIndex ? 'bg-blue-50 text-blue-800' : 'text-slate-800'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(user);
                }}
              >
                {user.fullName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});
