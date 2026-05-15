"use client";

import { useMemo, useState, useEffect } from "react";
import { CalendarDays, Link2, MessageCircle, MessageSquareText, PlusSquare, Search, ThumbsUp, X } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import {
  createChatterPost,
  listChatterMentionUsers,
  listChatterPosts,
  mapChatterPostDtoToFeedPost,
} from "@/features/chatter/services/chatter-posts.api";
import {
  createLinkAttachment,
  isValidExternalUrl,
  normalizeExternalUrl,
} from "../utils/chatterLinkAttachments";

const CURRENT_USER = "Delbin Delbin";

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
  const fileAttachments = post.fileAttachments?.length
    ? post.fileAttachments
    : post.attachment
      ? [post.attachment]
      : [];
  const linkAttachments = post.linkAttachments ?? [];

  if (fileAttachments.length === 0 && linkAttachments.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {fileAttachments.map((file, index) => (
        <div key={`${file.name}-${index}`}>
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
    setFileAttachments((prev) => [...prev, ...Array.from(fileList)]);
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
              disabled={!draftComment.trim()}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              Comment
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
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 3));
  
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [postsLoadError, setPostsLoadError] = useState(null);

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
        setPosts(rows.map((row) => mapChatterPostDtoToFeedPost(row)));
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
    const dynamicMentions = sortedPosts
      .filter((post) =>
        String(post.mention ?? "").toLowerCase().includes(`@${CURRENT_USER}`.toLowerCase()),
      )
      .map((post) => ({
        id: `mention-${post.id}`,
        title: post.title,
        projectName: post.projectName,
        message: post.message,
        time: post.time,
      }));

    return [...dynamicMentions, ...PRIVATE_MENTION_SEED];
  }, [sortedPosts]);

  const privateComments = useMemo(() => {
    const commentedPosts = sortedPosts
      .filter((post) =>
        (post.comments ?? []).some(
          (comment) => String(comment.author ?? "").toLowerCase() === "you",
        ),
      )
      .map((post) => {
        const latestMyComment = (post.comments ?? []).find(
          (comment) => String(comment.author ?? "").toLowerCase() === "you",
        );
        return {
          id: post.id,
          title: post.title,
          projectName: post.projectName,
          message: latestMyComment?.message ?? "",
          time: "just now",
        };
      });

    const directCommentRecords = sortedPosts
      .filter((post) => String(post.author ?? "").toLowerCase() === "you")
      .map((post) => ({
        id: `${post.id}-direct`,
        title: post.title,
        projectName: post.projectName,
        message: post.message,
        time: post.time,
      }));

    return [...directCommentRecords, ...commentedPosts, ...PRIVATE_COMMENT_SEED];
  }, [sortedPosts]);

  const taskUpdates = useMemo(
    () =>
      TASK_NAMES.map((taskName, taskIndex) => ({
        id: taskName,
        taskName,
        chats: buildTaskChatterRecords(taskName, taskIndex),
      })),
    [],
  );

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

  const submitComment = (postId) => {
    const content = (draftByPostId[postId] ?? "").trim();
    if (!content) return;

    const now = new Date().toISOString();
    setPosts((prev) => {
      const sourcePost = prev.find((post) => post.id === postId);
      if (!sourcePost) return prev;

      const updatedExisting = prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              time: "just now",
              updatedAt: now,
              comments: [
                {
                  id: `${postId}-comment-${Date.now()}`,
                  message: content,
                  author: "You",
                  createdAt: now,
                },
                ...(post.comments ?? []),
              ],
            }
          : post,
      );

      const commentRecord = {
        id: `c-${postId}-${Date.now()}`,
        title: `COMMENT UPDATE - ${sourcePost.title}`,
        author: "You",
        time: "just now",
        mention: sourcePost.mention,
        message: content,
        projectName: sourcePost.projectName,
        responsibleUser: sourcePost.responsibleUser,
        priority: sourcePost.priority,
        seenBy: 1,
        comments: [],
        updatedAt: now,
      };

      return [commentRecord, ...updatedExisting];
    });
    setDraftByPostId((prev) => ({ ...prev, [postId]: "" }));
    setOpenComposerPostId(null);
  };

  const handleCreatePost = async (postData) => {
    setIsSubmitting(true);
    try {
      const createdDto = await createChatterPost({
        title: postData.title,
        message: postData.message,
        postType: postData.postType,
        priority: postData.priority,
        mentionUserId: postData.mentionUserId || null,
        // authorId: ... (should be from auth context if available)
      }, postData.fileAttachments);

      const newFeedPost = mapChatterPostDtoToFeedPost(createdDto);
      if (postData.mention?.trim()) {
        newFeedPost.mention = postData.mention.trim().startsWith("@")
          ? postData.mention.trim()
          : `@${postData.mention.trim()}`;
      }
      setPosts((prev) => [newFeedPost, ...prev]);
      setIsCreatePostOpen(false);
      setActiveTab("posts");
      setToastMessage("Post created successfully!");
    } catch (err) {
      console.error("Failed to create post:", err);
      setToastMessage("Error: Could not save post to database.");
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setToastMessage(null), 3000);
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

        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      </main>
    </div>
  );
}
