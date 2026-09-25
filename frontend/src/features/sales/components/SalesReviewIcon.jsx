import { FileBarChart } from 'lucide-react'

export function SalesReviewIcon({ className = 'h-5 w-5', strokeWidth = 1.75, ...props }) {
  return <FileBarChart className={className} strokeWidth={strokeWidth} aria-hidden {...props} />
}
