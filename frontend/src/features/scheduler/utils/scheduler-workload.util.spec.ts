import { describe, expect, it } from "vitest";
import {
  countDesignerWeekSlots,
  resolveAssignmentScheduledHours,
  sumDesignerWeekWorkload,
  sumSlotTotalHours,
} from "./scheduler-workload.util";

describe("scheduler-workload.util", () => {
  it("subtracts approved OT from assignedHours when scheduledHours is missing", () => {
    expect(resolveAssignmentScheduledHours({ assignedHours: 10, approvedOvertimeHours: 2 })).toBe(8);
    expect(resolveAssignmentScheduledHours({ scheduledHours: 8, assignedHours: 10, approvedOvertimeHours: 2 })).toBe(8);
  });

  it("sums regular + OT slots without double-counting split OT blocks", () => {
    const taskMap = {
      taskA: { id: "taskA", scheduledHours: 8, approvedOvertimeHours: 0 },
      "taskA-ot": { id: "taskA-ot", isOvertime: true, approvedOvertimeHours: 2, estimatedHours: 2 },
    };
    expect(sumSlotTotalHours(taskMap, ["taskA", "taskA-ot"])).toBe(10);
  });

  it("counts inline OT on a single assignment row", () => {
    const taskMap = {
      taskB: { id: "taskB", scheduledHours: 6, approvedOvertimeHours: 1.5 },
    };
    expect(sumSlotTotalHours(taskMap, ["taskB"])).toBe(7.5);
  });

  it("tracks the last weekday with scheduled work for Work Till", async () => {
    const { buildDesignerSnapshot } = await import("./designerDashboardSync");
    const taskMap = {
      mon: { id: "mon", scheduledHours: 4 },
      fri: { id: "fri", scheduledHours: 8 },
    };
    const snapshot = buildDesignerSnapshot(taskMap, { "0": ["mon"], "4": ["fri"] });
    expect(snapshot.stats.lastWorkDayIndex).toBe(4);
    expect(snapshot.stats.lastWorkDayHours).toBe(8);

    const emptySnapshot = buildDesignerSnapshot({}, {});
    expect(emptySnapshot.stats.lastWorkDayIndex).toBeNull();
  });

  it("marks HOD-overloaded hours past 8h as red OT blocks (8h + 1h + 1h)", async () => {
    const { buildDesignerSnapshot } = await import("./designerDashboardSync");
    const taskMap = {
      big: { id: "big", scheduledHours: 8 },
      small1: { id: "small1", scheduledHours: 1 },
      small2: { id: "small2", scheduledHours: 1 },
    };
    const snapshot = buildDesignerSnapshot(taskMap, { "4": ["big", "small1", "small2"] });

    expect(snapshot.stats.hours).toBe(10);
    expect(snapshot.stats.lastWorkDayHours).toBe(10);
    const blocks = snapshot.schedule.Friday.tasks;
    const rendered = blocks.reduce((acc, t) => acc + t.estimatedHours, 0);
    expect(rendered).toBe(10);
    // The two 1h tasks landed past the 8h line, so they render as OT.
    expect(blocks.filter((t) => t.isOvertime)).toHaveLength(2);
    expect(blocks.find((t) => t.id === "big").isOvertime).toBe(false);
  });

  it("splits a block straddling the 8h line into a regular part and a red OT part", async () => {
    const { buildDesignerSnapshot } = await import("./designerDashboardSync");
    const taskMap = {
      huge: { id: "huge", scheduledHours: 14 },
    };
    const snapshot = buildDesignerSnapshot(taskMap, { "4": ["huge"] });

    const blocks = snapshot.schedule.Friday.tasks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ startHr: 0, endHr: 8, isOvertime: false });
    // Clamped at the 12h daily ceiling.
    expect(blocks[1]).toMatchObject({ startHr: 8, endHr: 12, isOvertime: true });
    expect(snapshot.stats.lastWorkDayHours).toBe(12);
  });

  it("packs approved OT after the regular blocks, never overlapping an overloaded day", async () => {
    const { buildDesignerSnapshot } = await import("./designerDashboardSync");
    const taskMap = {
      big: { id: "big", scheduledHours: 9 },
      "big-ot": { id: "big-ot", isOvertime: true, approvedOvertimeHours: 2, estimatedHours: 2 },
    };
    const snapshot = buildDesignerSnapshot(taskMap, { "4": ["big", "big-ot"] });

    const blocks = snapshot.schedule.Friday.tasks;
    // 9h task: 8h regular + 1h forced-OT overload, then the approved OT block follows.
    expect(blocks.find((t) => t.id === "big-overload")).toMatchObject({ startHr: 8, endHr: 9, isOvertime: true });
    const approvedOtBlock = blocks.find((t) => t.id === "big-ot-ot");
    expect(approvedOtBlock.startHr).toBe(9);
    expect(approvedOtBlock.endHr).toBe(11);
    expect(snapshot.stats.lastWorkDayHours).toBe(11);
  });

  it("aggregates week workload and slot count across weekdays", () => {
    const taskMap = {
      mon: { scheduledHours: 3 },
      tue: { scheduledHours: 4 },
      "fri-ot": { isOvertime: true, estimatedHours: 2, approvedOvertimeHours: 2 },
    };
    const schedule = {
      "0": ["mon"],
      "1": ["tue"],
      "4": ["fri-ot"],
    };
    expect(sumDesignerWeekWorkload(taskMap, schedule)).toBe(9);
    expect(countDesignerWeekSlots(schedule)).toBe(3);
  });
});
