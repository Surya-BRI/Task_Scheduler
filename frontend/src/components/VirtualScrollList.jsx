"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

/**
 * Nested-scroller virtual list for dense feeds (team activity, scheduler queue, etc.).
 * Keeps ~overscan rows mounted; variable heights via measureElement.
 */
export function VirtualScrollList({
  items,
  estimateSize = 88,
  overscan = 8,
  gap = 6,
  className = "",
  getItemKey,
  renderItem,
}) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    gap,
    getItemKey: getItemKey
      ? (index) => getItemKey(items[index], index)
      : (index) => items[index]?.id ?? index,
  });

  return (
    <div ref={parentRef} className={className}>
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
