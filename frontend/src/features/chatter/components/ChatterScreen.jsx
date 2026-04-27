"use client";

import { useMemo, useState } from "react";
import { CalendarDays, MessageSquareText, PlusSquare, Search } from "lucide-react";
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
      className={`rounded-full px-3 py-0.5 text-[11px] font-medium transition-colors ${
        isActive
          ? "bg-[#1d4f91] text-white"
          : "bg-slate-200 text-slate-700 hover:bg-slate-300"
      }`}
    >
      {label}
    </button>
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
    <article className="rounded-lg border border-slate-200 bg-[#e9edf3] p-2.5 shadow-sm">
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-xs font-semibold uppercase tracking-tight text-[#1d4f91]">
              {post.title}
            </p>
            <span className="text-xs text-slate-500">- {post.author}</span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500">{post.time}</p>
          <p className="mt-1.5 text-[11px] font-medium text-[#1d4f91]">{post.mention}</p>
          <p className="mt-1 text-xs text-slate-700">{post.message}</p>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-600">
            <button type="button" className="hover:text-slate-900">
              Like
            </button>
            <button
              type="button"
              className={hasComments ? "font-semibold text-red-600 hover:text-red-700" : "hover:text-slate-900"}
              onClick={onOpenComposer}
            >
              {hasComments ? "Commented" : "Comment"}
            </button>
          </div>
        </div>
        <aside className="w-full max-w-[220px] border-l-4 border-slate-800 pl-2.5 text-[11px] text-slate-700">
          <p>Project Name: {post.projectName}</p>
          <p>Responsible User: {post.responsibleUser}</p>
          <p className="mt-1 flex items-center gap-2">
            Priority Label:
            <span
              className={`inline-block h-3 w-3 rounded-full ${PRIORITY_STYLES[post.priority]}`}
              aria-label={`${post.priority} priority`}
            />
          </p>
          <p className="mt-2 text-right text-slate-600">Seen by {post.seenBy}</p>
        </aside>
      </div>
      {isComposerOpen ? (
        <div className="mt-2.5 rounded-md border border-slate-200 bg-white p-2">
          <textarea
            value={draftComment}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Write a comment..."
            className="min-h-[72px] w-full resize-none rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-300"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span>B</span>
              <span>I</span>
              <span>U</span>
              <span>S</span>
              <span>@</span>
              <span>#</span>
            </div>
            <button
              type="button"
              onClick={onSubmitComment}
              disabled={!draftComment.trim()}
              className="rounded bg-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
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

  return (
    <div className="min-h-screen bg-[#f4f6fa] font-sans">
      <Navbar />
      <main className="mx-auto w-full max-w-[1320px] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-2 text-slate-600">
            <div className="relative">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px]"
              >
                <CalendarDays className="h-3 w-3" />
                {weekLabel}
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
            <button type="button" className="grid h-7 w-7 place-items-center rounded-md bg-white border border-slate-200">
              <Search className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-md bg-[#1d4f91] text-white"
              aria-label="Create new chatter post"
            >
              <PlusSquare className="h-3 w-3" />
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
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Mentioned to You</h2>
              <div className="space-y-2">
                {privateMentions.length === 0 ? (
                  <p className="text-xs text-slate-500">No mentions for @{CURRENT_USER}.</p>
                ) : (
                  privateMentions.map((item) => (
                    <div key={`mention-${item.id}`} className="rounded border border-slate-200 bg-slate-50 p-2">
                      <p className="text-[11px] font-semibold text-[#1d4f91]">{item.title}</p>
                      <p className="mt-1 text-[11px] text-slate-700">{item.message}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{item.time}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Your Posted Comments</h2>
              <div className="space-y-2">
                {privateComments.length === 0 ? (
                  <p className="text-xs text-slate-500">No comments posted yet.</p>
                ) : (
                  privateComments.map((item) => (
                    <div key={`my-comment-${item.id}`} className="rounded border border-slate-200 bg-slate-50 p-2">
                      <p className="text-[11px] font-semibold text-[#1d4f91]">{item.title}</p>
                      <p className="mt-1 text-[11px] text-slate-700">{item.message}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{item.projectName}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "task-updates" ? (
          <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Task Updates</h2>
            <div className="space-y-2">
              {taskUpdates.map((task) => {
                const isOpen = openTaskId === task.id;
                return (
                  <div key={task.id} className="rounded border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setOpenTaskId((prev) => (prev === task.id ? null : task.id))}
                      className="flex w-full items-center justify-between bg-slate-50 px-3 py-2 text-left"
                    >
                      <span className="text-xs font-semibold text-slate-800">{task.taskName}</span>
                      <span className="text-[11px] text-slate-500">
                        {task.chats.length} chatter {task.chats.length > 1 ? "items" : "item"}
                      </span>
                    </button>
                    {isOpen ? (
                      <div className="space-y-1.5 p-2">
                        {task.chats.map((chat) => (
                          <div key={chat.id} className="rounded bg-slate-50 p-2">
                            <p className="text-[11px] font-semibold text-[#1d4f91]">{chat.title}</p>
                            <p className="mt-1 text-[11px] text-slate-700">{chat.message}</p>
                            <p className="mt-1 text-[10px] text-slate-500">
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

        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white/70 p-4 text-center">
          <MessageSquareText className="mx-auto h-5 w-5 text-slate-500" />
          <p className="mt-2 text-xs text-slate-600">
            Chatter workflow scaffold is ready. Share the first process step and I will wire it in.
          </p>
        </div>
      </main>
    </div>
  );
}
