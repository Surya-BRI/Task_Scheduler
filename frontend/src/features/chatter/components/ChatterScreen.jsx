"use client";

import { useMemo, useState, useEffect } from "react";
import { CalendarDays, MessageSquareText, PlusSquare, Search, ThumbsUp, MessageCircle, X } from "lucide-react";
import { Navbar } from "@/components/Navbar";

const CURRENT_USER = "Delbin Delbin";

const CHATTER_POSTS = [
  {
    id: "p1",
    title: "RAMADA SIGNAGE FOR WORD OF ART @ JADDAF",
    author: "Aneesh Raghu",
    time: "6m ago",
    mention: "@Delbin Delbin",
    message: "Please find the attached BRI design and prepare the quote.",
    projectName: "Ramada Signage",
    responsibleUser: "Aneesh Raghu",
    priority: "medium",
    seenBy: 3,
    comments: [],
  },
  {
    id: "p2",
    title: "SIGNAGE (REIGATE GRAMMAR SCHOOL) FOR ARADA @ SHJ",
    author: "Aneesh Raghu",
    time: "1h ago",
    mention: "@Anju Krishna",
    message: "Please provide best price.",
    projectName: "Reigate Grammar School",
    responsibleUser: "Anju Krishna",
    priority: "low",
    seenBy: 3,
    comments: [],
  },
  {
    id: "p3",
    title: "EYE ZONE REVOLI SIGNAGE @ DUBAI MALL",
    author: "Fahad Quazi",
    time: "03 Mar 2026 at 13:23",
    mention: "@Delbin Delbin",
    message: "Please share quotation at the earliest.",
    projectName: "Eye Zone Revoli",
    responsibleUser: "Fahad Quazi",
    priority: "high",
    seenBy: 3,
    comments: [],
  },
  {
    id: "p4",
    title: "DUBAI HILLS KIOSK SIGNAGE UPDATE",
    author: "Rahul Menon",
    time: "2h ago",
    mention: "@Delbin Delbin",
    message: "Client requested revised finish sample. Share options by EOD.",
    projectName: "Dubai Hills Kiosk",
    responsibleUser: "Rahul Menon",
    priority: "medium",
    seenBy: 5,
    comments: [],
  },
  {
    id: "p5",
    title: "SHARJAH MALL WAYFINDING PANEL",
    author: "Anju Krishna",
    time: "3h ago",
    mention: "@Delbin Delbin",
    message: "Artwork is approved, please initiate print-ready handoff.",
    projectName: "Sharjah Mall",
    responsibleUser: "Anju Krishna",
    priority: "low",
    seenBy: 4,
    comments: [],
  },
  {
    id: "p6",
    title: "MARINA DIGITAL SCREEN CONTENT",
    author: "Delbin Delbin",
    time: "5h ago",
    mention: "@Delbin Delbin",
    message: "Need final copy lock before publishing animation sequence.",
    projectName: "Marina Digital Screen",
    responsibleUser: "Delbin Delbin",
    priority: "high",
    seenBy: 6,
    comments: [],
  },
  {
    id: "p7",
    title: "ABU DHABI OFFICE BRANDING",
    author: "Aneesh Raghu",
    time: "Yesterday",
    mention: "@Delbin Delbin",
    message: "Please confirm site dimensions shared by sales team.",
    projectName: "AD Office Branding",
    responsibleUser: "Rahul Menon",
    priority: "medium",
    seenBy: 2,
    comments: [],
  },
  {
    id: "p8",
    title: "AL AIN RETAIL WINDOW GRAPHICS",
    author: "Fahad Quazi",
    time: "Yesterday",
    mention: "@Delbin Delbin",
    message: "Client asked for festive variant. Duplicate current layout.",
    projectName: "Al Ain Retail",
    responsibleUser: "Fahad Quazi",
    priority: "low",
    seenBy: 3,
    comments: [],
  },
  {
    id: "p9",
    title: "JLT SHOWROOM SIGNAGE REWORK",
    author: "Rahul Menon",
    time: "Yesterday",
    mention: "@Anju Krishna",
    message: "Please update font hierarchy as per latest review notes.",
    projectName: "JLT Showroom",
    responsibleUser: "Rahul Menon",
    priority: "high",
    seenBy: 7,
    comments: [],
  },
  {
    id: "p10",
    title: "BUS SHELTER CAMPAIGN - PHASE 2",
    author: "Anju Krishna",
    time: "2 days ago",
    mention: "@Delbin Delbin",
    message: "Media file package uploaded. Awaiting final QA check.",
    projectName: "Bus Shelter Campaign",
    responsibleUser: "Anju Krishna",
    priority: "medium",
    seenBy: 4,
    comments: [],
  },
  {
    id: "p11",
    title: "MIRDIF STORE FACADE LETTERING",
    author: "Delbin Delbin",
    time: "2 days ago",
    mention: "@Fahad Quazi",
    message: "Need confirmation on acrylic thickness before vendor PO.",
    projectName: "Mirdif Store Facade",
    responsibleUser: "Delbin Delbin",
    priority: "high",
    seenBy: 8,
    comments: [],
  },
  {
    id: "p12",
    title: "JEBEL ALI YARD SAFETY BOARD",
    author: "Aneesh Raghu",
    time: "2 days ago",
    mention: "@Delbin Delbin",
    message: "Please replace icons with approved HSE set from library.",
    projectName: "Jebel Ali Yard",
    responsibleUser: "Aneesh Raghu",
    priority: "low",
    seenBy: 3,
    comments: [],
  },
];

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

function CreatePostModal({ isOpen, onClose, onSubmit, isSubmitting }) {
  const [title, setTitle] = useState("");
  const [mention, setMention] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [postType, setPostType] = useState("Posts");
  const [attachment, setAttachment] = useState(null);
  const [showMentions, setShowMentions] = useState(false);
  const mentionList = ["@Aneesh Raghu", "@Delbin Delbin", "@Anju Krishna", "@Fahad Quazi", "@Rahul Menon"];

  const handleMentionChange = (e) => {
    const val = e.target.value;
    setMention(val);
    if (val.includes("@")) setShowMentions(true);
    else setShowMentions(false);
  };

  const selectMention = (m) => {
    setMention(m);
    setShowMentions(false);
  };

  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setAttachment(e.dataTransfer.files[0]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setMention("");
      setMessage("");
      setPriority("Medium");
      setPostType("Posts");
      setAttachment(null);
      setShowMentions(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!title.trim() || !message.trim()) {
      alert("Please fill in the mandatory fields (Post Title, Description)");
      return;
    }
    onSubmit({ title, mention, message, priority, postType, attachment });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 transition-opacity">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
          <X className="w-5 h-5" />
        </button>
        <div className="px-6 pt-6 pb-4 max-h-[85vh] overflow-y-auto">
          <h2 className="text-2xl font-serif text-slate-800 text-center mb-6">Create Post</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-[13px] text-slate-700 mb-1 font-medium ml-1">Post Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-full border border-slate-400 px-3 py-1.5 text-sm focus:border-slate-800 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[13px] text-slate-700 mb-1 font-medium ml-1">Post Type</label>
              <div className="flex gap-2 bg-slate-100 p-1 rounded-full">
                {["Posts", "Private", "Task Updates"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setPostType(type)}
                    className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      postType === type
                        ? "bg-white text-slate-800 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <label className="block text-[13px] text-slate-700 mb-1 font-medium ml-1">Mentioned</label>
              <input
                type="text"
                value={mention}
                onChange={handleMentionChange}
                placeholder="@username"
                className="w-full rounded-full border border-slate-400 px-3 py-1.5 text-sm focus:border-slate-800 focus:outline-none"
              />
              {showMentions && (
                <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-32 overflow-y-auto">
                  {mentionList.filter(m => m.toLowerCase().includes(mention.toLowerCase())).map(m => (
                    <li key={m} onClick={() => selectMention(m)} className="px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer">
                      {m}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="flex justify-between mb-1 ml-1">
                <label className="block text-[13px] text-slate-700 font-medium">Description *</label>
                <span className="text-xs text-slate-400">{message.length}/500</span>
              </div>
              <textarea
                value={message}
                maxLength={500}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-xl border border-slate-400 px-3 py-2 text-sm min-h-[90px] resize-none focus:border-slate-800 focus:outline-none"
              ></textarea>
            </div>

            <div>
              <label className="block text-[13px] text-slate-700 mb-1 font-medium ml-1">Attachment</label>
              <div
                className="rounded-xl border border-slate-400 border-dashed p-4 text-center cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => document.getElementById("post-attachment").click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  id="post-attachment"
                  className="hidden"
                  onChange={(e) => { if(e.target.files.length) setAttachment(e.target.files[0]) }}
                />
                {attachment ? (
                  <p className="text-sm font-medium text-emerald-600 truncate">{attachment.name}</p>
                ) : (
                  <p className="text-xs text-slate-500">Click to upload or drag and drop</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[13px] text-slate-700 mb-1 font-medium ml-1">priority Level</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setPriority("High")}
                  className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition-all ${
                    priority === "High" ? "bg-red-500 text-white shadow-md" : "bg-red-100 text-red-700 hover:bg-red-200"
                  }`}
                >
                  High
                </button>
                <button
                  onClick={() => setPriority("Medium")}
                  className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition-all ${
                    priority === "Medium" ? "bg-amber-400 text-white shadow-md" : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  }`}
                >
                  Medium
                </button>
                <button
                  onClick={() => setPriority("Low")}
                  className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition-all ${
                    priority === "Low" ? "bg-emerald-500 text-white shadow-md" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  }`}
                >
                  Low
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 flex items-center justify-center mt-2 pb-6">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-full bg-slate-400 px-8 py-2 text-sm font-semibold text-white hover:bg-slate-500 transition-colors flex items-center gap-2 shadow-sm"
          >
            {isSubmitting ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
            ) : null}
            Post
          </button>
        </div>
      </div>
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
                
                {post.attachment && (
                  <div className="mt-3">
                    {post.attachment.type?.startsWith('image/') ? (
                      <img src={URL.createObjectURL(post.attachment)} alt="attachment preview" className="rounded-md border border-slate-200 max-h-48 object-contain" />
                    ) : (
                      <div className="inline-flex items-center gap-3 p-2 border border-slate-200 rounded-md bg-slate-50 w-full max-w-sm">
                        <div className="w-10 h-10 bg-white border border-slate-200 rounded flex items-center justify-center text-lg">
                          📄
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{post.attachment.name}</p>
                          <p className="text-xs text-slate-500">{(post.attachment.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

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
  const [posts, setPosts] = useState(CHATTER_POSTS);
  const [openComposerPostId, setOpenComposerPostId] = useState(null);
  const [draftByPostId, setDraftByPostId] = useState({});
  const [activeTab, setActiveTab] = useState("posts");
  const [openTaskId, setOpenTaskId] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 3));
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

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
    await new Promise((resolve) => setTimeout(resolve, 800));

    const newPost = {
      id: `new-${Date.now()}`,
      title: postData.title,
      author: CURRENT_USER,
      time: "just now",
      mention: postData.mention,
      message: postData.message,
      projectName: postData.title,
      responsibleUser: CURRENT_USER,
      priority: postData.priority.toLowerCase(),
      seenBy: 0,
      comments: [],
      updatedAt: new Date().toISOString(),
      postType: postData.postType,
      attachment: postData.attachment,
    };

    setPosts((prev) => [newPost, ...prev]);
    setIsSubmitting(false);
    setIsCreateModalOpen(false);
    setActiveTab("posts");

    setToastMessage("Post created successfully!");
    setTimeout(() => setToastMessage(null), 3000);
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
              onClick={() => setIsCreateModalOpen(true)}
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
            {sortedPosts.map((post) => (
              <ChatterCard
                key={post.id}
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
          isOpen={isCreateModalOpen} 
          onClose={() => setIsCreateModalOpen(false)} 
          onSubmit={handleCreatePost} 
          isSubmitting={isSubmitting} 
        />
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      </main>
    </div>
  );
}
