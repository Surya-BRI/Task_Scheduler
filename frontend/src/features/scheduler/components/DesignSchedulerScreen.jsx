"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Search, Plus, PauseCircle, AlertTriangle, History } from "lucide-react";
import { Navbar } from "@/components/Navbar";
const DUMMY_DESIGNERS = [
    { id: "d1", name: "Alex Johnson", initials: "AJ", capacityHours: 40 },
    { id: "d2", name: "Alexander Allen", initials: "AA", capacityHours: 40 },
    { id: "d3", name: "Benjamin Harris", initials: "BH", capacityHours: 40 },
    { id: "d4", name: "Chloe Wright", initials: "CW", capacityHours: 40 },
    { id: "d5", name: "David Adams", initials: "DA", capacityHours: 40 },
    { id: "d6", name: "Ella Young", initials: "EY", capacityHours: 40 },
    { id: "d7", name: "Emily Davis", initials: "ED", capacityHours: 40 },
    { id: "d8", name: "Ethan Anderson", initials: "EA", capacityHours: 40 },
    { id: "d9", name: "Grace Green", initials: "GG", capacityHours: 40 },
    { id: "d10", name: "Hannah Perez", initials: "HP", capacityHours: 40 },
    { id: "d11", name: "Designer 11", initials: "DX", capacityHours: 40 },
    { id: "d12", name: "Designer 12", initials: "DX", capacityHours: 40 },
    { id: "d13", name: "Designer 13", initials: "DX", capacityHours: 40 },
    { id: "d14", name: "Designer 14", initials: "DX", capacityHours: 40 },
    { id: "d15", name: "Designer 15", initials: "DX", capacityHours: 40 },
    { id: "d16", name: "Designer 16", initials: "DX", capacityHours: 40 },
    { id: "d17", name: "Designer 17", initials: "DX", capacityHours: 40 },
    { id: "d18", name: "Designer 18", initials: "DX", capacityHours: 40 },
    { id: "d19", name: "Designer 19", initials: "DX", capacityHours: 40 },
    { id: "d20", name: "Designer 20", initials: "DX", capacityHours: 40 },
];
const INITIAL_TASKS = {
    // Unassigned tasks (small, 1–8hr)
    "t1": { id: "t1", name: "Icon Set", tag: "Mobile App", estimatedHours: 3, status: "unassigned", colorClass: "bg-slate-50 border border-slate-200 text-slate-700" },
    "t2": { id: "t2", name: "Store Redesign", tag: "WebApp v3", estimatedHours: 5, status: "unassigned", colorClass: "bg-red-50 border border-red-200 text-red-700" },
    "t3": { id: "t3", name: "Dark Mode", tag: "Design System", estimatedHours: 2, status: "unassigned", colorClass: "bg-gray-100 border border-gray-200 text-gray-800" },
    "t4": { id: "t4", name: "Checkout Anim", tag: "E-Commerce", estimatedHours: 4, status: "unassigned", colorClass: "bg-blue-50 border border-blue-200 text-blue-700" },
    "t5": { id: "t5", name: "Dashboard Charts", tag: "Analytics", estimatedHours: 6, status: "unassigned", colorClass: "bg-orange-50 border border-orange-200 text-orange-700" },
    "t6": { id: "t6", name: "User Research", tag: "WebApp v3", estimatedHours: 8, status: "unassigned", colorClass: "bg-teal-50 border border-teal-200 text-teal-800" },
    "t7": { id: "t7", name: "Nav Menu", tag: "Frontend", estimatedHours: 3, status: "unassigned", colorClass: "bg-purple-50 border border-purple-200 text-purple-700" },
    "t8": { id: "t8", name: "DB Schema", tag: "Backend", estimatedHours: 5, status: "unassigned", colorClass: "bg-gray-100 border border-gray-200 text-gray-800" },
    "t9": { id: "t9", name: "Landing Copy", tag: "Marketing", estimatedHours: 2, status: "unassigned", colorClass: "bg-blue-50 border border-blue-200 text-blue-700" },
    "t10": { id: "t10", name: "Wireframe Check", tag: "Design", estimatedHours: 1, status: "unassigned", colorClass: "bg-red-50 border border-red-200 text-red-700" },
    // On-hold tasks
    "t11": { id: "t11", name: "Server Maint", tag: "DevOps", estimatedHours: 4, status: "on-hold", holdTime: "2 Days", colorClass: "bg-slate-50 border border-slate-200 text-slate-700" },
    "t12": { id: "t12", name: "Client Meeting", tag: "Management", estimatedHours: 2, status: "on-hold", holdTime: "Blocker", colorClass: "bg-red-50 border border-red-200 text-red-700" },
    // Assigned tasks — 7 days × 20 designers (compact 1–8h each)
    "a1": { id: "a1", name: "Icons", tag: "", estimatedHours: 3, status: "assigned", colorClass: "bg-orange-100 border border-orange-300 text-orange-800" },
    "a2": { id: "a2", name: "Wireframe", tag: "", estimatedHours: 5, status: "assigned", colorClass: "bg-blue-100 border border-blue-300 text-blue-800" },
    "a3": { id: "a3", name: "Prototype", tag: "", estimatedHours: 8, status: "assigned", colorClass: "bg-indigo-100 border border-indigo-300 text-indigo-800" },
    "a4": { id: "a4", name: "Review", tag: "", estimatedHours: 4, status: "assigned", colorClass: "bg-purple-100 border border-purple-300 text-purple-800" },
    "a5": { id: "a5", name: "UX Audit", tag: "", estimatedHours: 6, status: "assigned", colorClass: "bg-green-100 border border-green-300 text-green-800" },
    "a6": { id: "a6", name: "Handoff", tag: "", estimatedHours: 2, status: "assigned", colorClass: "bg-pink-100 border border-pink-300 text-pink-800" },
    "a7": { id: "a7", name: "Copy Edit", tag: "", estimatedHours: 1, status: "assigned", colorClass: "bg-yellow-100 border border-yellow-300 text-yellow-800" },
    "a8": { id: "a8", name: "Sketch", tag: "", estimatedHours: 7, status: "assigned", colorClass: "bg-teal-100 border border-teal-300 text-teal-800" },
    "a9": { id: "a9", name: "Comp", tag: "", estimatedHours: 4, status: "assigned", colorClass: "bg-red-100 border border-red-300 text-red-800" },
    "a10": { id: "a10", name: "Test", tag: "", estimatedHours: 3, status: "assigned", colorClass: "bg-cyan-100 border border-cyan-300 text-cyan-800" },
    "a11": { id: "a11", name: "QA Pass", tag: "", estimatedHours: 5, status: "assigned", colorClass: "bg-lime-100 border border-lime-300 text-lime-800" },
    "a12": { id: "a12", name: "Deploy", tag: "", estimatedHours: 2, status: "assigned", colorClass: "bg-violet-100 border border-violet-300 text-violet-800" },
    "a13": { id: "a13", name: "Sprint Plan", tag: "", estimatedHours: 8, status: "assigned", colorClass: "bg-amber-100 border border-amber-300 text-amber-800" },
    "a14": { id: "a14", name: "Retro", tag: "", estimatedHours: 6, status: "assigned", colorClass: "bg-rose-100 border border-rose-300 text-rose-800" },
    "a15": { id: "a15", name: "Branding", tag: "", estimatedHours: 7, status: "assigned", colorClass: "bg-fuchsia-100 border border-fuchsia-300 text-fuchsia-800" },
    "a16": { id: "a16", name: "Assets", tag: "", estimatedHours: 4, status: "assigned", colorClass: "bg-sky-100 border border-sky-300 text-sky-800" },
    "a17": { id: "a17", name: "Redline", tag: "", estimatedHours: 3, status: "assigned", colorClass: "bg-orange-100 border border-orange-300 text-orange-800" },
    "a18": { id: "a18", name: "Doc Review", tag: "", estimatedHours: 5, status: "assigned", colorClass: "bg-blue-100 border border-blue-300 text-blue-800" },
    "a19": { id: "a19", name: "Storyboard", tag: "", estimatedHours: 6, status: "assigned", colorClass: "bg-indigo-100 border border-indigo-300 text-indigo-800" },
    "a20": { id: "a20", name: "Mockup", tag: "", estimatedHours: 8, status: "assigned", colorClass: "bg-purple-100 border border-purple-300 text-purple-800" },
    "a21": { id: "a21", name: "Spec Write", tag: "", estimatedHours: 2, status: "assigned", colorClass: "bg-green-100 border border-green-300 text-green-800" },
    "a22": { id: "a22", name: "Export", tag: "", estimatedHours: 1, status: "assigned", colorClass: "bg-pink-100 border border-pink-300 text-pink-800" },
    "a23": { id: "a23", name: "Flow Map", tag: "", estimatedHours: 4, status: "assigned", colorClass: "bg-yellow-100 border border-yellow-300 text-yellow-800" },
    "a24": { id: "a24", name: "Sprint 2", tag: "", estimatedHours: 7, status: "assigned", colorClass: "bg-teal-100 border border-teal-300 text-teal-800" },
    "a25": { id: "a25", name: "Logo v2", tag: "", estimatedHours: 5, status: "assigned", colorClass: "bg-red-100 border border-red-300 text-red-800" },
    "a26": { id: "a26", name: "Fonts", tag: "", estimatedHours: 3, status: "assigned", colorClass: "bg-cyan-100 border border-cyan-300 text-cyan-800" },
    "a27": { id: "a27", name: "Color Pal", tag: "", estimatedHours: 2, status: "assigned", colorClass: "bg-lime-100 border border-lime-300 text-lime-800" },
    "a28": { id: "a28", name: "Illustrate", tag: "", estimatedHours: 8, status: "assigned", colorClass: "bg-violet-100 border border-violet-300 text-violet-800" },
    "a29": { id: "a29", name: "Grid Sys", tag: "", estimatedHours: 6, status: "assigned", colorClass: "bg-amber-100 border border-amber-300 text-amber-800" },
    "a30": { id: "a30", name: "Copy", tag: "", estimatedHours: 4, status: "assigned", colorClass: "bg-rose-100 border border-rose-300 text-rose-800" },
    "a31": { id: "a31", name: "A11y Check", tag: "", estimatedHours: 5, status: "assigned", colorClass: "bg-fuchsia-100 border border-fuchsia-300 text-fuchsia-800" },
    "a32": { id: "a32", name: "Print Prep", tag: "", estimatedHours: 3, status: "assigned", colorClass: "bg-sky-100 border border-sky-300 text-sky-800" },
    "a33": { id: "a33", name: "UX Writing", tag: "", estimatedHours: 4, status: "assigned", colorClass: "bg-orange-100 border border-orange-300 text-orange-800" },
    "a34": { id: "a34", name: "Motion", tag: "", estimatedHours: 7, status: "assigned", colorClass: "bg-blue-100 border border-blue-300 text-blue-800" },
    "a35": { id: "a35", name: "Anim Frame", tag: "", estimatedHours: 6, status: "assigned", colorClass: "bg-indigo-100 border border-indigo-300 text-indigo-800" },
    "a36": { id: "a36", name: "Lottie", tag: "", estimatedHours: 5, status: "assigned", colorClass: "bg-purple-100 border border-purple-300 text-purple-800" },
    "a37": { id: "a37", name: "Research", tag: "", estimatedHours: 8, status: "assigned", colorClass: "bg-green-100 border border-green-300 text-green-800" },
    "a38": { id: "a38", name: "Survey", tag: "", estimatedHours: 2, status: "assigned", colorClass: "bg-pink-100 border border-pink-300 text-pink-800" },
    "a39": { id: "a39", name: "Persona", tag: "", estimatedHours: 3, status: "assigned", colorClass: "bg-yellow-100 border border-yellow-300 text-yellow-800" },
    "a40": { id: "a40", name: "Journey Map", tag: "", estimatedHours: 4, status: "assigned", colorClass: "bg-teal-100 border border-teal-300 text-teal-800" },
    "a41": { id: "a41", name: "Card Sort", tag: "", estimatedHours: 1, status: "assigned", colorClass: "bg-red-100 border border-red-300 text-red-800" },
    "a42": { id: "a42", name: "Usability", tag: "", estimatedHours: 5, status: "assigned", colorClass: "bg-cyan-100 border border-cyan-300 text-cyan-800" },
    "a43": { id: "a43", name: "Report", tag: "", estimatedHours: 3, status: "assigned", colorClass: "bg-lime-100 border border-lime-300 text-lime-800" },
    "a44": { id: "a44", name: "Design Sys", tag: "", estimatedHours: 7, status: "assigned", colorClass: "bg-violet-100 border border-violet-300 text-violet-800" },
    "a45": { id: "a45", name: "Tokens", tag: "", estimatedHours: 4, status: "assigned", colorClass: "bg-amber-100 border border-amber-300 text-amber-800" },
    "a46": { id: "a46", name: "Layout Grid", tag: "", estimatedHours: 6, status: "assigned", colorClass: "bg-rose-100 border border-rose-300 text-rose-800" },
    "a47": { id: "a47", name: "Component", tag: "", estimatedHours: 8, status: "assigned", colorClass: "bg-fuchsia-100 border border-fuchsia-300 text-fuchsia-800" },
    "a48": { id: "a48", name: "Variants", tag: "", estimatedHours: 5, status: "assigned", colorClass: "bg-sky-100 border border-sky-300 text-sky-800" },
    "a49": { id: "a49", name: "States", tag: "", estimatedHours: 3, status: "assigned", colorClass: "bg-orange-100 border border-orange-300 text-orange-800" },
    "a50": { id: "a50", name: "Atomic Sys", tag: "", estimatedHours: 7, status: "assigned", colorClass: "bg-blue-100 border border-blue-300 text-blue-800" },
    "a51": { id: "a51", name: "Theme Dark", tag: "", estimatedHours: 5, status: "assigned", colorClass: "bg-indigo-100 border border-indigo-300 text-indigo-800" },
    "a52": { id: "a52", name: "Style Guide", tag: "", estimatedHours: 6, status: "assigned", colorClass: "bg-purple-100 border border-purple-300 text-purple-800" },
    "a53": { id: "a53", name: "Checklist", tag: "", estimatedHours: 2, status: "assigned", colorClass: "bg-green-100 border border-green-300 text-green-800" },
    "a54": { id: "a54", name: "Sprint 3", tag: "", estimatedHours: 8, status: "assigned", colorClass: "bg-pink-100 border border-pink-300 text-pink-800" },
    "a55": { id: "a55", name: "Backlog", tag: "", estimatedHours: 4, status: "assigned", colorClass: "bg-yellow-100 border border-yellow-300 text-yellow-800" },
    "a56": { id: "a56", name: "Triage", tag: "", estimatedHours: 3, status: "assigned", colorClass: "bg-teal-100 border border-teal-300 text-teal-800" },
    "a57": { id: "a57", name: "Kickoff", tag: "", estimatedHours: 1, status: "assigned", colorClass: "bg-red-100 border border-red-300 text-red-800" },
    "a58": { id: "a58", name: "UAT Final", tag: "", estimatedHours: 7, status: "assigned", colorClass: "bg-cyan-100 border border-cyan-300 text-cyan-800" },
    "a59": { id: "a59", name: "Sign-off", tag: "", estimatedHours: 2, status: "assigned", colorClass: "bg-lime-100 border border-lime-300 text-lime-800" },
    "a60": { id: "a60", name: "Go Live", tag: "", estimatedHours: 6, status: "assigned", colorClass: "bg-violet-100 border border-violet-300 text-violet-800" },
    "a61": { id: "a61", name: "Post Launch", tag: "", estimatedHours: 4, status: "assigned", colorClass: "bg-amber-100 border border-amber-300 text-amber-800" },
    "a62": { id: "a62", name: "Metrics", tag: "", estimatedHours: 3, status: "assigned", colorClass: "bg-rose-100 border border-rose-300 text-rose-800" },
    "a63": { id: "a63", name: "Bug Fix", tag: "", estimatedHours: 5, status: "assigned", colorClass: "bg-fuchsia-100 border border-fuchsia-300 text-fuchsia-800" },
    "a64": { id: "a64", name: "Patch", tag: "", estimatedHours: 8, status: "assigned", colorClass: "bg-sky-100 border border-sky-300 text-sky-800" },
    "a65": { id: "a65", name: "Audit Log", tag: "", estimatedHours: 2, status: "assigned", colorClass: "bg-orange-100 border border-orange-300 text-orange-800" },
    "a66": { id: "a66", name: "Cleanup", tag: "", estimatedHours: 4, status: "assigned", colorClass: "bg-blue-100 border border-blue-300 text-blue-800" },
    "a67": { id: "a67", name: "Archive", tag: "", estimatedHours: 1, status: "assigned", colorClass: "bg-indigo-100 border border-indigo-300 text-indigo-800" },
    "a68": { id: "a68", name: "Migration", tag: "", estimatedHours: 7, status: "assigned", colorClass: "bg-purple-100 border border-purple-300 text-purple-800" },
    "a69": { id: "a69", name: "Rollback", tag: "", estimatedHours: 6, status: "assigned", colorClass: "bg-green-100 border border-green-300 text-green-800" },
    "a70": { id: "a70", name: "Infra", tag: "", estimatedHours: 5, status: "assigned", colorClass: "bg-pink-100 border border-pink-300 text-pink-800" },
};
// Capacity constants
const DAILY_CAPACITY = 8; // 8hrs per day = normal capacity (green/blue)
const MAX_DAILY_HOURS = 12; // absolute max assignable per day
const WEEKLY_CAPACITY = 40; // 5 working days × 8hrs
// Map day 0 (Mon) to 4 (Fri) — multiple tasks per day summing to ~8hrs
// Sat(5)/Sun(6) are holidays — no tasks
const INITIAL_SCHEDULES = {
    // d1: Mon=3+5=8h, Tue=8h, Wed=4+4=8h, Thu=5+3=8h, Fri=6+2=8h
    "d1": { "0": ["a1", "a2"], "1": ["a3"], "2": ["a4", "a23"], "3": ["a2", "a1"], "4": ["a5", "a6"] },
    // d2: Mon=7h, Tue=4+4=8h, Wed=5+3=8h, Thu=8h, Fri=2+6=8h
    "d2": { "0": ["a8"], "1": ["a9", "a4"], "2": ["a10", "a1"], "3": ["a13"], "4": ["a6", "a29"] },
    // d3: Mon=7+1=8h, Tue=4h, Wed=3+5=8h, Thu=6+2=8h, Fri=8h
    "d3": { "0": ["a15", "a7"], "1": ["a16"], "2": ["a17", "a2"], "3": ["a19", "a6"], "4": ["a20"] },
    // d4: Mon=1+7=8h, Tue=4+4=8h, Wed=7h, Thu=5h, Fri=3+5=8h
    "d4": { "0": ["a22", "a8"], "1": ["a23", "a4"], "2": ["a24"], "3": ["a25"], "4": ["a26", "a10"] },
    // d5: varied
    "d5": { "0": ["a29", "a7"], "1": ["a30", "a4"], "2": ["a31", "a1"], "3": ["a32", "a9"], "4": ["a33"] },
    // d6
    "d6": { "0": ["a36", "a1"], "1": ["a37", "a7"], "2": ["a38", "a9"], "3": ["a39", "a4"], "4": ["a40", "a6"] },
    // d7
    "d7": { "0": ["a43", "a7"], "1": ["a44", "a1"], "2": ["a45", "a4"], "3": ["a46", "a6"], "4": ["a47", "a1"] },
    // d8
    "d8": { "0": ["a50", "a1"], "1": ["a51", "a7"], "2": ["a52", "a6"], "3": ["a53", "a9"], "4": ["a54", "a4"] },
    // d9
    "d9": { "0": ["a57", "a7"], "1": ["a58", "a1"], "2": ["a59", "a6"], "3": ["a60", "a2"], "4": ["a61", "a4"] },
    // d10
    "d10": { "0": ["a64", "a1"], "1": ["a65", "a7"], "2": ["a66", "a4"], "3": ["a67", "a7"], "4": ["a68", "a7"] },
    // d11–d20 single tasks (will auto-fill on button press)
    "d11": { "0": ["a1"], "1": ["a8"], "2": ["a15"], "3": ["a22"], "4": ["a29"] },
    "d12": { "0": ["a2"], "1": ["a9"], "2": ["a16"], "3": ["a23"], "4": ["a30"] },
    "d13": { "0": ["a3"], "1": ["a10"], "2": ["a17"], "3": ["a24"], "4": ["a31"] },
    "d14": { "0": ["a4"], "1": ["a11"], "2": ["a18"], "3": ["a25"], "4": ["a32"] },
    "d15": { "0": ["a5"], "1": ["a12"], "2": ["a19"], "3": ["a26"], "4": ["a33"] },
    "d16": { "0": ["a6"], "1": ["a13"], "2": ["a20"], "3": ["a27"], "4": ["a34"] },
    "d17": { "0": ["a7"], "1": ["a14"], "2": ["a21"], "3": ["a28"], "4": ["a35"] },
    "d18": { "0": ["a50"], "1": ["a51"], "2": ["a52"], "3": ["a53"], "4": ["a60"] },
    "d19": { "0": ["a63"], "1": ["a64"], "2": ["a65"], "3": ["a66"], "4": ["a67"] },
    "d20": {},
};
export function DesignSchedulerScreen() {
    const router = useRouter();
    const [tasks, setTasks] = useState(INITIAL_TASKS);
    const [schedules, setSchedules] = useState(INITIAL_SCHEDULES);
    const [searchQuery, setSearchQuery] = useState("");
    // Custom Date selection state
    const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 3));
    const getWeekDays = (baseDate) => {
        const dates = [];
        const currentDay = baseDate.getDay() === 0 ? 7 : baseDate.getDay();
        const monday = new Date(baseDate);
        monday.setDate(baseDate.getDate() - currentDay + 1);
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            dates.push(d);
        }
        return dates;
    };
    const weekDates = getWeekDays(currentDate);
    const formattedWeekRange = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    const formattedTitleDate = currentDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase();
    const handleDateChange = (e) => {
        if (e.target.value) {
            const parts = e.target.value.split('-');
            setCurrentDate(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
        }
    };
    const handleDragStart = (e, taskId, sourceId, sourceDay) => {
        e.dataTransfer.setData("taskId", taskId);
        e.dataTransfer.setData("sourceId", sourceId);
        if (sourceDay)
            e.dataTransfer.setData("sourceDay", sourceDay);
    };
    const handleDragOver = (e) => {
        e.preventDefault();
    };
    const handleDropToDay = (e, targetDesignerId, targetDayIndex) => {
        e.preventDefault();
        // Block drops on weekends (Sat=5, Sun=6)
        if (targetDayIndex >= 5)
            return;
        const taskId = e.dataTransfer.getData("taskId");
        const sourceId = e.dataTransfer.getData("sourceId");
        const sourceDay = e.dataTransfer.getData("sourceDay");
        const targetDayStr = targetDayIndex.toString();
        if (!taskId)
            return;
        if (sourceId === targetDesignerId && sourceDay === targetDayStr)
            return;
        // Hard cap: block if it would exceed MAX_DAILY_HOURS (12h)
        const taskHours = tasks[taskId]?.estimatedHours || 0;
        const currentDayHours = getDayHours(targetDesignerId, targetDayIndex);
        if (currentDayHours + taskHours > MAX_DAILY_HOURS)
            return;
        setSchedules(prev => {
            const newSchedules = JSON.parse(JSON.stringify(prev));
            if (sourceId !== 'unassigned' && sourceId !== 'on-hold') {
                if (newSchedules[sourceId] && newSchedules[sourceId][sourceDay]) {
                    newSchedules[sourceId][sourceDay] = newSchedules[sourceId][sourceDay].filter(id => id !== taskId);
                }
            }
            if (!newSchedules[targetDesignerId])
                newSchedules[targetDesignerId] = {};
            if (!newSchedules[targetDesignerId][targetDayStr])
                newSchedules[targetDesignerId][targetDayStr] = [];
            newSchedules[targetDesignerId][targetDayStr].push(taskId);
            return newSchedules;
        });
        setTasks(prev => ({
            ...prev,
            [taskId]: { ...prev[taskId], status: "assigned" }
        }));
    };
    const handleDropToPanel = (e, newStatus) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData("taskId");
        const sourceId = e.dataTransfer.getData("sourceId");
        const sourceDay = e.dataTransfer.getData("sourceDay");
        if (!taskId)
            return;
        setSchedules(prev => {
            if (sourceId === 'unassigned' || sourceId === 'on-hold')
                return prev;
            const newSchedules = JSON.parse(JSON.stringify(prev));
            if (newSchedules[sourceId] && newSchedules[sourceId][sourceDay]) {
                newSchedules[sourceId][sourceDay] = newSchedules[sourceId][sourceDay].filter(id => id !== taskId);
            }
            return newSchedules;
        });
        setTasks(prev => ({
            ...prev,
            [taskId]: { ...prev[taskId], status: newStatus }
        }));
    };
    const unassignedTasks = Object.values(tasks).filter(t => t.status === "unassigned" && t.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const onHoldTasks = Object.values(tasks).filter(t => t.status === "on-hold" && t.name.toLowerCase().includes(searchQuery.toLowerCase()));
    /**
     * Auto-fill: for every designer’s weekday (Mon–Fri), greedily fill
     * remaining capacity below 8hrs by assigning unassigned tasks.
     */
    /**
     * Pure function to optimize a designer's schedule by shifting tasks
     * from future days (Tue–Fri) to fill gaps in earlier days (Mon–Thu)
     * up to the 8hr daily capacity.
     */
    const getOptimizedSchedule = (currentSchedules, currentTasks) => {
        const newSchedules = JSON.parse(JSON.stringify(currentSchedules));
        let changed = false;
        for (const designer of DUMMY_DESIGNERS) {
            const dId = designer.id;
            if (!newSchedules[dId])
                continue;
            // Iteratively fill each target day (Mon-Thu) from subsequent days (up to Fri)
            for (let targetDay = 0; targetDay < 4; targetDay++) {
                const targetDayStr = targetDay.toString();
                for (let sourceDay = targetDay + 1; sourceDay < 5; sourceDay++) {
                    const sourceDayStr = sourceDay.toString();
                    const sourceTasks = newSchedules[dId][sourceDayStr] || [];
                    if (sourceTasks.length === 0)
                        continue;
                    // Calculate current hours in the target day
                    let targetHours = (newSchedules[dId][targetDayStr] || [])
                        .reduce((sum, tid) => sum + (currentTasks[tid]?.estimatedHours || 0), 0);
                    if (targetHours >= DAILY_CAPACITY)
                        break;
                    const keptInSource = [];
                    const originalSourceLength = sourceTasks.length;
                    for (const tid of sourceTasks) {
                        const taskH = currentTasks[tid]?.estimatedHours || 0;
                        // Only move if it fits in the 8h daily capacity
                        if (targetHours + taskH <= DAILY_CAPACITY) {
                            if (!newSchedules[dId][targetDayStr])
                                newSchedules[dId][targetDayStr] = [];
                            newSchedules[dId][targetDayStr].push(tid);
                            targetHours += taskH;
                            changed = true;
                        }
                        else {
                            keptInSource.push(tid);
                        }
                    }
                    if (keptInSource.length !== originalSourceLength) {
                        newSchedules[dId][sourceDayStr] = keptInSource;
                    }
                }
            }
        }
        return { optimized: newSchedules, changed };
    };
    // Automatically optimize schedule whenever it changes
    useEffect(() => {
        const { optimized, changed } = getOptimizedSchedule(schedules, tasks);
        if (changed) {
            setSchedules(optimized);
        }
    }, [schedules, tasks]);
    // Get total hours for a specific day slot
    const getDayHours = (designerId, dayIndex) => {
        const dayTasks = (schedules[designerId] || {})[dayIndex.toString()] || [];
        return dayTasks.reduce((acc, taskId) => acc + (tasks[taskId]?.estimatedHours || 0), 0);
    };
    const getDesignerBookedHours = (designerId) => {
        const days = schedules[designerId] || {};
        // Only count weekdays (0-4) for weekly capacity
        return [0, 1, 2, 3, 4].reduce((acc, dayIdx) => {
            const dayTasks = days[dayIdx.toString()] || [];
            return acc + dayTasks.reduce((sum, taskId) => sum + (tasks[taskId]?.estimatedHours || 0), 0);
        }, 0);
    };
    // Count designers who have any day exceeding 8hrs
    const isDesignerOverloaded = (designerId) => {
        for (let d = 0; d < 5; d++) {
            if (getDayHours(designerId, d) > DAILY_CAPACITY)
                return true;
        }
        return false;
    };
    const totalScheduledHours = DUMMY_DESIGNERS.reduce((acc, d) => acc + getDesignerBookedHours(d.id), 0);
    const totalDesignersCount = DUMMY_DESIGNERS.length;
    const overloadedCount = DUMMY_DESIGNERS.filter(d => isDesignerOverloaded(d.id)).length;
    const totalScheduledTaskCount = Object.values(schedules).reduce((acc, curr) => acc + Object.values(curr).flat().length, 0);
    return (<div className="h-screen flex flex-col bg-gray-50 overflow-hidden font-sans">
      <Navbar />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm sm:px-6 shrink-0 z-10 relative">
        <div className="text-gray-500 font-medium">{formattedWeekRange}</div>
        <div className="text-gray-900 font-semibold">{formattedTitleDate}</div>
        <div className="relative group cursor-pointer rounded-lg p-1 hover:bg-gray-100">
          <Calendar size={20} className="text-gray-600 group-hover:text-gray-900 transition-colors"/>
          <input type="date" className="absolute inset-0 cursor-pointer opacity-0 w-full h-full" value={currentDate.toISOString().split('T')[0]} onChange={handleDateChange} onClick={(e) => {
            if ('showPicker' in e.currentTarget) {
                try {
                    e.currentTarget.showPicker();
                }
                catch (err) { }
            }
        }}/>
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 flex items-center px-6 py-2 text-sm text-gray-700 font-medium shrink-0 z-10 relative">
        <div className="w-64 border-r border-gray-200 pr-4">Unassigned &amp; On-HOLD</div>
        <div className="flex-1 flex px-6 justify-between items-center max-w-4xl">
          <div><span className="text-gray-500 font-medium mr-1">Designers:</span>{totalDesignersCount}</div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-green-400 rounded-sm"></div> Scheduled: {totalScheduledTaskCount}</div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-orange-400 rounded-sm"></div> Total Hours: {totalScheduledHours}h</div>
          <div className="flex items-center gap-2 text-red-500"><AlertTriangle size={14}/> Overloaded: {overloadedCount}</div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-64 bg-[#f8f9fc] border-r border-gray-200 flex flex-col shrink-0" onDragOver={handleDragOver} onDrop={(e) => handleDropToPanel(e, "unassigned")}>
          <div className="p-4 flex flex-col h-full">
             <div className="flex items-center justify-between font-semibold text-gray-900 mb-2 text-lg">
               Design Tasks
             </div>
             <div className="flex gap-4 text-xs font-medium text-gray-500 mb-4">
               <span className="flex items-center gap-1"><ClockIcon /> {unassignedTasks.reduce((acc, t) => acc + t.estimatedHours, 0) + onHoldTasks.reduce((acc, t) => acc + t.estimatedHours, 0)}h</span>
               <span>{unassignedTasks.length + onHoldTasks.length} Tasks</span>
               {onHoldTasks.length > 0 && <span className="text-red-500 flex items-center gap-1"><AlertTriangle size={12}/> {onHoldTasks.length}</span>}
             </div>

             <div className="relative mb-6">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search tasks..." className="w-full bg-white border border-gray-200 shadow-sm rounded-md py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"/>
             </div>

             <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 pb-4 custom-scrollbar">
                {onHoldTasks.map(task => (<div key={task.id} draggable onDragStart={(e) => handleDragStart(e, task.id, "on-hold")} className={`p-2 rounded cursor-grab active:cursor-grabbing flex flex-col relative bg-white shadow-sm hover:shadow-md transition-shadow ${task.colorClass}`}>
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-[11px] leading-tight pr-5">{task.name}</span>
                      <button className="bg-gray-200 hover:bg-gray-300 rounded-full p-0.5 text-gray-600 transition-colors absolute right-1.5 top-1.5">
                        <PauseCircle size={10}/>
                      </button>
                    </div>
                    <div className="text-[10px] opacity-70 mt-0.5">{task.tag}</div>
                    <div className="text-[9px] font-bold mt-1.5 bg-slate-100 text-slate-600 inline-block px-1.5 py-0.5 rounded uppercase self-start">Hold: {task.holdTime}</div>
                  </div>))}

                {unassignedTasks.map(task => (<div key={task.id} draggable onDragStart={(e) => handleDragStart(e, task.id, "unassigned")} className={`p-2 rounded cursor-grab active:cursor-grabbing flex flex-col relative group bg-white shadow-sm hover:shadow-md transition-shadow ${task.colorClass}`}>
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-[11px] leading-tight pr-5">{task.name}</span>
                      <button className="bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full p-0.5 absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus size={10}/>
                      </button>
                    </div>
                    <div className="text-[10px] opacity-80 mt-0.5">{task.tag}</div>
                  </div>))}
             </div>
          </div>
        </div>

        {/* Main Grid Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <div className="flex-1 overflow-auto">
            <div className="min-w-[800px]">
              {/* Grid Header */}
              <div className="flex bg-[#f0f3fa] text-gray-600 text-xs uppercase font-semibold sticky top-0 z-20 outline outline-1 outline-gray-200 shadow-sm">
                <div className="w-[180px] shrink-0 px-4 py-2 border-r border-gray-200 flex items-center">DESIGNER</div>
                <div className="flex-1 grid grid-cols-7">
                  {weekDates.map((date, idx) => {
            const isWeekend = idx >= 5;
            return (<div key={idx} className={`px-2 py-2 text-center border-r ${isWeekend ? 'border-orange-100 bg-gray-100 text-gray-400' : 'border-gray-200'}`}>
                        {date.toLocaleDateString("en-US", { weekday: "short" })} <span className={`font-normal ml-1 ${isWeekend ? 'text-gray-400' : 'text-gray-400'}`}>{date.getDate()}</span>
                        {isWeekend && <span className="block text-[8px] text-gray-400 font-normal normal-case tracking-wide">Holiday</span>}
                      </div>);
        })}
                </div>
              </div>
              
              {/* Designers Rows */}
              <div className="flex flex-col">
                {DUMMY_DESIGNERS.map((designer) => {
            const booked = getDesignerBookedHours(designer.id);
            const overloaded = isDesignerOverloaded(designer.id);
            const designerDays = schedules[designer.id] || {};
            return (<div key={designer.id} className="flex border-b border-gray-100 group relative min-h-[38px] items-stretch">
                      {/* Left: Designer Info */}
                      <div className="w-[180px] shrink-0 py-1.5 px-3 flex items-center gap-2 border-r border-gray-200 bg-white z-10 transition-colors group-hover:bg-gray-50">
                        <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold leading-none shrink-0 shadow-sm">
                          {designer.initials}
                        </div>
                        <div className="flex flex-col overflow-hidden w-full justify-center">
                          <span className="text-[11px] font-semibold text-gray-900 truncate tracking-tight">{designer.name}</span>
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-1 bg-gray-100 border border-gray-200 rounded-full mt-0.5 overflow-hidden">
                               <div className={`h-full rounded-full transition-all ${overloaded ? 'bg-red-400' : 'bg-blue-400'}`} style={{ width: `${Math.min((booked / WEEKLY_CAPACITY) * 100, 100)}%` }}></div>
                            </div>
                            <span className={`text-[9px] font-bold mt-0.5 ${overloaded ? 'text-red-500' : 'text-gray-400'}`}>{booked}h</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Explicit Day Zones */}
                      <div className="flex-1 grid grid-cols-7 relative">
                        {[0, 1, 2, 3, 4, 5, 6].map(dayIndex => {
                    const tasksInDay = designerDays[dayIndex.toString()] || [];
                    const isWeekend = dayIndex >= 5;
                    const dayHours = getDayHours(designer.id, dayIndex);
                    const isDayOverloaded = dayHours > DAILY_CAPACITY;
                    const gravityPct = Math.min((dayHours / DAILY_CAPACITY) * 100, 100);
                    return (<div key={dayIndex} className={`border-r relative flex flex-col transition-colors overflow-hidden
                                ${isWeekend
                            ? 'bg-gray-100 border-gray-200 cursor-not-allowed'
                            : isDayOverloaded
                                ? 'border-gray-100 bg-red-50/40'
                                : 'border-gray-100 hover:bg-blue-50/30'}
                              `} onDragOver={isWeekend ? undefined : handleDragOver} onDrop={isWeekend ? undefined : (e) => handleDropToDay(e, designer.id, dayIndex)}>
                              {/* Gravity fill bar (background) — weekdays only */}
                              {!isWeekend && dayHours > 0 && (<div className={`absolute bottom-0 left-0 right-0 transition-all opacity-20 ${isDayOverloaded ? 'bg-red-400' : 'bg-blue-400'}`} style={{ height: `${gravityPct}%` }}/>)}
                              {/* Tasks row */}
                              <div className="flex-1 flex flex-row items-center gap-1 p-1 relative z-10">
                                {isWeekend ? (<div className="w-full flex items-center justify-center">
                                    <span className="text-[8px] text-gray-400 font-medium select-none">—</span>
                                  </div>) : (tasksInDay.map((taskId, idx) => {
                            const taskInfo = tasks[taskId];
                            if (!taskInfo)
                                return null;
                            return (<div key={`${taskId}-${designer.id}-${dayIndex}-${idx}`} draggable onDragStart={(e) => handleDragStart(e, taskId, designer.id, dayIndex.toString())} className={`h-[24px] min-w-[30px] flex-1 rounded flex items-center justify-between px-1.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow transition-shadow ${taskInfo.colorClass}`} title={`${taskInfo.name} (${taskInfo.estimatedHours}h)`}>
                                        <div className="text-[9px] font-semibold truncate leading-none mr-1 select-none">{taskInfo.name}</div>
                                        <div className="text-[8px] font-bold opacity-60 bg-black/5 rounded px-1 shrink-0">{taskInfo.estimatedHours}h</div>
                                      </div>);
                        }))}
                              </div>
                              {/* Day hours indicator — weekdays only */}
                              {!isWeekend && dayHours > 0 && (<div className={`text-[8px] font-bold text-center pb-0.5 relative z-10 ${isDayOverloaded ? 'text-red-600' : 'text-blue-500/70'}`}>
                                  {dayHours}/{DAILY_CAPACITY}h
                                </div>)}
                            </div>);
                })}
                      </div>
                    </div>);
        })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>);
}
function ClockIcon() {
    return (<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>);
}
