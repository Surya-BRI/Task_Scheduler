import { FileBarChart } from 'lucide-react'

/**
 * Shared Sales Review module icon — analytics + document review.
 * Keeps nav, page headers, and related UI visually consistent.
 */
export function SalesReviewIcon({ className = 'h-5 w-5', strokeWidth = 1.75, ...props }) {
  return <FileBarChart className={className} strokeWidth={strokeWidth} aria-hidden {...props} />
}
