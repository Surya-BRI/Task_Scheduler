"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Link2, MessageCircle, MoreHorizontal, PlusSquare, Search, ThumbsUp, X } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import {
  createChatterComment,
  createChatterPost,
  deleteChatterComment,
  deleteChatterPost,
  formatChatterTime,
  formatMentionSummary,
  getChatterPost,
  getMondayOfWeek,
  likeChatterPost,
  markChatterPostsSeen,
  listChatterMentionUsers,
  listChatterPosts,
  normalizePaginationCursor,
  mapChatterPostDtoToFeedPost,
  mapCommentDtoToFeedComment,
  updateChatterComment,
  updateChatterPost,
} from "@/features/chatter/services/chatter-posts.api";
import { emitChatterRefresh, onChatterRefresh } from "@/features/chatter/utils/chatter-events";
import { connectDashboardRealtime } from "@/lib/realtime";
import { apiClient } from "@/lib/api-client";
import { getSession } from "@/lib/mock-auth";
import {
  createLinkAttachment,
  isValidExternalUrl,
  normalizeExternalUrl,
} from "../utils/chatterLinkAttachments";
import { MentionTextarea } from "./MentionTextarea";
import { ChatterMentionText } from "./ChatterMentionText";
import { parseMentionUserIdsFromMessage, mergeMentionUsers, parseMentionedUsersFromMessage, resolveMentionUsersForDisplay } from "../utils/mention-utils";
import { dedupeCommentsById } from "../utils/chatter-merge";
import { isSameUserId, normalizeUserId } from "@/lib/user-id";

const PRIORITY_STYLES = {
  low: "bg-emerald-500",
  medium: "bg-amber-400",
  high: "bg-red-500",
};

const PRIVATE_CHATTER_ITEM_CLASS =
  "w-full min-w-0 whitespace-normal rounded-lg border border-blue-200 border-l-4 border-l-blue-500 bg-blue-50 p-3 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-100/70 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1";

const PRIVATE_CHATTER_READ_ITEM_CLASS =
  "w-full min-w-0 whitespace-normal rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1";

const PRIVATE_CHATTER_MESSAGE_CLASS =
  "mt-2 block break-words rounded-md border border-blue-100 bg-white/80 px-2.5 py-2 text-sm text-slate-700";

const PRIVATE_CHATTER_READ_MESSAGE_CLASS =
  "mt-2 block break-words rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-sm text-slate-700";

const COMMENT_FORMATS = {
  bold: { open: "**", close: "**" },
  italic: { open: "*", close: "*" },
  underline: { open: "__", close: "__" },
  strike: { open: "~~", close: "~~" },
};

function formatTaskCatalogLabel(task) {
  const title = String(task?.title ?? "").trim();
  const taskNo = String(task?.taskNo ?? "").trim();
  const opNo = String(task?.opNo ?? "").trim();
  const isGenericTaskNo = !taskNo || /^TSK(?:[\s-]|$)/i.test(taskNo);
  const ref = opNo || (!isGenericTaskNo ? taskNo : "") || taskNo;
  if (title && ref) return `${title} (${ref})`;
  if (title) return title;
  if (ref) return ref;
  return "Task";
}

function FormattedText({ text, mentionUsers = [], className }) {
  return <ChatterMentionText message={text} users={mentionUsers} className={className} />;
}

function SegmentButton({ label, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ui-chip-button ${isActive ? "ui-chip-button-active" : ""}`}
    >
      {label}
    </button>
  );
}

function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="hover:text-emerald-100">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function LinkAttachmentPreview({ link }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full max-w-md items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
    >
      <span
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${link.platformBadgeClass}`}
        aria-hidden
      >
        {link.platformIcon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{link.platformLabel}</span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-slate-900">{link.name}</span>
        <span className="mt-0.5 block truncate text-xs text-blue-600">{link.url}</span>
      </span>
    </a>
  );
}

function ChatterPostAttachments({ post }) {
  const serverAttachments = post.fileAttachments ?? [];
  const linkAttachments = post.linkAttachments ?? [];
  // localFiles: File objects only present for optimistic UI right after creating a post (before refresh)
  const localFiles = post._localFiles ?? [];

  const hasContent = serverAttachments.length > 0 || localFiles.length > 0 || linkAttachments.length > 0;
  if (!hasContent) return null;

  return (
    <div className="mt-3 space-y-2">
      {/* Server-side attachments (from S3 with signed URLs) */}
      {serverAttachments.map((att, index) => {
        const isImage = att.mimeType?.startsWith("image/");
        const displayName = att.fileName || `Attachment ${index + 1}`;
        const sizeKb = att.sizeBytes ? (att.sizeBytes / 1024).toFixed(1) : null;

        return (
          <div key={att.id || `server-${index}`}>
            {isImage && att.url ? (
              <a href={att.url} target="_blank" rel="noopener noreferrer">
                <img
                  src={att.url}
                  alt={displayName}
                  className="max-h-48 rounded-md border border-slate-200 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                />
              </a>
            ) : (
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full max-w-sm items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2 hover:bg-slate-100 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded border border-slate-200 bg-white text-lg">
                  {att.mimeType === "application/pdf" ? "📕" : "📄"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">{displayName}</p>
                  {sizeKb ? <p className="text-xs text-slate-500">{sizeKb} KB</p> : null}
                </div>
              </a>
            )}
          </div>
        );
      })}
      {/* Local File objects (optimistic UI before server returns attachment data) */}
      {localFiles.map((file, index) => (
        <div key={`local-${file.name}-${index}`}>
          {file.type?.startsWith("image/") ? (
            <img
              src={URL.createObjectURL(file)}
              alt={file.name}
              className="max-h-48 rounded-md border border-slate-200 object-contain"
            />
          ) : (
            <div className="inline-flex w-full max-w-sm items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="flex h-10 w-10 items-center justify-center rounded border border-slate-200 bg-white text-lg">
                📄
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          )}
        </div>
      ))}
      {linkAttachments.map((link) => (
        <LinkAttachmentPreview key={link.id} link={link} />
      ))}
    </div>
  );
}

function CreatePostModal({ isOpen, onClose, onSubmit, isSubmitting }) {
  const [title, setTitle] = useState("");
  const [mention, setMention] = useState("");
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [mentionUsers, setMentionUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("");
  const [postType, setPostType] = useState("Posts");
  const [fileAttachments, setFileAttachments] = useState([]);
  const [linkAttachments, setLinkAttachments] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [errors, setErrors] = useState({});
  const [taskSearch, setTaskSearch] = useState("");
  const [taskResults, setTaskResults] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedTaskLabel, setSelectedTaskLabel] = useState("");
  const [showTaskResults, setShowTaskResults] = useState(false);
  const taskSearchTimeout = useRef(null);

  const handleMentionChange = (e) => {
    const val = e.target.value;
    setMention(val);
    if (val.includes("@")) setShowMentions(true);
    else setShowMentions(false);
  };

  const selectMention = (user) => {
    setSelectedMentions((prev) => {
      if (prev.some((m) => m.id === user.id)) return prev;
      return [...prev, { id: user.id, fullName: user.fullName }];
    });
    setMention("");
    setShowMentions(false);
  };

  const removeMention = (userId) => {
    setSelectedMentions((prev) => prev.filter((m) => m.id !== userId));
  };

  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFileAttachments((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  const addFiles = (fileList) => {
    if (!fileList?.length) return;
    const picked = Array.from(fileList);
    for (const file of picked) {
      console.info("[Chatter] File selected:", file.name, file.type || "unknown", `${file.size}b`);
    }
    setFileAttachments((prev) => [...prev, ...picked]);
  };

  const removeFileAttachment = (index) => {
    setFileAttachments((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  };

  const addLinkAttachment = () => {
    const normalized = normalizeExternalUrl(linkInput);
    if (!isValidExternalUrl(normalized)) {
      setErrors((prev) => ({ ...prev, link: "Enter a valid http or https URL." }));
      return;
    }
    if (linkAttachments.some((link) => link.url === normalized)) {
      setErrors((prev) => ({ ...prev, link: "This link is already attached." }));
      return;
    }
    setLinkAttachments((prev) => [...prev, createLinkAttachment(normalized)]);
    setLinkInput("");
    setErrors((prev) => {
      const next = { ...prev };
      delete next.link;
      return next;
    });
  };

  const removeLinkAttachment = (linkId) => {
    setLinkAttachments((prev) => prev.filter((link) => link.id !== linkId));
  };

  function handleTaskSearchChange(val) {
    setTaskSearch(val)
    setSelectedTaskId(null)
    setSelectedTaskLabel("")
    clearTimeout(taskSearchTimeout.current)
    if (!val.trim()) { setTaskResults([]); setShowTaskResults(false); return }
    taskSearchTimeout.current = setTimeout(() => {
      apiClient.get(`/tasks?search=${encodeURIComponent(val.trim())}&limit=8`)
        .then((res) => {
          const items = Array.isArray(res) ? res : (res?.data ?? [])
          setTaskResults(items)
          setShowTaskResults(true)
        })
        .catch(() => setTaskResults([]))
    }, 300)
  }

  function selectTask(task) {
    const ref = task.opNo || task.taskNo || ''
    const label = `${ref}${task.title ? ` — ${task.title}` : ''}`.trim().replace(/^—\s*/, '')
    setSelectedTaskId(task.id)
    setSelectedTaskLabel(label)
    setTaskSearch(label)
    setShowTaskResults(false)
  }

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setMention("");
    setSelectedMentions([]);
    setMessage("");
    setPriority("");
    setPostType("Posts");
    setFileAttachments([]);
    setLinkAttachments([]);
    setLinkInput("");
    setShowMentions(false);
    setErrors({});
    setTaskSearch("");
    setTaskResults([]);
    setSelectedTaskId(null);
    setSelectedTaskLabel("");
    setShowTaskResults(false);

    let cancelled = false;
    listChatterMentionUsers({ taskId: selectedTaskId })
      .then((users) => {
        if (!cancelled && Array.isArray(users)) setMentionUsers(users);
      })
      .catch(() => {
        if (!cancelled) setMentionUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedTaskId]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const nextErrors = {};
    if (!title.trim()) nextErrors.title = "Post title is required.";
    if (!message.trim()) nextErrors.message = "Description is required.";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    const idsFromMessage = parseMentionUserIdsFromMessage(message, mentionUsers);
    const mentionUserIds = [...new Set([...selectedMentions.map((m) => m.id), ...idsFromMessage])];
    onSubmit({
      title,
      mention,
      mentionUserIds,
      mentionedUsers: selectedMentions,
      message,
      ...(priority ? { priority } : {}),
      postType,
      taskId: selectedTaskId || null,
      fileAttachments,
      linkAttachments,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={onClose} />
      <section className="relative z-10 flex w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Create Post</h2>
          <button type="button" onClick={onClose} className="ui-icon-button h-8 w-8">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[72vh] space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Post Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/25 ${
                errors.title ? "border-red-300 focus:border-red-400" : "border-slate-300 focus:border-blue-500"
              }`}
              placeholder="Enter post title"
            />
            {errors.title ? <p className="mt-1 text-xs text-red-600">{errors.title}</p> : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Link to Task <span className="font-normal text-slate-400">(optional)</span></label>
            <div className="relative">
              <input
                type="text"
                value={taskSearch}
                onChange={(e) => handleTaskSearchChange(e.target.value)}
                placeholder="Search by task number or title..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
              />
              {selectedTaskId ? (
                <button
                  type="button"
                  onClick={() => { setSelectedTaskId(null); setSelectedTaskLabel(""); setTaskSearch(""); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Clear task"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
              {showTaskResults && taskResults.length > 0 ? (
                <ul className="ui-popover-panel absolute z-20 mt-1 max-h-48 w-full overflow-y-auto">
                  {taskResults.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => selectTask(t)}
                        className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <span className="font-medium text-blue-600">{t.opNo || t.taskNo}</span>
                        {t.title ? <span className="ml-2 text-slate-600">{t.title}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Post Type</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {["Posts", "Private", "Task Updates"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPostType(type)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    postType === type
                      ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Mention Users</label>
            {selectedMentions.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {selectedMentions.map((user) => (
                  <span
                    key={user.id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                  >
                    @{user.fullName}
                    <button type="button" onClick={() => removeMention(user.id)} className="text-blue-500 hover:text-blue-800">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="relative">
              <input
                type="text"
                value={mention}
                onChange={handleMentionChange}
                placeholder="@username to add another mention"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
              />
              {showMentions && mentionUsers.length > 0 ? (
                <ul className="ui-popover-panel absolute z-20 mt-1 max-h-36 w-full overflow-y-auto">
                  {mentionUsers
                    .filter((user) => {
                      const needle = mention.toLowerCase();
                      const label = `@${user.fullName}`.toLowerCase();
                      return !needle || label.includes(needle.replace(/^@/, ''));
                    })
                    .filter((user) => !selectedMentions.some((m) => m.id === user.id))
                    .map((user) => (
                      <li key={user.id}>
                        <button
                          type="button"
                          onClick={() => selectMention(user)}
                          className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          @{user.fullName}
                        </button>
                      </li>
                    ))}
                </ul>
              ) : null}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700">Description *</label>
              <span className="text-xs text-slate-500">{message.length}/500</span>
            </div>
            <MentionTextarea
              value={message}
              onChange={setMessage}
              taskId={selectedTaskId}
              minRows={5}
              placeholder="Write your post details... Use @ to mention someone"
              className={`min-h-[140px] w-full resize-y rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/25 ${
                errors.message ? "border-red-300 focus:border-red-400" : "border-slate-300 focus:border-blue-500"
              }`}
            />
            {errors.message ? <p className="mt-1 text-xs text-red-600">{errors.message}</p> : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">File attachments</label>
            <div
              className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition-colors hover:bg-slate-100"
              onClick={() => document.getElementById("post-attachment").click()}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                type="file"
                id="post-attachment"
                className="hidden"
                multiple
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <p className="text-sm text-slate-500">Click to upload or drag and drop one or more files</p>
            </div>
            {fileAttachments.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {fileAttachments.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="truncate font-medium text-slate-700">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFileAttachment(index)}
                      className="ui-icon-button h-7 w-7 text-slate-500"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">External link attachments</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="url"
                  value={linkInput}
                  onChange={(e) => {
                    setLinkInput(e.target.value);
                    if (errors.link) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.link;
                        return next;
                      });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLinkAttachment();
                    }
                  }}
                  placeholder="Paste OneDrive, Google Drive, SharePoint, Dropbox, or document URL"
                  className={`w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/25 ${
                    errors.link ? "border-red-300 focus:border-red-400" : "border-slate-300 focus:border-blue-500"
                  }`}
                />
              </div>
              <button
                type="button"
                onClick={addLinkAttachment}
                className="ui-chip-button shrink-0 px-4 py-2"
              >
                Add link
              </button>
            </div>
            {errors.link ? <p className="mt-1 text-xs text-red-600">{errors.link}</p> : null}
            {linkAttachments.length > 0 ? (
              <div className="mt-3 space-y-2">
                {linkAttachments.map((link) => (
                  <div key={link.id} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <LinkAttachmentPreview link={link} />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLinkAttachment(link.id)}
                      className="ui-icon-button mt-2 h-8 w-8 shrink-0 text-slate-500"
                      aria-label={`Remove ${link.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Priority Level <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {["High", "Medium", "Low"].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setPriority((prev) => (prev === level ? "" : level))}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                    priority === level
                      ? level === "High"
                        ? "border-red-500 bg-red-500 text-white"
                        : level === "Medium"
                          ? "border-amber-400 bg-amber-400 text-white"
                          : "border-emerald-500 bg-emerald-500 text-white"
                      : level === "High"
                        ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        : level === "Medium"
                          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose} className="ui-chip-button px-4 py-2">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
            ) : null}
            Post
          </button>
        </div>
      </section>
    </div>
  );
}

function formatSeenBySummary(post) {
  const users = post.seenByUsers ?? [];
  const count = post.seenBy ?? users.length ?? 0;
  if (count === 0) return { count: 0, title: undefined };
  if (users.length > 0) {
    return { count, title: users.map((user) => user.fullName).join(", ") };
  }
  return { count, title: undefined };
}

function isMentionedInComment(comment, currentUserId) {
  return (
    isSameUserId(comment.mentionUserId, currentUserId)
    || (comment.mentionedUsers ?? []).some((user) => isSameUserId(user.id, currentUserId))
  );
}

function isMentionedInPost(post, currentUserId) {
  return (
    isSameUserId(post.mentionUserId, currentUserId)
    || (post.mentionedUsers ?? []).some((user) => isSameUserId(user.id, currentUserId))
  );
}

function buildPrivateMentionEntries(posts, currentUserId, { trustApiFilter = false } = {}) {
  const entries = [];
  for (const post of posts) {
    const postMentioned = isMentionedInPost(post, currentUserId);
    const commentMentions = (post.comments ?? []).filter((comment) =>
      isMentionedInComment(comment, currentUserId),
    );

    if (!trustApiFilter && !postMentioned && commentMentions.length === 0) {
      continue;
    }

    if (postMentioned) {
      entries.push({
        id: `${post.id}-post`,
        postId: post.id,
        commentId: null,
        title: post.title,
        taskName: post.taskName,
        projectName: post.projectName,
        message: post.message,
        time: post.time,
        updatedAt: post.updatedAt,
      });
    }

    for (const comment of commentMentions) {
      entries.push({
        id: `${post.id}-${comment.id}`,
        postId: post.id,
        commentId: comment.id,
        title: post.title,
        taskName: post.taskName,
        projectName: post.projectName,
        message: comment.message,
        time: formatChatterTime(comment.createdAt),
        updatedAt: comment.createdAt ?? post.updatedAt,
      });
    }

    if (trustApiFilter && !postMentioned && commentMentions.length === 0) {
      entries.push({
        id: `${post.id}-mention`,
        postId: post.id,
        commentId: null,
        title: post.title,
        taskName: post.taskName,
        projectName: post.projectName,
        message: post.message,
        time: post.time,
        updatedAt: post.updatedAt,
      });
    }
  }

  return entries.sort(
    (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
  );
}

function getPrivateChatterViewedStorageKey(userId) {
  return `chatter.private.viewed.${userId}`;
}

function readPrivateChatterViewedIds(userId) {
  if (!userId || typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(getPrivateChatterViewedStorageKey(userId));
    const ids = JSON.parse(raw ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writePrivateChatterViewedIds(userId, ids) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getPrivateChatterViewedStorageKey(userId), JSON.stringify([...ids]));
  } catch {
    // Ignore storage failures; the current session state still clears the highlight.
  }
}

function SeenByLine({ post, className = "" }) {
  const summary = useMemo(() => formatSeenBySummary(post), [post]);
  return (
    <p className={className} title={summary.title}>
      Seen by {summary.count}
      {summary.title ? (
        <span className="mt-0.5 block truncate text-[11px] font-normal text-slate-400">
          {summary.title}
        </span>
      ) : null}
    </p>
  );
}

function PrivateChatterEntry({ item, mentionUsersDirectory, onOpen }) {
  const projectName = String(item.projectName ?? "").trim() || "—";
  const isRead = Boolean(item.isRead);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={isRead ? PRIVATE_CHATTER_READ_ITEM_CLASS : PRIVATE_CHATTER_ITEM_CLASS}
    >
      <p className="break-words text-sm font-semibold text-slate-900">{item.title}</p>
      {item.taskName ? (
        <p className="mt-0.5 break-words text-xs font-medium text-blue-700">{item.taskName}</p>
      ) : null}
      <ChatterMentionText
        message={item.message}
        users={mentionUsersDirectory}
        className={isRead ? PRIVATE_CHATTER_READ_MESSAGE_CLASS : PRIVATE_CHATTER_MESSAGE_CLASS}
      />
      <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
        <span className="min-w-0 break-words font-medium text-slate-600" title={projectName}>
          {projectName}
        </span>
        <span className="shrink-0 text-slate-400" aria-hidden="true">
          ·
        </span>
        <span className="shrink-0">{item.time}</span>
      </div>
    </button>
  );
}

function ChatterCard({
  post,
  mentionUsers = [],
  focusCommentId = null,
  isComposerOpen,
  draftComment,
  isSubmittingComment,
  onOpenComposer,
  onDraftChange,
  onMentionIdsChange,
  onSubmitComment,
  currentUserId,
  onLike,
  onEditPost,
  onDeletePost,
  onDeleteComment,
  onBecomeVisible,
}) {
  const displayComments = useMemo(
    () => dedupeCommentsById(post.comments),
    [post.comments],
  );
  const hasComments = displayComments.length > 0;
  const textareaRef = useRef(null);
  const cardRef = useRef(null);
  const [activeCommentFormats, setActiveCommentFormats] = useState({});
  const postMentionUsers = useMemo(
    () => resolveMentionUsersForDisplay(post.message, post.mentionedUsers, mentionUsers),
    [post.message, post.mentionedUsers, mentionUsers],
  );

  useEffect(() => {
    if (!isComposerOpen) {
      setActiveCommentFormats({});
    }
  }, [isComposerOpen]);

  useEffect(() => {
    const element = cardRef.current;
    if (!element || !onBecomeVisible) return undefined;

    const markIfVisible = () => {
      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top < viewportHeight && rect.bottom > 0) {
        onBecomeVisible(post.id);
      }
    };

    markIfVisible();

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onBecomeVisible(post.id);
        }
      },
      { threshold: [0, 0.2, 0.5] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [post.id, onBecomeVisible]);

  function applyFormat(formatName) {
    const el = textareaRef.current
    if (!el) return
    if (typeof el.applyRichFormat === "function") {
      el.applyRichFormat(formatName)
      setActiveCommentFormats((prev) => ({ ...prev, [formatName]: !prev[formatName] }))
      return
    }
    const syntax = COMMENT_FORMATS[formatName]
    if (!syntax) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = draftComment.slice(start, end)
    const { open, close } = syntax
    if (!selected) {
      setActiveCommentFormats((prev) => ({ ...prev, [formatName]: !prev[formatName] }))
      requestAnimationFrame(() => el.focus())
      return
    }
    const newText = draftComment.slice(0, start) + open + selected + close + draftComment.slice(end)
    onDraftChange(newText)
    setTimeout(() => {
      el.focus()
      const cursor = end + open.length + close.length
      el.setSelectionRange(cursor, cursor)
    }, 0)
  }

  function formatInsertedCommentText(text) {
    const active = Object.entries(COMMENT_FORMATS)
      .filter(([name]) => activeCommentFormats[name])
      .map(([, syntax]) => syntax);
    if (active.length === 0) return text;
    return active.reduce(
      (formatted, syntax) => `${syntax.open}${formatted}${syntax.close}`,
      text,
    );
  }

  function keepCommentComposerFocus(event) {
    event.preventDefault()
  }

  function insertAtCursor(text) {
    const el = textareaRef.current
    if (!el) return
    if (typeof el.insertText === "function") {
      el.insertText(text)
      return
    }
    const start = el.selectionStart
    const newText = draftComment.slice(0, start) + text + draftComment.slice(start)
    onDraftChange(newText)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + text.length, start + text.length)
    }, 0)
  }

  return (
    <article ref={cardRef} id={`chatter-post-${post.id}`} className="ui-surface ui-card-pad flex flex-col gap-3">
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
            <p className="text-[15px] font-semibold uppercase tracking-tight text-blue-600">
              {post.title}
            </p>
            <span className="text-sm font-medium text-slate-600">- {post.author}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{post.time}</p>

          <div className="mt-3">
            {post.mention && post.mention !== '—' ? (
              <p className="text-sm font-medium text-blue-600 mb-1">{post.mention}</p>
            ) : null}
            <FormattedText text={post.message} mentionUsers={postMentionUsers} className="text-sm text-slate-800 leading-relaxed" />

            <ChatterPostAttachments post={post} />

            <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-slate-500">
              <button
                type="button"
                className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                onClick={() => onLike?.(post.id)}
              >
                <ThumbsUp className="w-4 h-4" />
                {(post.likeCount ?? 0) > 0 ? post.likeCount : "Like"}
              </button>
              <button
                type="button"
                className={`flex items-center gap-1.5 transition-colors ${hasComments ? "text-blue-600 hover:text-blue-700" : "hover:text-slate-800"}`}
                onClick={onOpenComposer}
              >
                <MessageCircle className="w-4 h-4" /> {hasComments ? "Commented" : "Comment"}
              </button>
              {currentUserId && isSameUserId(post.authorId, currentUserId) && (
                <div className="relative ml-auto">
                  <details className="group">
                    <summary className="list-none cursor-pointer rounded p-1 hover:bg-slate-100">
                      <MoreHorizontal className="w-4 h-4" />
                    </summary>
                    <div className="absolute right-0 top-6 z-10 w-28 rounded-md border border-slate-200 bg-white shadow-md text-xs">
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => onEditPost?.(post)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50"
                        onClick={() => onDeletePost?.(post.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </details>
                </div>
              )}
            </div>
            <SeenByLine
              post={post}
              className="mt-3 text-xs text-slate-500 sm:hidden"
            />
          </div>
        </div>
        
        {(post.postType === "Task Updates" || !post.postType) ? (
          <aside className="hidden sm:flex flex-col justify-between w-[220px] shrink-0 border-l-[3px] border-slate-800 pl-4 py-1 text-xs">
            <div className="space-y-1.5 text-slate-800">
              <p className="min-w-0">
                <span className="font-medium">Project Name:</span>{' '}
                {post.projectName && post.projectName !== '—' ? (
                  <span
                    className="block truncate text-slate-800"
                    title={post.projectName}
                  >
                    {post.projectName}
                  </span>
                ) : (
                  <span className="text-slate-400 italic">No project linked</span>
                )}
              </p>
              <p>
                <span className="font-medium">Designer Assigned:</span>{' '}
                {post.designerName && post.designerName !== '—'
                  ? post.designerName
                  : <span className="text-slate-400 italic">Unassigned</span>}
              </p>
              {post.priority ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Priority:</span>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full ${PRIORITY_STYLES[post.priority]}`} />
                  <span className="capitalize text-slate-600">{post.priority}</span>
                </div>
              ) : null}
            </div>
            <SeenByLine
              post={post}
              className="text-right text-slate-500 mt-4 pr-2 hidden sm:block"
            />
          </aside>
        ) : (
          <aside className="hidden sm:flex w-[220px] shrink-0 border-l-[3px] border-transparent pl-4 py-1 text-xs">
            <SeenByLine post={post} className="mt-auto text-right text-slate-500 pr-2 w-full" />
          </aside>
        )}
      </div>
      {hasComments ? (
        <ul className="mt-1 space-y-2 border-t border-slate-100 pt-3">
          {displayComments.map((comment) => (
            <li
              key={comment.id}
              id={`chatter-comment-${comment.id}`}
              className={`rounded-md bg-slate-50 px-3 py-2 text-sm ${focusCommentId === comment.id ? "ring-2 ring-blue-400" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-800">{comment.author}</p>
                {currentUserId && isSameUserId(comment.authorId, currentUserId) ? (
                  <button
                    type="button"
                    onClick={() => onDeleteComment?.(post.id, comment.id)}
                    className="text-[11px] font-semibold text-red-600 hover:text-red-700"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              <FormattedText
                text={comment.message}
                mentionUsers={resolveMentionUsersForDisplay(
                  comment.message,
                  comment.mentionedUsers,
                  mentionUsers,
                )}
                className="mt-0.5 block text-slate-700"
              />
            </li>
          ))}
        </ul>
      ) : null}
      {isComposerOpen ? (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <MentionTextarea
            ref={textareaRef}
            value={draftComment}
            onChange={onDraftChange}
            onMentionIdsChange={onMentionIdsChange}
            transformInsertedText={formatInsertedCommentText}
            richPreview
            placeholder="Write a comment... Use @ to mention someone"
            minRows={3}
            taskId={post.taskId}
            projectId={post.projectId}
            className="min-h-[80px]"
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1 text-sm font-medium text-slate-500">
              <button type="button" title="Bold" aria-pressed={Boolean(activeCommentFormats.bold)} onMouseDown={keepCommentComposerFocus} onClick={() => applyFormat('bold')} className={`rounded px-1.5 py-0.5 font-bold transition-colors ${activeCommentFormats.bold ? "bg-slate-800 text-white" : "hover:bg-slate-200 hover:text-slate-800"}`}>B</button>
              <button type="button" title="Italic" aria-pressed={Boolean(activeCommentFormats.italic)} onMouseDown={keepCommentComposerFocus} onClick={() => applyFormat('italic')} className={`rounded px-1.5 py-0.5 italic transition-colors ${activeCommentFormats.italic ? "bg-slate-800 text-white" : "hover:bg-slate-200 hover:text-slate-800"}`}>I</button>
              <button type="button" title="Underline" aria-pressed={Boolean(activeCommentFormats.underline)} onMouseDown={keepCommentComposerFocus} onClick={() => applyFormat('underline')} className={`rounded px-1.5 py-0.5 underline transition-colors ${activeCommentFormats.underline ? "bg-slate-800 text-white" : "hover:bg-slate-200 hover:text-slate-800"}`}>U</button>
              <button type="button" title="Strikethrough" aria-pressed={Boolean(activeCommentFormats.strike)} onMouseDown={keepCommentComposerFocus} onClick={() => applyFormat('strike')} className={`rounded px-1.5 py-0.5 line-through transition-colors ${activeCommentFormats.strike ? "bg-slate-800 text-white" : "hover:bg-slate-200 hover:text-slate-800"}`}>S</button>
              <span className="mx-1 text-slate-300">|</span>
              <button type="button" title="Mention someone" onMouseDown={keepCommentComposerFocus} onClick={() => insertAtCursor('@')} className="rounded px-1.5 py-0.5 hover:bg-slate-200 hover:text-slate-800 transition-colors">@</button>
            </div>
            <button
              type="button"
              onClick={onSubmitComment}
              disabled={!draftComment.trim() || isSubmittingComment}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {isSubmittingComment ? "Saving…" : "Comment"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function ChatterScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [openComposerPostId, setOpenComposerPostId] = useState(null);
  const [draftByPostId, setDraftByPostId] = useState({});
  const [activeTab, setActiveTab] = useState("posts");
  const [openTaskId, setOpenTaskId] = useState(null);
  const [focusedPostId, setFocusedPostId] = useState(null);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [activeWeekStart, setActiveWeekStart] = useState(null);
  const [taskCatalog, setTaskCatalog] = useState([]);
  const [taskCatalogLoaded, setTaskCatalogLoaded] = useState(false);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postsLoadError, setPostsLoadError] = useState(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState(null);
  const [mentionFeedPosts, setMentionFeedPosts] = useState([]);
  const [commentedFeedPosts, setCommentedFeedPosts] = useState([]);
  const [editingPost, setEditingPost] = useState(null);
  const [editMessage, setEditMessage] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [mentionUsersDirectoryBase, setMentionUsersDirectoryBase] = useState([]);
  const mentionUsersRef = useRef([]);
  const commentMentionIdsRef = useRef({});
  const loadMoreSentinelRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const hasMorePostsRef = useRef(false);
  const nextCursorRef = useRef(null);
  const seenPendingRef = useRef(new Set());
  const seenRecordedRef = useRef(new Set());
  const seenFlushTimerRef = useRef(null);
  const focusedPostFetchRef = useRef(new Set());
  const urlPostId = searchParams.get("postId");
  const urlCommentId = searchParams.get("commentId");
  const urlTab = searchParams.get("tab");

  const currentUserId = useMemo(() => normalizeUserId(getSession()?.id ?? null), []);
  const [viewedPrivateEntryIds, setViewedPrivateEntryIds] = useState(
    () => readPrivateChatterViewedIds(currentUserId),
  );
  const mentionUsersDirectory = useMemo(() => {
    const map = new Map();
    for (const user of mentionUsersDirectoryBase) {
      if (user?.id) map.set(user.id, user);
    }
    for (const post of posts) {
      for (const user of post.mentionedUsers ?? []) {
        if (user?.id) map.set(user.id, user);
      }
      for (const comment of post.comments ?? []) {
        for (const user of comment.mentionedUsers ?? []) {
          if (user?.id) map.set(user.id, user);
        }
      }
    }
    return [...map.values()];
  }, [mentionUsersDirectoryBase, posts]);
  const currentUserName = useMemo(() => getSession()?.fullName ?? '', []);

  useEffect(() => {
    setViewedPrivateEntryIds(readPrivateChatterViewedIds(currentUserId));
  }, [currentUserId]);

  const markPrivateEntryViewed = useCallback(
    (entryId) => {
      if (!currentUserId || !entryId) return;
      setViewedPrivateEntryIds((prev) => {
        if (prev.has(entryId)) return prev;
        const next = new Set(prev);
        next.add(entryId);
        writePrivateChatterViewedIds(currentUserId, next);
        return next;
      });
    },
    [currentUserId],
  );

  const applySeenUpdates = useCallback((updates) => {
    if (!Array.isArray(updates) || updates.length === 0) return;
    const byId = new Map(
      updates.map((update) => [normalizeUserId(update.postId) ?? update.postId, update]),
    );
    setPosts((prev) =>
      prev.map((post) => {
        const update = byId.get(normalizeUserId(post.id) ?? post.id);
        if (!update) return post;
        return {
          ...post,
          seenBy: update.seenByCount,
          seenByUsers: update.seenByUsers ?? post.seenByUsers,
        };
      }),
    );
  }, []);

  const flushSeenPosts = useCallback(async () => {
    const ids = [...seenPendingRef.current];
    seenPendingRef.current.clear();
    if (!ids.length) return;
    const keys = ids.map((id) => normalizeUserId(id)).filter(Boolean);
    try {
      const result = await markChatterPostsSeen(ids);
      const updates = Array.isArray(result?.updates) ? result.updates : [];
      for (const key of keys) seenRecordedRef.current.add(key);
      applySeenUpdates(updates);
    } catch (err) {
      for (const key of keys) seenRecordedRef.current.delete(key);
      console.warn("[Chatter] Failed to record seen posts:", err);
    }
  }, [applySeenUpdates]);

  const queueMarkPostSeen = useCallback((postId) => {
    if (!currentUserId || !postId) return;
    const key = normalizeUserId(postId);
    if (!key || seenRecordedRef.current.has(key)) return;
    seenPendingRef.current.add(postId);

    setPosts((prev) =>
      prev.map((post) => {
        if (!isSameUserId(post.id, postId)) return post;
        const alreadyListed = (post.seenByUsers ?? []).some((user) =>
          isSameUserId(user.id, currentUserId),
        );
        if (alreadyListed) return post;
        const seenByUsers = [
          ...(post.seenByUsers ?? []),
          { id: currentUserId, fullName: currentUserName || "You" },
        ];
        return { ...post, seenBy: seenByUsers.length, seenByUsers };
      }),
    );

    clearTimeout(seenFlushTimerRef.current);
    seenFlushTimerRef.current = setTimeout(() => {
      void flushSeenPosts();
    }, 400);
  }, [currentUserId, currentUserName, flushSeenPosts]);

  useEffect(() => {
    if (!currentUserId) return;
    for (const post of posts) {
      const alreadySeen = (post.seenByUsers ?? []).some((user) =>
        isSameUserId(user.id, currentUserId),
      );
      if (alreadySeen) {
        const key = normalizeUserId(post.id);
        if (key) seenRecordedRef.current.add(key);
      }
    }
  }, [posts, currentUserId]);

  useEffect(() => () => {
    clearTimeout(seenFlushTimerRef.current);
    if (seenPendingRef.current.size > 0) {
      void flushSeenPosts();
    }
  }, [flushSeenPosts]);

  const reloadPrivateFeeds = useCallback(async () => {
    if (!currentUserId) {
      setMentionFeedPosts([]);
      setCommentedFeedPosts([]);
      return;
    }
    try {
      const [mentionedRes, commentedRes] = await Promise.all([
        listChatterPosts({ mentionUserId: currentUserId, limit: 200 }),
        listChatterPosts({ commentedByUserId: currentUserId, limit: 200 }),
      ]);
      const mentionedRows = Array.isArray(mentionedRes?.data) ? mentionedRes.data : (Array.isArray(mentionedRes) ? mentionedRes : []);
      const commentedRows = Array.isArray(commentedRes?.data) ? commentedRes.data : (Array.isArray(commentedRes) ? commentedRes : []);
      setMentionFeedPosts(mentionedRows.map((row) => mapChatterPostDtoToFeedPost(row, currentUserId)));
      setCommentedFeedPosts(commentedRows.map((row) => mapChatterPostDtoToFeedPost(row, currentUserId)));
    } catch {
      setMentionFeedPosts([]);
      setCommentedFeedPosts([]);
    }
  }, [currentUserId]);

  const reloadPosts = useCallback(async (weekStartOverride) => {
    setPostsLoading(true);
    setNextCursor(null);
    try {
      const weekStart =
        weekStartOverride === undefined
          ? (activeWeekStart ?? undefined)
          : (weekStartOverride || undefined);
      const res = await listChatterPosts({ limit: 50, ...(weekStart ? { weekStart } : {}) });
      const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : null);
      if (!rows) {
        setPosts([]);
        setPostsLoadError(
          `Unexpected response: expected a JSON array, received ${res === null || res === undefined ? String(res) : typeof res}`,
        );
        return;
      }
      setPostsLoadError(null);
      setPosts(rows.map((row) => mapChatterPostDtoToFeedPost(row, currentUserId)));
      setNextCursor(normalizePaginationCursor(res?.pageInfo?.nextCursor));
      setHasMorePosts(Boolean(res?.pageInfo?.hasMore));
    } catch (err) {
      setPosts([]);
      setPostsLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setPostsLoading(false);
    }
  }, [currentUserId, activeWeekStart]);

  const loadMorePosts = useCallback(async () => {
    const cursor = normalizePaginationCursor(nextCursorRef.current);
    if (!cursor || loadingMoreRef.current || !hasMorePostsRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const weekStart = activeWeekStart ?? undefined;
      const res = await listChatterPosts({
        limit: 50,
        cursor,
        ...(weekStart ? { weekStart } : {}),
      });
      const rows = Array.isArray(res?.data) ? res.data : [];
      const mapped = rows.map((row) => mapChatterPostDtoToFeedPost(row, currentUserId));
      let addedCount = 0;
      setPosts((prev) => {
        const seen = new Set(prev.map((post) => post.id));
        const appended = mapped.filter((post) => !seen.has(post.id));
        addedCount = appended.length;
        return appended.length > 0 ? [...prev, ...appended] : prev;
      });
      const next = normalizePaginationCursor(res?.pageInfo?.nextCursor);
      const stillHasMore = Boolean(res?.pageInfo?.hasMore && next && addedCount > 0);
      setNextCursor(stillHasMore ? next : null);
      setHasMorePosts(stillHasMore);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load more posts.");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [currentUserId, activeWeekStart]);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  useEffect(() => {
    hasMorePostsRef.current = hasMorePosts;
  }, [hasMorePosts]);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    if (activeTab !== "posts" || postsLoading || !hasMorePosts) return undefined;
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMorePosts();
        }
      },
      { root: null, rootMargin: "240px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, postsLoading, hasMorePosts, loadMorePosts, posts.length]);

  useEffect(() => {
    void reloadPosts();
    void reloadPrivateFeeds();
    listChatterMentionUsers()
      .then((users) => {
        const rows = Array.isArray(users) ? users : [];
        mentionUsersRef.current = rows;
        setMentionUsersDirectoryBase(rows);
      })
      .catch(() => {
        mentionUsersRef.current = [];
        setMentionUsersDirectoryBase([]);
      });
  }, [currentUserId, reloadPosts, reloadPrivateFeeds]);

  useEffect(() => {
    if (activeTab === "private") {
      void reloadPrivateFeeds();
    }
  }, [activeTab, reloadPrivateFeeds]);

  const mergePostIntoFeed = useCallback((feedPost) => {
    if (!feedPost?.id) return;
    setPosts((prev) => {
      const existingIndex = prev.findIndex((post) => isSameUserId(post.id, feedPost.id));
      if (existingIndex >= 0) {
        return prev.map((post, index) => (index === existingIndex ? { ...post, ...feedPost } : post));
      }
      return [feedPost, ...prev];
    });
  }, []);

  const ensureFocusedPostAvailable = useCallback(async (postId) => {
    const normalizedPostId = normalizeUserId(postId) ?? postId;
    if (!normalizedPostId) return;
    if (posts.some((post) => isSameUserId(post.id, normalizedPostId))) return;

    const cachedPost = [...mentionFeedPosts, ...commentedFeedPosts].find((post) =>
      isSameUserId(post.id, normalizedPostId),
    );
    if (cachedPost) {
      mergePostIntoFeed(cachedPost);
      return;
    }

    if (focusedPostFetchRef.current.has(normalizedPostId)) return;
    focusedPostFetchRef.current.add(normalizedPostId);
    try {
      const dto = await getChatterPost(normalizedPostId);
      mergePostIntoFeed(mapChatterPostDtoToFeedPost(dto, currentUserId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the mentioned chatter post.");
    } finally {
      focusedPostFetchRef.current.delete(normalizedPostId);
    }
  }, [posts, mentionFeedPosts, commentedFeedPosts, mergePostIntoFeed, currentUserId]);

  useEffect(() => {
    if (!urlPostId || postsLoading) return;
    void ensureFocusedPostAvailable(urlPostId);
    setFocusedPostId(urlPostId);
    setActiveTab("posts");
    setOpenComposerPostId(urlCommentId ? urlPostId : null);
    queueMarkPostSeen(urlPostId);
    requestAnimationFrame(() => {
      const targetId = urlCommentId ? `chatter-comment-${urlCommentId}` : `chatter-post-${urlPostId}`;
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [urlPostId, urlCommentId, postsLoading, posts.length, queueMarkPostSeen, ensureFocusedPostAvailable]);

  useEffect(() => {
    return onChatterRefresh(() => {
      void reloadPosts();
      void reloadPrivateFeeds();
    });
  }, [reloadPosts, reloadPrivateFeeds]);

  useEffect(() => {
    return connectDashboardRealtime({
      onChatterRefresh: () => {
        void reloadPosts();
        void reloadPrivateFeeds();
      },
    });
  }, [reloadPosts, reloadPrivateFeeds]);

  const loadTaskCatalog = useCallback(() => {
    if (taskCatalogLoaded) return;
    setTaskCatalogLoaded(true);
    apiClient
      .get("/tasks?limit=500")
      .then((res) => {
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setTaskCatalog(
          rows.map((task) => ({
            id: String(task.id),
            label: formatTaskCatalogLabel(task),
            projectName: task?.project?.name?.trim() || "—",
          })),
        );
      })
      .catch(() => setTaskCatalog([]));
  }, [taskCatalogLoaded]);

  const openChatterTab = useCallback(
    (tab) => {
      setActiveTab(tab);
      setFocusedPostId(null);
      setOpenComposerPostId(null);
      if (tab === "task-updates") {
        loadTaskCatalog();
      }

      const qs = new URLSearchParams();
      if (tab !== "posts") qs.set("tab", tab);
      const suffix = qs.toString();
      router.push(suffix ? `/chatter?${suffix}` : "/chatter");
    },
    [loadTaskCatalog, router],
  );

  useEffect(() => {
    if (urlPostId) return;
    if (urlTab === "private") {
      setActiveTab("private");
      return;
    }
    if (urlTab === "task-updates") {
      setActiveTab("task-updates");
      loadTaskCatalog();
    }
  }, [urlPostId, urlTab, loadTaskCatalog]);

  const weekLabel = useMemo(() => {
    const monday = new Date(getMondayOfWeek(currentDate));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${sunday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }, [currentDate]);

  const sortedPosts = useMemo(
    () =>
      [...posts].sort(
        (a, b) =>
          new Date(b.updatedAt ?? "1970-01-01T00:00:00Z").getTime() -
          new Date(a.updatedAt ?? "1970-01-01T00:00:00Z").getTime(),
      ),
    [posts],
  );

  const privateMentions = useMemo(() => {
    if (!currentUserId) return [];
    const applyReadState = (entries) =>
      entries.map((entry) => ({ ...entry, isRead: viewedPrivateEntryIds.has(entry.id) }));
    if (mentionFeedPosts.length > 0) {
      return applyReadState(buildPrivateMentionEntries(mentionFeedPosts, currentUserId, { trustApiFilter: true }));
    }
    return applyReadState(buildPrivateMentionEntries(sortedPosts, currentUserId));
  }, [mentionFeedPosts, sortedPosts, currentUserId, viewedPrivateEntryIds]);

  const privateComments = useMemo(() => {
    if (!currentUserId) return [];
    const source = commentedFeedPosts.length > 0 ? commentedFeedPosts : sortedPosts;
    return source
      .filter((post) => (post.comments ?? []).some((comment) => isSameUserId(comment.authorId, currentUserId)))
      .map((post) => {
        const myComments = (post.comments ?? []).filter((comment) => isSameUserId(comment.authorId, currentUserId));
        const latestMyComment = [...myComments].sort(
          (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
        )[0];
        return {
          id: `${post.id}-${latestMyComment?.id ?? post.id}`,
          postId: post.id,
          commentId: latestMyComment?.id ?? null,
          title: post.title,
          taskName: post.taskName,
          projectName: post.projectName,
          message: latestMyComment?.message ?? post.message,
          time: formatChatterTime(latestMyComment?.createdAt ?? post.updatedAt),
          updatedAt: latestMyComment?.createdAt ?? post.updatedAt,
          isRead: viewedPrivateEntryIds.has(`${post.id}-${latestMyComment?.id ?? post.id}`),
        };
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
      );
  }, [commentedFeedPosts, sortedPosts, currentUserId, viewedPrivateEntryIds]);

  const taskUpdates = useMemo(() => {
    const byTask = new Map();
    for (const post of sortedPosts) {
      if (!post.taskId) continue;
      const key = post.taskId;
      const taskName = post.taskName || post.title || "Task";
      if (!byTask.has(key)) {
        byTask.set(key, {
          id: key,
          taskId: key,
          taskName,
          projectName: post.projectName,
          chats: [],
        });
      }
      byTask.get(key).chats.push({
        id: post.id,
        title: post.title,
        message: post.message,
        author: post.author,
        mention: post.mention,
        mentionedUsers: post.mentionedUsers,
        time: post.time,
        createdAt: post.updatedAt,
        updatedAt: post.updatedAt,
        comments: [...(post.comments ?? [])].sort(
          (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
        ),
      });
    }
    for (const task of taskCatalog) {
      if (!byTask.has(task.id)) {
        byTask.set(task.id, {
          id: task.id,
          taskId: task.id,
          taskName: task.label,
          projectName: task.projectName,
          chats: [],
        });
      }
    }
    return [...byTask.values()]
      .map((task) => ({
        ...task,
        chats: [...task.chats].sort(
          (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
        ),
      }))
      .sort((a, b) => a.taskName.localeCompare(b.taskName));
  }, [sortedPosts, taskCatalog]);

  const openComposer = (postId) => {
    setOpenComposerPostId((current) => (current === postId ? null : postId));
  };

  const changeDraft = (postId, value) => {
    setDraftByPostId((prev) => ({ ...prev, [postId]: value }));
  };

  const handleDateChange = (event) => {
    if (!event.target.value)
      return;
    const [yyyy, mm, dd] = event.target.value.split("-");
    setCurrentDate(new Date(Number(yyyy), Number(mm) - 1, Number(dd)));
  };

  const openDiscussion = (itemOrPostId) => {
    const postId = typeof itemOrPostId === "string" ? itemOrPostId : itemOrPostId?.postId;
    if (!postId) return;
    const commentId = typeof itemOrPostId === "string" ? null : itemOrPostId?.commentId;
    if (typeof itemOrPostId !== "string") {
      markPrivateEntryViewed(itemOrPostId.id);
    }
    const qs = new URLSearchParams({ postId });
    if (commentId) qs.set("commentId", commentId);
    router.push(`/chatter?${qs.toString()}`);
    setFocusedPostId(postId);
    setActiveTab("posts");
    setOpenComposerPostId(commentId ? postId : null);
  };

  const resolveMentionUserIds = (message) =>
    parseMentionUserIdsFromMessage(message, mentionUsersRef.current);

  const submitComment = async (postId) => {
    const content = (draftByPostId[postId] ?? "").trim();
    if (!content || submittingCommentPostId) return;

    setSubmittingCommentPostId(postId);
    try {
      const scopedIds = commentMentionIdsRef.current[postId] ?? [];
      const mentionUserIds =
        scopedIds.length > 0 ? scopedIds : resolveMentionUserIds(content);
      delete commentMentionIdsRef.current[postId];
      const created = await createChatterComment(postId, content, mentionUserIds);
      const feedComment = mapCommentDtoToFeedComment(created, currentUserId);
      const now = new Date().toISOString();
      setPosts((prev) =>
        prev.map((post) =>
          isSameUserId(post.id, postId)
            ? {
                ...post,
                updatedAt: now,
                comments: dedupeCommentsById([feedComment, ...(post.comments ?? [])]),
              }
            : post,
        ),
      );
      setDraftByPostId((prev) => ({ ...prev, [postId]: "" }));
      setOpenComposerPostId(null);
      const targetPost = posts.find((p) => p.id === postId);
      emitChatterRefresh({ postId, taskId: targetPost?.taskId, projectId: targetPost?.projectId });
      void reloadPrivateFeeds();
    } catch (err) {
      console.error("Failed to save comment:", err);
      toast.error(err instanceof Error ? err.message : "Could not save comment. Please try again.");
    } finally {
      setSubmittingCommentPostId(null);
    }
  };

  const handleLikePost = async (postId) => {
    try {
      const result = await likeChatterPost(postId);
      setPosts((prev) =>
        prev.map((p) => p.id === postId ? { ...p, likeCount: result.likeCount } : p),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not like post.");
    }
  };

  const handleEditPost = (post) => {
    setEditingPost(post);
    setEditMessage(post.message);
  };

  const handleSaveEdit = async () => {
    if (!editingPost) return;
    setIsSavingEdit(true);
    try {
      const updated = await updateChatterPost(editingPost.id, { message: editMessage });
      setPosts((prev) =>
        prev.map((p) => p.id === editingPost.id ? mapChatterPostDtoToFeedPost(updated, currentUserId) : p),
      );
      setEditingPost(null);
      toast.success("Post updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update post.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeletePost = async (postId) => {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await deleteChatterPost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success("Post deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete post.");
    }
  };

  const handleDeleteComment = async (postId, commentId) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await deleteChatterComment(postId, commentId);
      setPosts((prev) =>
        prev.map((p) =>
          isSameUserId(p.id, postId)
            ? {
                ...p,
                comments: dedupeCommentsById(
                  (p.comments ?? []).filter((c) => !isSameUserId(c.id, commentId)),
                ),
              }
            : p,
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete comment.");
    }
  };

  const handleCreatePost = async (postData) => {
    const fileCount = postData.fileAttachments?.length ?? 0;
    const linkCount = postData.linkAttachments?.length ?? 0;
    if (fileCount > 0) {
      console.info("[Chatter] Submitting post with", fileCount, "file(s) and", linkCount, "link(s)");
    }
    setIsSubmitting(true);
    try {
      const createdDto = await createChatterPost(
        {
          title: postData.title,
          message: postData.message,
          postType: postData.postType,
          ...(postData.priority ? { priority: postData.priority } : {}),
          ...(postData.mentionUserIds?.length ? { mentionUserIds: postData.mentionUserIds } : {}),
          ...(postData.taskId ? { taskId: postData.taskId } : {}),
          ...(postData.projectId ? { projectId: postData.projectId } : {}),
        },
        postData.fileAttachments,
        postData.linkAttachments,
      );

      const expectedFiles = postData.fileAttachments?.length ?? 0;
      const savedFiles = createdDto.attachments?.length ?? 0;
      if (expectedFiles > 0 && savedFiles === 0) {
        console.error(
          "[Chatter] Post saved but server returned no attachments (attachmentCount=",
          createdDto.attachmentCount,
          ")",
        );
        toast.error(
          "Post was saved but files were not stored. The API may be outdated — deploy the latest backend or confirm NEXT_PUBLIC_API_BASE_URL points to it.",
        );
        return;
      }

      const newFeedPost = mapChatterPostDtoToFeedPost(createdDto, currentUserId);
      const mergedMentionedUsers = mergeMentionUsers(
        createdDto.mentionedUsers,
        postData.mentionedUsers,
        parseMentionedUsersFromMessage(postData.message, mentionUsersRef.current),
      );
      if (mergedMentionedUsers.length > 0) {
        newFeedPost.mentionedUsers = mergedMentionedUsers;
        newFeedPost.mention = formatMentionSummary(
          mergedMentionedUsers,
          createdDto.mentionUserName,
          createdDto.message,
        );
      }
      // Keep local File objects as fallback for optimistic rendering
      // (in case the server response doesn't include signed URLs yet)
      if (postData.fileAttachments?.length && (!newFeedPost.fileAttachments || newFeedPost.fileAttachments.length === 0)) {
        newFeedPost._localFiles = postData.fileAttachments;
      }
      setPosts((prev) => [newFeedPost, ...prev]);
      setIsCreatePostOpen(false);
      const targetTab =
        postData.postType === "Private"
          ? "private"
          : postData.postType === "Task Updates"
            ? "task-updates"
            : "posts";
      setActiveTab(targetTab);
      emitChatterRefresh({
        taskId: createdDto.taskId,
        projectId: createdDto.projectId,
        postId: createdDto.id,
      });
      toast.success("Post created successfully");
    } catch (err) {
      console.error("Failed to create post:", err);
      const detail = err instanceof Error ? err.message : "Could not save post.";
      toast.error(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-shell font-sans">
      <Navbar />
      <main className="mx-auto w-full px-4 py-4 sm:px-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl mr-2">
              Chatter
            </h1>
            <SegmentButton
              label="Posts"
              isActive={activeTab === "posts"}
              onClick={() => openChatterTab("posts")}
            />
            <SegmentButton
              label="Private"
              isActive={activeTab === "private"}
              onClick={() => openChatterTab("private")}
            />
            <SegmentButton
              label="Task Updates"
              isActive={activeTab === "task-updates"}
              onClick={() => openChatterTab("task-updates")}
            />
          </div>
          <div className="flex items-center gap-3 text-slate-600">
            <div className="relative">
              <button type="button" className="ui-chip-button inline-flex items-center gap-2">
                {weekLabel}
                <CalendarDays className="h-4 w-4 text-slate-500" />
              </button>
              <input
                type="date"
                aria-label="Select chatter date range reference"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={currentDate.toISOString().split("T")[0]}
                onChange={handleDateChange}
                onClick={(event) => {
                  if ("showPicker" in event.currentTarget) {
                    try {
                      event.currentTarget.showPicker();
                    } catch {}
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="ui-icon-button h-8 w-8 border border-slate-300 bg-white"
              title="Filter posts for selected week"
              onClick={() => {
                const weekStart = getMondayOfWeek(currentDate);
                setActiveWeekStart(weekStart);
                void reloadPosts(weekStart);
              }}
            >
              <Search className="h-4 w-4 text-slate-500" />
            </button>
            <button
              type="button"
              onClick={() => setIsCreatePostOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
              aria-label="Create new chatter post"
            >
              <PlusSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Create Post</span>
            </button>
          </div>
        </div>

        {activeTab === "posts" ? (
          <section className="mt-3 space-y-2.5">
            {postsLoading ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                Loading chatter…
              </div>
            ) : null}
            {activeWeekStart ? (
              <div className="mb-3 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                <span>Showing posts for week of {weekLabel}</span>
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => {
                    setActiveWeekStart(null);
                    void reloadPosts(null);
                  }}
                >
                  Clear filter
                </button>
              </div>
            ) : null}
            {!postsLoading && sortedPosts.length === 0 ? (
              postsLoadError ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                  <p>
                    No chatter posts loaded. Ensure the backend is running,{" "}
                    <code className="rounded bg-slate-200 px-1">NEXT_PUBLIC_API_BASE_URL</code> points at it (not an older
                    deploy missing <code className="rounded bg-slate-200 px-1">/chatter-posts</code>), the chatter table
                    has rows, or check the browser network tab for errors.
                  </p>
                  <pre className="mt-3 max-h-48 overflow-auto text-left font-mono text-[11px] leading-snug text-red-700 whitespace-pre-wrap break-words">
                    {postsLoadError}
                  </pre>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
                  {activeWeekStart
                    ? `No chatter posts found for the week of ${weekLabel}.`
                    : 'No chatter posts yet.'}
                </div>
              )
            ) : null}
            {sortedPosts.map((post, postIndex) => (
              <div
                key={`${post.id}-${postIndex}`}
                className={focusedPostId === post.id ? "rounded-xl ring-2 ring-blue-400 ring-offset-2" : ""}
              >
              <ChatterCard
                post={post}
                mentionUsers={mentionUsersDirectory}
                focusCommentId={focusedPostId === post.id ? urlCommentId : null}
                isComposerOpen={openComposerPostId === post.id}
                draftComment={draftByPostId[post.id] ?? ""}
                isSubmittingComment={submittingCommentPostId === post.id}
                onOpenComposer={() => openComposer(post.id)}
                onDraftChange={(value) => changeDraft(post.id, value)}
                onMentionIdsChange={(ids) => {
                  commentMentionIdsRef.current[post.id] = ids;
                }}
                onSubmitComment={() => submitComment(post.id)}
                currentUserId={currentUserId}
                onLike={handleLikePost}
                onEditPost={handleEditPost}
                onDeletePost={handleDeletePost}
                onDeleteComment={handleDeleteComment}
                onBecomeVisible={queueMarkPostSeen}
              />
              </div>
            ))}
            {hasMorePosts ? (
              <div
                ref={loadMoreSentinelRef}
                className="flex justify-center py-4"
                aria-hidden={!loadingMore}
              >
                {loadingMore ? (
                  <p className="text-sm text-slate-500">Loading more posts…</p>
                ) : (
                  <span className="h-1 w-1" />
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "private" ? (
          <section className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
            <div className="ui-surface min-w-0 p-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Mentioned You</h2>
              <div className="space-y-2">
                {privateMentions.length === 0 ? (
                  <p className="text-sm text-slate-500">No mentions for you yet.</p>
                ) : (
                  privateMentions.map((item) => (
                    <PrivateChatterEntry
                      key={`mention-${item.id}`}
                      item={item}
                      mentionUsersDirectory={mentionUsersDirectory}
                      onOpen={openDiscussion}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="ui-surface min-w-0 p-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Your Posted Comments</h2>
              <div className="space-y-2">
                {privateComments.length === 0 ? (
                  <p className="text-sm text-slate-500">No comments posted yet.</p>
                ) : (
                  privateComments.map((item) => (
                    <PrivateChatterEntry
                      key={`my-comment-${item.id}`}
                      item={item}
                      mentionUsersDirectory={mentionUsersDirectory}
                      onOpen={openDiscussion}
                    />
                  ))
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "task-updates" ? (
          <section className="ui-surface mt-3 p-3">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Task Updates</h2>
            <div className="space-y-3">
              {taskUpdates.length === 0 ? (
                <p className="text-sm text-slate-500">No tasks with chatter activity yet.</p>
              ) : null}
              {taskUpdates.map((task) => {
                const isOpen = openTaskId === task.id;
                return (
                  <div key={task.id} className="rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenTaskId((prev) => (prev === task.id ? null : task.id))}
                      className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left hover:bg-slate-100 transition-colors"
                    >
                      <div>
                        <span className="text-sm font-semibold text-slate-800">{task.taskName}</span>
                        <p className="text-xs text-slate-500">{task.projectName}</p>
                      </div>
                      <span className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                        {task.chats.length} chatter {task.chats.length === 1 ? "item" : "items"}
                      </span>
                    </button>
                    {isOpen ? (
                      <div className="space-y-2 p-3 bg-white">
                        {task.chats.length === 0 ? (
                          <p className="text-sm text-slate-500">No chatter posts for this task yet.</p>
                        ) : (
                          task.chats.map((chat) => (
                            <div
                              key={chat.id}
                              className="rounded-md border border-slate-100 bg-slate-50 p-3"
                            >
                              <button
                                type="button"
                                onClick={() => openDiscussion(chat.id)}
                                className="w-full text-left transition-colors hover:text-blue-700"
                              >
                                <p className="text-sm font-semibold text-slate-900">{chat.title}</p>
                                {chat.mention && chat.mention !== "—" ? (
                                  <p className="mt-0.5 text-xs font-medium text-blue-600">{chat.mention}</p>
                                ) : null}
                                <ChatterMentionText
                                  message={chat.message}
                                  users={resolveMentionUsersForDisplay(
                                    chat.message,
                                    chat.mentionedUsers,
                                    mentionUsersDirectory,
                                  )}
                                  className="mt-1.5 text-sm text-slate-700"
                                />
                                <p className="mt-2 text-xs text-slate-500 font-medium">
                                  {chat.author} · {chat.time}
                                </p>
                              </button>
                              {(chat.comments?.length ?? 0) > 0 ? (
                                <ul className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                                  {chat.comments.map((comment) => (
                                    <li key={comment.id} className="rounded border border-slate-200 bg-white px-2.5 py-2">
                                      <p className="text-xs font-semibold text-slate-800">{comment.author}</p>
                                      <ChatterMentionText
                                        message={comment.message}
                                        users={resolveMentionUsersForDisplay(
                                          comment.message,
                                          comment.mentionedUsers,
                                          mentionUsersDirectory,
                                        )}
                                        className="mt-1 text-sm text-slate-700"
                                      />
                                      <p className="mt-1 text-[10px] text-slate-500">
                                        {formatChatterTime(comment.createdAt)}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <CreatePostModal
          isOpen={isCreatePostOpen}
          onClose={() => setIsCreatePostOpen(false)}
          onSubmit={handleCreatePost}
          isSubmitting={isSubmitting}
        />

        {editingPost && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <h3 className="mb-3 text-base font-semibold text-slate-900">Edit Post</h3>
              <textarea
                value={editMessage}
                onChange={(e) => setEditMessage(e.target.value)}
                rows={6}
                className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPost(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit || !editMessage.trim()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSavingEdit ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
