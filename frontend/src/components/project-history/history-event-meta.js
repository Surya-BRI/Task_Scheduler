import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  CheckCircle2,
  CircleDot,
  FileText,
  FileUp,
  FileX,
  History,
  MessageSquare,
  RefreshCw,
  UserPlus,
} from 'lucide-react'

/** @typedef {'green' | 'orange' | 'red' | 'blue' | 'purple' | 'gray'} HistoryTone */

const TONE_STYLES = {
  green: {
    icon: 'text-emerald-600',
    soft: 'bg-emerald-50 ring-emerald-100',
    connector: 'bg-emerald-200',
  },
  orange: {
    icon: 'text-amber-600',
    soft: 'bg-amber-50 ring-amber-100',
    connector: 'bg-amber-200',
  },
  red: {
    icon: 'text-red-600',
    soft: 'bg-red-50 ring-red-100',
    connector: 'bg-red-200',
  },
  blue: {
    icon: 'text-blue-600',
    soft: 'bg-blue-50 ring-blue-100',
    connector: 'bg-blue-200',
  },
  purple: {
    icon: 'text-violet-600',
    soft: 'bg-violet-50 ring-violet-100',
    connector: 'bg-violet-200',
  },
  gray: {
    icon: 'text-slate-500',
    soft: 'bg-slate-100 ring-slate-200',
    connector: 'bg-slate-200',
  },
}

const DEFAULT_META = {
  title: 'Activity',
  icon: CircleDot,
  tone: /** @type {HistoryTone} */ ('gray'),
}

/**
 * Maps activity actions to timeline presentation metadata.
 * Keys align with backend ActivityAction values.
 */
const EVENT_META = {
  TASK_CREATED: { title: 'Task Created', icon: CheckCircle2, tone: 'green' },
  TASK_COMPLETED: { title: 'Completed', icon: CheckCircle2, tone: 'green' },
  CLIENT_APPROVED: { title: 'Client Approved', icon: BadgeCheck, tone: 'green' },
  TASK_WORK_SUBMITTED: { title: 'Work Submitted', icon: CheckCircle2, tone: 'green' },

  DEADLINE_REMINDER: { title: 'Reminder', icon: Bell, tone: 'orange' },
  SCHEDULER_WEEK_LOCKED: { title: 'Schedule Locked', icon: Bell, tone: 'orange' },
  SCHEDULER_WEEK_UNLOCKED: { title: 'Schedule Unlocked', icon: Bell, tone: 'orange' },

  DEADLINE_OVERDUE: { title: 'Deadline Overdue', icon: AlertTriangle, tone: 'red' },
  CLIENT_REJECTED_TASK: { title: 'Client Rejected', icon: AlertTriangle, tone: 'red' },
  PROJECT_FILE_DELETED: { title: 'File Deleted', icon: FileX, tone: 'red' },

  ASSIGNED_TASK: { title: 'Task Assigned', icon: UserPlus, tone: 'blue' },
  QS_PROJECT_ASSIGNED: { title: 'QS Assigned', icon: UserPlus, tone: 'blue' },
  PROJECT_FILE_UPLOADED: { title: 'File Uploaded', icon: FileUp, tone: 'blue' },
  TASK_FILE_UPLOADED: { title: 'File Uploaded', icon: FileUp, tone: 'blue' },

  STATUS_CHANGED: { title: 'Status Changed', icon: RefreshCw, tone: 'purple' },
  QS_STATUS_CHANGED: { title: 'QS Status Changed', icon: RefreshCw, tone: 'purple' },
  QS_UPDATE_SUBMITTED: { title: 'QS Update Submitted', icon: RefreshCw, tone: 'purple' },
  SIGN_FAMILY_UPDATED: { title: 'Sign Family Updated', icon: RefreshCw, tone: 'purple' },
  QS_SIGN_ROW_ADDED: { title: 'Sign Row Added', icon: RefreshCw, tone: 'purple' },
  QS_SIGN_ROW_UPDATED: { title: 'Sign Row Updated', icon: RefreshCw, tone: 'purple' },
  QS_SIGN_ROW_DELETED: { title: 'Sign Row Deleted', icon: RefreshCw, tone: 'purple' },

  CREATED_CHATTER_POST: { title: 'Comment Added', icon: MessageSquare, tone: 'gray' },
  CREATED_CHATTER_COMMENT: { title: 'Comment Added', icon: MessageSquare, tone: 'gray' },
  SCHEDULER_WEEK_SAVED: { title: 'Schedule Saved', icon: History, tone: 'gray' },
  SCHEDULER_LEAVE_RESCHEDULED: { title: 'Leave Rescheduled', icon: History, tone: 'gray' },
  LEAVE_REQUEST_SUBMITTED: { title: 'Leave Requested', icon: History, tone: 'gray' },
  LEAVE_REQUEST_UPDATED: { title: 'Leave Updated', icon: History, tone: 'gray' },
  LEAVE_REQUEST_CANCELLED: { title: 'Leave Cancelled', icon: History, tone: 'gray' },
  LEAVE_REQUEST_REVOKED: { title: 'Leave Revoked', icon: History, tone: 'gray' },
  LEAVE_REQUEST_STATUS_CHANGED: { title: 'Leave Status Changed', icon: History, tone: 'gray' },
  LEAVE_AUTO_APPROVED: { title: 'Leave Approved', icon: CheckCircle2, tone: 'green' },
}

export function getHistoryEventMeta(action) {
  return EVENT_META[action] ?? DEFAULT_META
}

export function getHistoryToneStyles(tone) {
  return TONE_STYLES[tone] ?? TONE_STYLES.gray
}

export function formatHistoryTimestamp(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const day = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  return `${day} • ${time}`
}

export function formatHistoryDateShort(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Field-history filter — same set previously used in Task/Retail pages. */
export const HISTORY_FIELD_ACTIONS = new Set([
  'TASK_CREATED',
  'ASSIGNED_TASK',
  'STATUS_CHANGED',
])

export { History as HistoryEmptyIcon, FileText as HistoryFallbackIcon }
