import { describe, expect, it } from "vitest";
import {
  computeDesignerTaskStats,
  getTaskCompletionDate,
} from "./designer-task-stats.util";

describe("designer-task-stats.util", () => {
  it("prefers completedAt over updatedAt for closed date", () => {
    const date = getTaskCompletionDate({
      status: "CLIENT_ACCEPTED",
      completedAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-19T12:00:00.000Z",
    });
    expect(date?.toISOString()).toBe("2026-07-10T12:00:00.000Z");
  });

  it("buckets active / in-review / closed correctly", () => {
    const now = new Date("2026-07-19T12:00:00.000Z");
    const stats = computeDesignerTaskStats(
      [
        { id: "a1", status: "IN_PROGRESS", updatedAt: "2026-07-18T00:00:00.000Z" },
        { id: "r1", status: "REWORK", updatedAt: "2026-07-18T00:00:00.000Z" },
        { id: "s1", status: "DESIGN_COMPLETED", updatedAt: "2026-07-17T00:00:00.000Z" },
        { id: "h1", status: "HOD_REVIEW", updatedAt: "2026-07-16T00:00:00.000Z" },
        { id: "hold", status: "ON_HOLD", updatedAt: "2026-07-15T00:00:00.000Z" },
        {
          id: "ok",
          status: "CLIENT_ACCEPTED",
          completedAt: "2026-07-14T10:00:00.000Z",
          retailDetails: [{ hoursRequired: 4 }],
        },
        {
          id: "rej",
          status: "CLIENT_REJECTED",
          completedAt: "2026-07-13T10:00:00.000Z",
          retailDetails: [{ hoursRequired: 2 }],
        },
        {
          id: "old",
          status: "CLIENT_ACCEPTED",
          completedAt: "2026-06-20T10:00:00.000Z",
          retailDetails: [{ hoursRequired: 8 }],
        },
      ],
      { now },
    );

    expect(stats.donut.active.value).toBe(2); // IN_PROGRESS + REWORK
    expect(stats.donut.inReview.value).toBe(2); // DESIGN_COMPLETED + HOD_REVIEW
    expect(stats.donut.onHold.value).toBe(1);
    expect(stats.donut.closed.value).toBe(3); // accepted x2 + rejected
    expect(stats.donut.centerTotal).toBe(8);

    // Closed this month only (not DESIGN_COMPLETED)
    expect(stats.monthlyCompletedCount).toBe(2);
    expect(stats.monthlyHourCount).toBe(6);
    expect(stats.allCompletedCount).toBe(3);
  });

  it("labels closed groups with real week ranges, newest first", () => {
    const now = new Date("2026-07-19T12:00:00.000Z");
    const stats = computeDesignerTaskStats(
      [
        { id: "w1", status: "CLIENT_ACCEPTED", completedAt: "2026-07-15T10:00:00.000Z" },
        { id: "w0", status: "CLIENT_REJECTED", completedAt: "2026-07-06T10:00:00.000Z" },
      ],
      { now },
    );

    const labels = Object.keys(stats.completedTasksByWeek);
    expect(labels[0]).toMatch(/Jul 13/i);
    expect(labels[1]).toMatch(/Jul 6/i);
  });

  it("counts accepted + rejected closed this week", () => {
    const now = new Date("2026-07-19T12:00:00.000Z");
    const stats = computeDesignerTaskStats(
      [
        { id: "ok", status: "CLIENT_ACCEPTED", completedAt: "2026-07-15T10:00:00.000Z" },
        { id: "rej", status: "CLIENT_REJECTED", completedAt: "2026-07-16T10:00:00.000Z" },
        { id: "earlier", status: "CLIENT_ACCEPTED", completedAt: "2026-07-03T10:00:00.000Z" },
        { id: "submitted", status: "DESIGN_COMPLETED", completedAt: "2026-07-15T10:00:00.000Z" },
      ],
      {
        now,
        viewWeekStart: new Date("2026-07-13T00:00:00"),
        viewWeekEnd: new Date("2026-07-19T00:00:00"),
      },
    );

    expect(stats.weeklyCompletedCount).toBe(2);
    expect(stats.monthlyCompletedCount).toBe(3);
    expect(stats.donut.inReview.value).toBe(1);
  });
});
