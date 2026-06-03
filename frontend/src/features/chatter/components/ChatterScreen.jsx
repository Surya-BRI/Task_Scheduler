"use client";

import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { CalendarDays, Link2, MessageCircle, PlusSquare, Search, ThumbsUp, X } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import {
  createChatterComment,
  createChatterPost,
  formatChatterTime,
  listChatterMentionUsers,
  listChatterPosts,
  mapChatterPostDtoToFeedPost,
  mapCommentDtoToFeedComment,
} from "@/features/chatter/services/chatter-posts.api";
import { emitChatterRefresh, onChatterRefresh } from "@/features/chatter/utils/chatter-events";
import { apiClient } from "@/lib/api-client";
import { getSession } from "@/lib/mock-auth";
import {
  createLinkAttachment,
  isValidExternalUrl,
  normalizeExternalUrl,
} from "../utils/chatterLinkAttachments";

const PRIORITY_STYLES = {
  low: "bg-emerald-500",
  medium: "bg-amber-400",
  high: "bg-red-500",
};

function formatTaskCatalogLabel(task) {
  const title = String(task?.title ?? "").trim();
  const taskNo = String(task?.taskNo ?? "").trim();
  const opNo = String(task?.opNo ?? "").trim();
  if (title && taskNo) return `${title} (${taskNo})`;
  if (title) return title;
  if (taskNo) return taskNo;
  if (opNo) return opNo;
  return "Task";
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
  const [mentionUserId, setMentionUserId] = useState(null);
  const [mentionUsers, setMentionUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [postType, setPostType] = useState("Posts");
  const [fileAttachments, setFileAttachments] = useState([]);
  const [linkAttachments, setLinkAttachments] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [errors, setErrors] = useState({});

  const handleMentionChange = (e) => {
    const val = e.target.value;
    setMention(val);
    setMentionUserId(null);
    if (val.includes("@")) setShowMentions(true);
    else setShowMentions(false);
  };

  const selectMention = (user) => {
    setMention(`@${user.fullName}`);
    setMentionUserId(user.id);
    setShowMentions(false);
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

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setMention("");
    setMentionUserId(null);
    setMessage("");
    setPriority("Medium");
    setPostType("Posts");
    setFileAttachments([]);
    setLinkAttachments([]);
    setLinkInput("");
    setShowMentions(false);
    setErrors({});

    let cancelled = false;
    listChatterMentionUsers()
      .then((users) => {
        if (!cancelled && Array.isArray(users)) setMentionUsers(users);
      })
      .catch(() => {
        if (!cancelled) setMentionUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

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
    onSubmit({
      title,
      mention,
      mentionUserId,
      message,
      priority,
      postType,
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
            <label className="mb-1 block text-sm font-semibold text-slate-700">Mention User</label>
            <div className="relative">
              <input
                type="text"
                value={mention}
                onChange={handleMentionChange}
                placeholder="@username"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
              />
              {showMentions && mentionUsers.length > 0 ? (
                <ul className="ui-popover-panel absolute z-20 mt-1 max-h-36 w-full overflow-y-auto">
                  {mentionUsers
                    .filter((user) =>
                      `@${user.fullName}`.toLowerCase().includes(mention.toLowerCase()),
                    )
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
            <textarea
              value={message}
              maxLength={500}
              onChange={(e) => setMessage(e.target.value)}
              className={`min-h-[140px] w-full resize-y rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/25 ${
                errors.message ? "border-red-300 focus:border-red-400" : "border-slate-300 focus:border-blue-500"
              }`}
              placeholder="Write your post details..."
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
            <label className="mb-2 block text-sm font-semibold text-slate-700">Priority Level</label>
            <div className="grid grid-cols-3 gap-2">
              {["High", "Medium", "Low"].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setPriority(level)}
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

function ChatterCard({
  post,
  isComposerOpen,
  draftComment,
  isSubmittingComment,
  onOpenComposer,
  onDraftChange,
  onSubmitComment,
}) {
  const hasComments = (post.comments?.length ?? 0) > 0;

  return (
    <article className="ui-surface ui-card-pad flex flex-col gap-3">
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3">
            {post.author === "Fahad Quazi" ? (
              <img src="https://ui-avatars.com/api/?name=Fahad+Quazi&background=random" alt="Fahad" className="h-10 w-10 rounded-full object-cover shrink-0" />
            ) : post.author === "Delbin Delbin" ? (
              <img src="https://ui-avatars.com/api/?name=Delbin+Delbin&background=random" alt="Delbin" className="h-10 w-10 rounded-full object-cover shrink-0" />
            ) : (
              <div className="h-10 w-10 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold italic text-lg shrink-0">
                BR
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                <p className="text-[15px] font-semibold uppercase tracking-tight text-blue-600">
                  {post.title}
                </p>
                <span className="text-sm font-medium text-slate-600">- {post.author}</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{post.time}</p>
              
              <div className="mt-3">
                <p className="text-sm font-medium text-blue-600 mb-1">{post.mention}</p>
                <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{post.message}</p>
                
                <ChatterPostAttachments post={post} />

                <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-slate-500">
                  <button type="button" className="flex items-center gap-1.5 hover:text-slate-800 transition-colors">
                    <ThumbsUp className="w-4 h-4" /> Like
                  </button>
                  <button
                    type="button"
                    className={`flex items-center gap-1.5 transition-colors ${hasComments ? "text-blue-600 hover:text-blue-700" : "hover:text-slate-800"}`}
                    onClick={onOpenComposer}
                  >
                    <MessageCircle className="w-4 h-4" /> {hasComments ? "Commented" : "Comment"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {post.postType === "Task Updates" || !post.postType ? (
          <aside className="hidden sm:flex flex-col justify-between w-[220px] shrink-0 border-l-[3px] border-slate-800 pl-4 py-1 text-xs">
            <div className="space-y-1.5 text-slate-800">
              <p><span className="font-medium">Project Name:</span> {post.projectName}</p>
              <p><span className="font-medium">Responsible User:</span> {post.responsibleUser}</p>
              <div className="flex items-center gap-2">
                <span className="font-medium">Priority Label:</span>
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full ${PRIORITY_STYLES[post.priority]}`}
                />
              </div>
            </div>
            <p className="text-right text-slate-500 mt-4 pr-2">Seen by {post.seenBy}</p>
          </aside>
        ) : null}
      </div>
      {hasComments ? (
        <ul className="mt-1 space-y-2 border-t border-slate-100 pt-3">
          {(post.comments ?? []).map((comment) => (
            <li key={comment.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <p className="font-semibold text-slate-800">{comment.author}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{comment.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {isComposerOpen ? (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <textarea
            value={draftComment}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Write a comment..."
            className="min-h-[80px] w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
              <span className="cursor-pointer hover:text-slate-800">B</span>
              <span className="cursor-pointer hover:text-slate-800 italic">I</span>
              <span className="cursor-pointer hover:text-slate-800 underline">U</span>
              <span className="cursor-pointer hover:text-slate-800 line-through">S</span>
              <span className="cursor-pointer hover:text-slate-800">@</span>
              <span className="cursor-pointer hover:text-slate-800">#</span>
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
  const [posts, setPosts] = useState([]);
  const [openComposerPostId, setOpenComposerPostId] = useState(null);
  const [draftByPostId, setDraftByPostId] = useState({});
  const [activeTab, setActiveTab] = useState("posts");
  const [openTaskId, setOpenTaskId] = useState(null);
  const [focusedPostId, setFocusedPostId] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [taskCatalog, setTaskCatalog] = useState([]);
  
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postsLoadError, setPostsLoadError] = useState(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState(null);

  const currentUserId = useMemo(() => getSession()?.id ?? null, []);

  const reloadPosts = async () => {
    setPostsLoading(true);
    try {
      const rows = await listChatterPosts({ limit: 500 });
      if (!Array.isArray(rows)) {
        setPosts([]);
        setPostsLoadError(
          `Unexpected response: expected a JSON array, received ${rows === null || rows === undefined ? String(rows) : typeof rows}`,
        );
        return;
      }
      setPostsLoadError(null);
      setPosts(rows.map((row) => mapChatterPostDtoToFeedPost(row, currentUserId)));
    } catch (err) {
      setPosts([]);
      setPostsLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setPostsLoading(false);
    }
  };

  useEffect(() => {
    void reloadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  useEffect(() => {
    return onChatterRefresh(() => {
      void reloadPosts();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  useEffect(() => {
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
  }, []);

  const weekLabel = useMemo(() => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - 3);
    const end = new Date(currentDate);
    end.setDate(end.getDate() + 3);
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
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
    return sortedPosts
      .filter((post) => {
        if (post.mentionUserId === currentUserId) return true;
        return (post.comments ?? []).some((comment) => comment.mentionUserId === currentUserId);
      })
      .map((post) => {
        const mentionedComment = (post.comments ?? []).find((c) => c.mentionUserId === currentUserId);
        const isPostMention = post.mentionUserId === currentUserId;
        return {
          id: `${post.id}-${mentionedComment?.id ?? "post"}`,
          postId: post.id,
          title: post.title,
          taskName: post.taskName,
          projectName: post.projectName,
          message: mentionedComment?.message ?? post.message,
          time: isPostMention ? post.time : formatChatterTime(mentionedComment?.createdAt),
          updatedAt: post.updatedAt,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
      );
  }, [sortedPosts, currentUserId]);

  const privateComments = useMemo(() => {
    if (!currentUserId) return [];
    return sortedPosts
      .filter((post) => (post.comments ?? []).some((comment) => comment.authorId === currentUserId))
      .map((post) => {
        const myComments = (post.comments ?? []).filter((comment) => comment.authorId === currentUserId);
        const latestMyComment = [...myComments].sort(
          (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
        )[0];
        return {
          id: `${post.id}-${latestMyComment?.id ?? post.id}`,
          postId: post.id,
          title: post.title,
          taskName: post.taskName,
          projectName: post.projectName,
          message: latestMyComment?.message ?? post.message,
          time: formatChatterTime(latestMyComment?.createdAt ?? post.updatedAt),
          updatedAt: latestMyComment?.createdAt ?? post.updatedAt,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
      );
  }, [sortedPosts, currentUserId]);

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

  const openDiscussion = (postId) => {
    setFocusedPostId(postId);
    setActiveTab("posts");
    setOpenComposerPostId(postId);
  };

  const submitComment = async (postId) => {
    const content = (draftByPostId[postId] ?? "").trim();
    if (!content || submittingCommentPostId) return;

    setSubmittingCommentPostId(postId);
    try {
      const created = await createChatterComment(postId, content);
      const feedComment = mapCommentDtoToFeedComment(created, currentUserId);
      const now = new Date().toISOString();
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                updatedAt: now,
                comments: [feedComment, ...(post.comments ?? [])],
              }
            : post,
        ),
      );
      setDraftByPostId((prev) => ({ ...prev, [postId]: "" }));
      setOpenComposerPostId(null);
      emitChatterRefresh({ postId });
    } catch (err) {
      console.error("Failed to save comment:", err);
      toast.error("Could not save comment. Please try again.");
    } finally {
      setSubmittingCommentPostId(null);
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
      const createdDto = await createChatterPost({
        title: postData.title,
        message: postData.message,
        postType: postData.postType,
        priority: postData.priority,
        mentionUserId: postData.mentionUserId || null,
      }, postData.fileAttachments, postData.linkAttachments);

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
      if (postData.mention?.trim()) {
        newFeedPost.mention = postData.mention.trim().startsWith("@")
          ? postData.mention.trim()
          : `@${postData.mention.trim()}`;
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
      emitChatterRefresh({ taskId: createdDto.taskId, postId: createdDto.id });
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
              onClick={() => setActiveTab("posts")}
            />
            <SegmentButton
              label="Private"
              isActive={activeTab === "private"}
              onClick={() => setActiveTab("private")}
            />
            <SegmentButton
              label="Task Updates"
              isActive={activeTab === "task-updates"}
              onClick={() => setActiveTab("task-updates")}
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
            <button type="button" className="ui-icon-button h-8 w-8 border border-slate-300 bg-white">
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
            {!postsLoading && sortedPosts.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                <p>
                  No chatter posts loaded. Ensure the backend is running,{" "}
                  <code className="rounded bg-slate-200 px-1">NEXT_PUBLIC_API_BASE_URL</code> points at it (not an older
                  deploy missing <code className="rounded bg-slate-200 px-1">/chatter-posts</code>), the chatter table
                  has rows, or check the browser network tab for errors.
                </p>
                {postsLoadError ? (
                  <pre className="mt-3 max-h-48 overflow-auto text-left font-mono text-[11px] leading-snug text-red-700 whitespace-pre-wrap break-words">
                    {postsLoadError}
                  </pre>
                ) : null}
              </div>
            ) : null}
            {sortedPosts.map((post, postIndex) => (
              <div
                key={`${post.id}-${postIndex}`}
                className={focusedPostId === post.id ? "rounded-xl ring-2 ring-blue-400 ring-offset-2" : ""}
              >
              <ChatterCard
                post={post}
                isComposerOpen={openComposerPostId === post.id}
                draftComment={draftByPostId[post.id] ?? ""}
                isSubmittingComment={submittingCommentPostId === post.id}
                onOpenComposer={() => openComposer(post.id)}
                onDraftChange={(value) => changeDraft(post.id, value)}
                onSubmitComment={() => submitComment(post.id)}
              />
              </div>
            ))}
          </section>
        ) : null}

        {activeTab === "private" ? (
          <section className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="ui-surface p-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Mentioned to You</h2>
              <div className="space-y-2">
                {privateMentions.length === 0 ? (
                  <p className="text-sm text-slate-500">No mentions for you yet.</p>
                ) : (
                  privateMentions.map((item) => (
                    <button
                      type="button"
                      key={`mention-${item.id}`}
                      onClick={() => openDiscussion(item.postId)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-left shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      {item.taskName ? (
                        <p className="mt-0.5 text-xs font-medium text-blue-600">{item.taskName}</p>
                      ) : null}
                      <p className="mt-1 text-sm text-slate-700">{item.message}</p>
                      <p className="mt-2 text-xs text-slate-500">{item.projectName} · {item.time}</p>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="ui-surface p-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Your Posted Comments</h2>
              <div className="space-y-2">
                {privateComments.length === 0 ? (
                  <p className="text-sm text-slate-500">No comments posted yet.</p>
                ) : (
                  privateComments.map((item) => (
                    <button
                      type="button"
                      key={`my-comment-${item.id}`}
                      onClick={() => openDiscussion(item.postId)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-left shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      {item.taskName ? (
                        <p className="mt-0.5 text-xs font-medium text-blue-600">{item.taskName}</p>
                      ) : null}
                      <p className="mt-1 text-sm text-slate-700">{item.message}</p>
                      <p className="mt-2 text-xs font-medium text-blue-600">{item.projectName} · {item.time}</p>
                    </button>
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
                                <p className="mt-1.5 text-sm text-slate-700">{chat.message}</p>
                                <p className="mt-2 text-xs text-slate-500 font-medium">
                                  {chat.author} · {chat.time}
                                </p>
                              </button>
                              {(chat.comments?.length ?? 0) > 0 ? (
                                <ul className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                                  {chat.comments.map((comment) => (
                                    <li key={comment.id} className="rounded border border-slate-200 bg-white px-2.5 py-2">
                                      <p className="text-xs font-semibold text-slate-800">{comment.author}</p>
                                      <p className="mt-1 text-sm text-slate-700">{comment.message}</p>
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

      </main>
    </div>
  );
}
