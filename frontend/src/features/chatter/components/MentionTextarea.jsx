'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { listChatterMentionUsers } from '../services/chatter-posts.api';
import { formatMessageHtml, parseMentionUserIdsFromMessage } from '../utils/mention-utils';

const RICH_FORMAT_COMMANDS = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikeThrough',
};

function getRichNodeMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tagName = node.tagName.toLowerCase();
  if (tagName === 'br') return '\n';

  let text = Array.from(node.childNodes).map(getRichNodeMarkdown).join('');
  if (!text) return '';

  if (tagName === 'strong' || tagName === 'b') text = `**${text}**`;
  if (tagName === 'em' || tagName === 'i') text = `*${text}*`;
  if (tagName === 'u') text = `__${text}__`;
  if (tagName === 's' || tagName === 'strike' || tagName === 'del') text = `~~${text}~~`;
  if ((tagName === 'div' || tagName === 'p') && node.nextSibling) text += '\n';

  return text;
}

function getRichMarkdown(root) {
  return Array.from(root.childNodes).map(getRichNodeMarkdown).join('');
}

function getRichCaretOffset(root) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return root.textContent?.length ?? 0;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return root.textContent?.length ?? 0;

  const beforeCaret = range.cloneRange();
  beforeCaret.selectNodeContents(root);
  beforeCaret.setEnd(range.startContainer, range.startOffset);
  return beforeCaret.toString().length;
}

function selectRichTextRange(root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let currentOffset = 0;
  let startSet = false;
  let node = walker.nextNode();

  while (node) {
    const nextOffset = currentOffset + (node.nodeValue?.length ?? 0);
    if (!startSet && start <= nextOffset) {
      range.setStart(node, Math.max(0, start - currentOffset));
      startSet = true;
    }
    if (end <= nextOffset) {
      range.setEnd(node, Math.max(0, end - currentOffset));
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    }
    currentOffset = nextOffset;
    node = walker.nextNode();
  }

  range.selectNodeContents(root);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return start === end;
}

function focusRichEditor(editor) {
  editor.focus();
  const selection = window.getSelection();
  if (!selection) return;
  if (selection.rangeCount > 0 && editor.contains(selection.getRangeAt(0).startContainer)) return;

  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertTextAtRichCaret(editor, text) {
  focusRichEditor(editor);
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Textarea with @mention autocomplete. Works for posts and comments.
 * When `richPreview` is enabled, users edit formatted content while the component emits markdown.
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
    transformInsertedText,
    richPreview = false,
  },
  ref,
) {
  const textareaRef = useRef(null);
  const richEditorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onMentionIdsChangeRef = useRef(onMentionIdsChange);
  const transformInsertedTextRef = useRef(transformInsertedText);
  const mentionUsersRef = useRef([]);
  const lastReportedIdsRef = useRef('');
  const lastRichValueRef = useRef(null);

  onChangeRef.current = onChange;
  onMentionIdsChangeRef.current = onMentionIdsChange;
  transformInsertedTextRef.current = transformInsertedText;

  useImperativeHandle(ref, () => {
    if (!richPreview) return textareaRef.current;
    const editor = richEditorRef.current;
    if (!editor) return null;

    return {
      focus: () => focusRichEditor(editor),
      insertText: (text) => {
        insertTextAtRichCaret(editor, text);
        updateRichValueFromDom(editor);
      },
      applyRichFormat: (formatName) => {
        const command = RICH_FORMAT_COMMANDS[formatName];
        if (!command) return;
        focusRichEditor(editor);
        document.execCommand(command, false);
        updateRichValueFromDom(editor);
      },
    };
  });

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

  const richHtml = useMemo(() => {
    if (!richPreview || !String(value ?? '')) return '';
    return formatMessageHtml(value, mentionUsers, { linkMentions: false });
  }, [richPreview, value, mentionUsers]);

  const reportMentionIds = useCallback((text) => {
    const ids = parseMentionUserIdsFromMessage(text, mentionUsersRef.current);
    const key = ids.join(',');
    if (key === lastReportedIdsRef.current) return;
    lastReportedIdsRef.current = key;
    onMentionIdsChangeRef.current?.(ids);
  }, []);

  const updateDropdownPosition = useCallback(() => {
    const el = richPreview ? richEditorRef.current : textareaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 200),
      zIndex: 9999,
    });
  }, [richPreview]);

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
    const editor = richEditorRef.current;
    if (!editor || lastRichValueRef.current === value) return;
    editor.innerHTML = richHtml;
    lastRichValueRef.current = value;
  }, [richPreview, value, richHtml]);

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

  const updateRichValueFromDom = useCallback(
    (editor) => {
      const next = getRichMarkdown(editor);
      lastRichValueRef.current = next;
      if (next !== value) {
        onChangeRef.current(next);
        reportMentionIds(next);
      }

      const cursor = getRichCaretOffset(editor);
      const ctx = detectMentionContext(editor.textContent ?? '', cursor);
      if (!ctx) {
        setShowDropdown(false);
        setMentionQuery('');
        setDropdownStyle(null);
        return;
      }
      setMentionQuery(ctx.query);
      setShowDropdown(true);
      setDropdownIndex(0);
      requestAnimationFrame(updateDropdownPosition);
    },
    [value, detectMentionContext, reportMentionIds, updateDropdownPosition],
  );

  const insertMention = useCallback(
    (user) => {
      if (!user?.fullName) return;

      if (richPreview) {
        const editor = richEditorRef.current;
        if (!editor) return;
        const cursor = getRichCaretOffset(editor);
        const ctx = detectMentionContext(editor.textContent ?? '', cursor);
        if (!ctx) return;
        selectRichTextRange(editor, ctx.at, cursor);
        insertTextAtRichCaret(editor, `@${user.fullName.trim()} `);
        updateRichValueFromDom(editor);
        setShowDropdown(false);
        setMentionQuery('');
        return;
      }

      const el = textareaRef.current;
      if (!el) return;
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
    [richPreview, value, detectMentionContext, reportMentionIds, updateRichValueFromDom],
  );

  const handleChange = (event) => {
    const rawNext = event.target.value;
    let next = rawNext;
    let cursor = event.target.selectionStart ?? rawNext.length;
    const transformInsert = transformInsertedTextRef.current;
    if (transformInsert && rawNext !== value) {
      let start = 0;
      while (start < value.length && start < rawNext.length && value[start] === rawNext[start]) {
        start += 1;
      }
      let prevEnd = value.length;
      let nextEnd = rawNext.length;
      while (prevEnd > start && nextEnd > start && value[prevEnd - 1] === rawNext[nextEnd - 1]) {
        prevEnd -= 1;
        nextEnd -= 1;
      }
      const inserted = rawNext.slice(start, nextEnd);
      if (inserted) {
        const formattedInsert = transformInsert(inserted);
        if (formattedInsert !== inserted) {
          next = `${value.slice(0, start)}${formattedInsert}${value.slice(prevEnd)}`;
          cursor = start + formattedInsert.length;
          requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.setSelectionRange(cursor, cursor);
          });
        }
      }
    }
    if (next === value) return;
    onChangeRef.current(next);
    reportMentionIds(next);
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

  const handleRichInput = (event) => {
    updateRichValueFromDom(event.currentTarget);
  };

  const handleRichKeyUp = (event) => {
    updateRichValueFromDom(event.currentTarget);
  };

  const editor = (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
      placeholder={placeholder}
      disabled={disabled}
      rows={minRows}
      className={className}
    />
  );

  return (
    <div className="relative">
      {richPreview ? (
        <div
          className={`chatter-rich-editor relative min-h-[80px] w-full rounded-md border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 ${className}`}
        >
          <div
            ref={richEditorRef}
            role="textbox"
            aria-multiline="true"
            contentEditable={!disabled}
            suppressContentEditableWarning
            onInput={handleRichInput}
            onKeyDown={handleKeyDown}
            onKeyUp={handleRichKeyUp}
            onMouseUp={handleRichKeyUp}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            className="chatter-rich-text min-h-[inherit] w-full overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-sm leading-relaxed text-slate-900 outline-none"
          />
          {!String(value ?? '').trim() && placeholder ? (
            <div className="pointer-events-none absolute inset-0 px-3 py-2 text-sm leading-relaxed text-slate-400">
              {placeholder}
            </div>
          ) : null}
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
