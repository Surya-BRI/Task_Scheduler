"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

/**
 * Document/window-scrolled virtual list (chatter posts feed, etc.).
 * Variable row heights via measureElement; scrollMargin tracks list offset under sticky chrome.
 */
export function VirtualWindowList({
  items,
  estimateSize = 280,
  overscan = 6,
  gap = 10,
  className = "",
  getItemKey,
  renderItem,
  scrollToKey = null,
  onRangeChange,
}) {
  const listRef = useRef(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const sync = () => {
      const top = listRef.current?.offsetTop ?? 0;
      setScrollMargin((prev) => (prev === top ? prev : top));
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [items.length]);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => estimateSize,
    overscan,
    gap,
    scrollMargin,
    getItemKey: getItemKey
      ? (index) => getItemKey(items[index], index)
      : (index) => items[index]?.id ?? index,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (scrollToKey == null || scrollToKey === "") return;
    const index = items.findIndex((item, i) => {
      const key = getItemKey ? getItemKey(item, i) : item?.id;
      return key === scrollToKey || item?.id === scrollToKey;
    });
    if (index < 0) return;
    virtualizer.scrollToIndex(index, { align: "start" });
  }, [scrollToKey, items, getItemKey, virtualizer]);

  const rangeStart = virtualItems[0]?.index;
  const rangeEnd = virtualItems[virtualItems.length - 1]?.index;
  useEffect(() => {
    if (!onRangeChange || rangeStart == null || rangeEnd == null) return;
    onRangeChange({
      startIndex: rangeStart,
      endIndex: rangeEnd,
      count: items.length,
    });
  }, [onRangeChange, rangeStart, rangeEnd, items.length]);

  return (
    <div ref={listRef} className={className}>
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
              }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
