"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { CalendarDays, Link2, MessageCircle, PlusSquare, Search, ThumbsUp, X } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import {
  createChatterComment,
  createChatterPost,
  listChatterMentionUsers,
  listChatterPosts,
  mapChatterPostDtoToFeedPost,
  mapCommentDtoToFeedComment,
} from "@/features/chatter/services/chatter-posts.api";
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

const PRIVATE_MENTION_SEED = [
  {
    id: "pm1",
    title: "RAMADA SIGNAGE FOR WORD OF ART @ JADDAF",
    projectName: "Ramada Signage",
    message: "Please find the attached BRI design and prepare the quote.",
    time: "6m ago",
  },
  {
    id: "pm2",
    title: "DUBAI HILLS KIOSK SIGNAGE UPDATE",
    projectName: "Dubai Hills Kiosk",
    message: "Client requested revised finish sample. Share options by EOD.",
    time: "2h ago",
  },
  {
    id: "pm3",
    title: "BUS SHELTER CAMPAIGN - PHASE 2",
    projectName: "Bus Shelter Campaign",
    message: "Media file package uploaded. Awaiting final QA check.",
    time: "2 days ago",
  },
  {
    id: "pm4",
    title: "JEBEL ALI YARD SAFETY BOARD",
    projectName: "Jebel Ali Yard",
    message: "Please replace icons with approved HSE set from library.",
    time: "2 days ago",
  },
];

const PRIVATE_COMMENT_SEED = [
  {
    id: "pc1",
    title: "SHARJAH MALL WAYFINDING PANEL",
    projectName: "Sharjah Mall",
    message: "Best price draft already sent for confirmation.",
    time: "1 day ago",
  },
  {
    id: "pc2",
    title: "EYE ZONE REVOLI SIGNAGE @ DUBAI MALL",
    projectName: "Eye Zone Revoli",
    message: "Quotation shared with alternate material option.",
    time: "1 day ago",
  },
  {
    id: "pc3",
    title: "MARINA DIGITAL SCREEN CONTENT",
    projectName: "Marina Digital Screen",
    message: "Copy lock done. Proceeding with animation export.",
    time: "2 days ago",
  },
];

const TASK_NAMES = [
  "Retail Store Redesign",
  "Office Complex Phase 1",
  "Boutique Showroom",
  "Residential Tower A",
  "Mall Kiosk Design",
  "Public Library Renovation",
  "Flagship Store",
  "Commercial Plaza",
  "Spa & Fitness Facility",
  "University Campus Building",
  "Outlet Wayfinding Upgrade",
  "Corporate HQ Lobby Fitout",
  "Window Display Concepts",
  "Waterfront Visitor Center",
  "Experience Zone Counters",
  "Specialty Clinic Expansion",
  "Seasonal Promotion Fixtures",
  "Resort Signage Masterplan",
];

function buildTaskChatterRecords(taskName, taskIndex) {
  const samples = [
    "Initial brief reviewed and ownership assigned.",
    "First draft posted for internal review.",
    "Client feedback received and noted.",
    "Revisions completed and updated artwork shared.",
    "Material/production details validated with vendor.",
    "Final approval pending sign-off from project lead.",
  ];

  return samples.map((message, idx) => ({
    id: `${taskName}-${idx}`,
    title: `${taskName} - Update ${idx + 1}`,
    message,
    author: idx % 2 === 0 ? "Aneesh Raghu" : "Delbin Delbin",
    time: `${(taskIndex % 3) + idx + 1}h ago`,
  }));
}

function toFormattedHtml(text) {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/gs, '<del>$1</del>')
    .replace(/__(.+?)__/gs, '<u>$1</u>')
    .replace(/\*(.+?)\*/gs, '<em>$1</em>')
    .replace(/\n/g, '<br />')
}

function FormattedText({ text, className }) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: toFormattedHtml(text) }}
    />
  )
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
  const [taskSearch, setTaskSearch] = useState("");
  const [taskResults, setTaskResults] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedTaskLabel, setSelectedTaskLabel] = useState("");
  const [showTaskResults, setShowTaskResults] = useState(false);
  const taskSearchTimeout = useRef(null);

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
    const label = `${task.taskNo ?? ''} — ${task.title ?? task.opNo ?? ''}`.trim().replace(/^—\s*/, '')
    setSelectedTaskId(task.id)
    setSelectedTaskLabel(label)
    setTaskSearch(label)
    setShowTaskResults(false)
  }

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
    setTaskSearch("");
    setTaskResults([]);
    setSelectedTaskId(null);
    setSelectedTaskLabel("");
    setShowTaskResults(false);

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
                        <span className="font-medium text-blue-600">{t.taskNo}</span>
                        {t.title ? <span className="ml-2 text-slate-600">{t.title}</span> : null}
                        {t.opNo ? <span className="ml-1 text-slate-400">({t.opNo})</span> : null}
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
  const textareaRef = useRef(null)

  function applyFormat(syntax) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = draftComment.slice(start, end)
    const [open, close] = Array.isArray(syntax) ? syntax : [syntax, syntax]
    const newText = draftComment.slice(0, start) + open + selected + close + draftComment.slice(end)
    onDraftChange(newText)
    setTimeout(() => {
      el.focus()
      const cursor = selected ? end + open.length : start + open.length
      el.setSelectionRange(cursor, cursor)
    }, 0)
  }

  function insertAtCursor(text) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const newText = draftComment.slice(0, start) + text + draftComment.slice(start)
    onDraftChange(newText)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + text.length, start + text.length)
    }, 0)
  }

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
                {post.mention && post.mention !== '—' ? (
                  <p className="text-sm font-medium text-blue-600 mb-1">{post.mention}</p>
                ) : null}
                <FormattedText text={post.message} className="text-sm text-slate-800 leading-relaxed" />
                
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
        
        {(post.postType === "Task Updates" || !post.postType) ? (
          <aside className="hidden sm:flex flex-col justify-between w-[220px] shrink-0 border-l-[3px] border-slate-800 pl-4 py-1 text-xs">
            <div className="space-y-1.5 text-slate-800">
              <p>
                <span className="font-medium">Project Name:</span>{' '}
                {post.projectName && post.projectName !== '—'
                  ? post.projectName
                  : <span className="text-slate-400 italic">No project linked</span>}
              </p>
              <p>
                <span className="font-medium">Designer Assigned:</span>{' '}
                {post.designerName && post.designerName !== '—'
                  ? post.designerName
                  : <span className="text-slate-400 italic">Unassigned</span>}
              </p>
              <div className="flex items-center gap-2">
                <span className="font-medium">Priority:</span>
                <span className={`inline-block h-3.5 w-3.5 rounded-full ${PRIORITY_STYLES[post.priority]}`} />
                <span className="capitalize text-slate-600">{post.priority}</span>
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
              <FormattedText text={comment.message} className="mt-0.5 block text-slate-700" />
            </li>
          ))}
        </ul>
      ) : null}
      {isComposerOpen ? (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <textarea
            ref={textareaRef}
            value={draftComment}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Write a comment..."
            className="min-h-[80px] w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1 text-sm font-medium text-slate-500">
              <button type="button" title="Bold (**text**)" onClick={() => applyFormat(['**', '**'])} className="rounded px-1.5 py-0.5 font-bold hover:bg-slate-200 hover:text-slate-800 transition-colors">B</button>
              <button type="button" title="Italic (*text*)" onClick={() => applyFormat(['*', '*'])} className="rounded px-1.5 py-0.5 italic hover:bg-slate-200 hover:text-slate-800 transition-colors">I</button>
              <button type="button" title="Underline (__text__)" onClick={() => applyFormat(['__', '__'])} className="rounded px-1.5 py-0.5 underline hover:bg-slate-200 hover:text-slate-800 transition-colors">U</button>
              <button type="button" title="Strikethrough (~~text~~)" onClick={() => applyFormat(['~~', '~~'])} className="rounded px-1.5 py-0.5 line-through hover:bg-slate-200 hover:text-slate-800 transition-colors">S</button>
              <span className="mx-1 text-slate-300">|</span>
              <button type="button" title="Mention someone" onClick={() => insertAtCursor('@')} className="rounded px-1.5 py-0.5 hover:bg-slate-200 hover:text-slate-800 transition-colors">@</button>
              <button type="button" title="Add tag" onClick={() => insertAtCursor('#')} className="rounded px-1.5 py-0.5 hover:bg-slate-200 hover:text-slate-800 transition-colors">#</button>
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
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postsLoadError, setPostsLoadError] = useState(null);
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState(null);

  const currentUserId = useMemo(() => getSession()?.id ?? null, []);
  const currentUserName = useMemo(() => getSession()?.fullName ?? '', []);

  useEffect(() => {
    let cancelled = false;
    listChatterPosts({ limit: 500 })
      .then((rows) => {
        if (cancelled) return;
        if (!Array.isArray(rows)) {
          setPosts([]);
          setPostsLoadError(
            `Unexpected response: expected a JSON array, received ${rows === null || rows === undefined ? String(rows) : typeof rows}`,
          );
          return;
        }
        setPostsLoadError(null);
        const userId = getSession()?.id ?? null;
        setPosts(rows.map((row) => mapChatterPostDtoToFeedPost(row, userId)));
      })
      .catch((err) => {
        if (cancelled) return;
        setPosts([]);
        setPostsLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
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
    const name = currentUserName.trim().toLowerCase()
    const dynamicMentions = name
      ? sortedPosts
          .filter((post) => String(post.mention ?? '').toLowerCase().includes(`@${name}`))
          .map((post) => ({
            id: `mention-${post.id}`,
            title: post.title,
            projectName: post.projectName,
            message: post.message,
            time: post.time,
          }))
      : []
    return dynamicMentions.length > 0 ? dynamicMentions : PRIVATE_MENTION_SEED
  }, [sortedPosts, currentUserName]);

  const privateComments = useMemo(() => {
    // Posts the current user authored (matched by authorId)
    const myPosts = currentUserId
      ? sortedPosts
          .filter((post) => post.authorId === currentUserId)
          .map((post) => ({
            id: `${post.id}-direct`,
            title: post.title,
            projectName: post.projectName,
            message: post.message,
            time: post.time,
          }))
      : []

    // Posts where the current user left a comment (mapper sets author to 'You' for currentUserId)
    const commentedPosts = sortedPosts
      .filter((post) =>
        (post.comments ?? []).some(
          (c) => c.authorId === currentUserId || c.author === 'You',
        ),
      )
      .map((post) => {
        const mine = (post.comments ?? []).find(
          (c) => c.authorId === currentUserId || c.author === 'You',
        )
        return {
          id: post.id,
          title: post.title,
          projectName: post.projectName,
          message: mine?.message ?? '',
          time: 'just now',
        }
      })

    const dynamic = [...myPosts, ...commentedPosts]
    return dynamic.length > 0 ? dynamic : PRIVATE_COMMENT_SEED
  }, [sortedPosts, currentUserId]);

  const taskUpdates = useMemo(() => {
    const taskPosts = sortedPosts.filter((p) => p.postType === 'Task Updates' || p.taskId)
    if (taskPosts.length === 0) {
      // Fallback to demo data when no real task posts exist
      return TASK_NAMES.map((taskName, taskIndex) => ({
        id: taskName,
        taskName,
        chats: buildTaskChatterRecords(taskName, taskIndex),
      }))
    }
    const byTask = new Map()
    for (const post of taskPosts) {
      const key = post.taskId || `title-${post.title}`
      const label = post.projectName && post.projectName !== '—'
        ? post.projectName
        : post.title || post.taskId || 'Unknown Task'
      if (!byTask.has(key)) byTask.set(key, { id: key, taskName: label, chats: [] })
      byTask.get(key).chats.push({
        id: post.id,
        title: post.title,
        message: post.message,
        author: post.author,
        time: post.time,
      })
    }
    return [...byTask.values()]
  }, [sortedPosts]);

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
        taskId: postData.taskId || null,
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
      // Keep local File objects as fallback for optimistic rendering
      // (in case the server response doesn't include signed URLs yet)
      if (postData.fileAttachments?.length && (!newFeedPost.fileAttachments || newFeedPost.fileAttachments.length === 0)) {
        newFeedPost._localFiles = postData.fileAttachments;
      }
      setPosts((prev) => [newFeedPost, ...prev]);
      setIsCreatePostOpen(false);
      setActiveTab("posts");
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
            {sortedPosts.length === 0 ? (
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
              <ChatterCard
                key={`${post.id}-${postIndex}`}
                post={post}
                isComposerOpen={openComposerPostId === post.id}
                draftComment={draftByPostId[post.id] ?? ""}
                isSubmittingComment={submittingCommentPostId === post.id}
                onOpenComposer={() => openComposer(post.id)}
                onDraftChange={(value) => changeDraft(post.id, value)}
                onSubmitComment={() => submitComment(post.id)}
              />
            ))}
          </section>
        ) : null}

        {activeTab === "private" ? (
          <section className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="ui-surface p-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Mentioned to You</h2>
              <div className="space-y-2">
                {privateMentions.length === 0 ? (
                  <p className="text-sm text-slate-500">No mentions for @{CURRENT_USER}.</p>
                ) : (
                  privateMentions.map((item) => (
                    <div key={`mention-${item.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-700">{item.message}</p>
                      <p className="mt-2 text-xs text-slate-500">{item.time}</p>
                    </div>
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
                    <div key={`my-comment-${item.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-700">{item.message}</p>
                      <p className="mt-2 text-xs font-medium text-blue-600">{item.projectName}</p>
                    </div>
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
              {taskUpdates.map((task) => {
                const isOpen = openTaskId === task.id;
                return (
                  <div key={task.id} className="rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenTaskId((prev) => (prev === task.id ? null : task.id))}
                      className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left hover:bg-slate-100 transition-colors"
                    >
                      <span className="text-sm font-semibold text-slate-800">{task.taskName}</span>
                      <span className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                        {task.chats.length} chatter {task.chats.length > 1 ? "items" : "item"}
                      </span>
                    </button>
                    {isOpen ? (
                      <div className="space-y-2 p-3 bg-white">
                        {task.chats.map((chat) => (
                          <div key={chat.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                            <p className="text-sm font-semibold text-slate-900">{chat.title}</p>
                            <p className="mt-1.5 text-sm text-slate-700">{chat.message}</p>
                            <p className="mt-2 text-xs text-slate-500 font-medium">
                              {chat.author} - {chat.time}
                            </p>
                          </div>
                        ))}
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
