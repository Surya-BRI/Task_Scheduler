"use client";
import { useEffect, useRef } from "react";

export default function DonutChart({ donut, onSelectSegment, activeSegment }) {
  const canvasRef = useRef(null);
  const size = 180;

  const active = donut?.active ?? { value: 0, pct: 0, color: "#4f8ef7" };
  const inReview = donut?.inReview ?? { value: 0, pct: 0, color: "#8b5cf6" };
  const onHold = donut?.onHold ?? { value: 0, pct: 0, color: "#f5a623" };
  const closed = donut?.closed ?? donut?.completed ?? { value: 0, pct: 0, color: "#7ed321" };
  const centerPct = donut?.centerPct ?? 0;
  const centerTotal = donut?.centerTotal ?? 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cx = size / 2;
    const cy = size / 2;
    const outerR = size / 2 - 8;
    const innerR = outerR * 0.62;

    const slices = [
      { value: Number(active?.value) || 0, pct: Number(active?.pct) || 0, color: active?.color || "#4f8ef7" },
      { value: Number(inReview?.value) || 0, pct: Number(inReview?.pct) || 0, color: inReview?.color || "#8b5cf6" },
      { value: Number(onHold?.value) || 0, pct: Number(onHold?.pct) || 0, color: onHold?.color || "#f5a623" },
      { value: Number(closed?.value) || 0, pct: Number(closed?.pct) || 0, color: closed?.color || "#7ed321" },
    ];
    const valueTotal = slices.reduce((sum, slice) => sum + slice.value, 0);
    const pctTotal = slices.reduce((sum, slice) => sum + slice.pct, 0);
    const useValues = valueTotal > 0;
    const weightTotal = useValues ? valueTotal : pctTotal;

    ctx.clearRect(0, 0, size, size);

    if (!(weightTotal > 0)) {
      ctx.beginPath();
      ctx.arc(cx, cy, (outerR + innerR) / 2, 0, 2 * Math.PI);
      ctx.lineWidth = outerR - innerR;
      ctx.strokeStyle = "#e2e8f0";
      ctx.stroke();
      return;
    }

    let startAngle = -Math.PI / 2;
    for (const slice of slices) {
      const weight = useValues ? slice.value : slice.pct;
      if (!(weight > 0)) continue;
      const sweep = (weight / weightTotal) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sweep);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();
      startAngle += sweep;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.fillStyle = "#fff";
    ctx.fill();

    startAngle = -Math.PI / 2;
    for (const slice of slices) {
      const weight = useValues ? slice.value : slice.pct;
      if (!(weight > 0)) continue;
      const sweep = (weight / weightTotal) * 2 * Math.PI;
      if (sweep < 0.25) {
        startAngle += sweep;
        continue;
      }
      const midAngle = startAngle + sweep / 2;
      const labelR = (outerR + innerR) / 2;
      const lx = cx + labelR * Math.cos(midAngle);
      const ly = cy + labelR * Math.sin(midAngle);
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(size * 0.075)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${slice.pct}%`, lx, ly);
      startAngle += sweep;
    }
  }, [donut, active, inReview, onHold, closed, size]);

  const legendBtn = (segment, color, label, value) => (
    <button
      type="button"
      onClick={() => onSelectSegment?.(activeSegment === segment ? null : segment)}
      className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-slate-50 ${
        activeSegment === segment ? "bg-slate-100" : ""
      }`}
    >
      <span className="h-3.5 w-3.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
      <span className="font-semibold">{label}: {value}</span>
    </button>
  );

  return (
    <div className="flex flex-col items-center gap-4 w-full px-3 py-1">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="block"
          style={{ width: size, height: size }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-extrabold text-slate-900 leading-none">{centerPct}%</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mt-0.5">Closed</span>
          <span className="text-sm font-bold text-slate-700 leading-none mt-0.5">{centerTotal}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-sm text-slate-700 w-full px-1">
        {legendBtn("active", active.color, "Active", active.value)}
        {legendBtn("inReview", inReview.color, "In Review", inReview.value)}
        {legendBtn("onHold", onHold.color, "On Hold", onHold.value)}
        {legendBtn("closed", closed.color, "Closed", closed.value)}
      </div>
    </div>
  );
}
