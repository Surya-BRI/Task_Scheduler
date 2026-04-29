"use client";
import { useEffect, useRef } from "react";

export default function DonutChart({ donut }) {
  const canvasRef = useRef(null);
  const { active, onHold, completed, centerPct, centerTotal } = donut;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const outerR = size / 2 - 4;
    const innerR = outerR * 0.62;

    const total = active.pct + onHold.pct + completed.pct;
    const slices = [
      { pct: active.pct,    color: active.color    },
      { pct: onHold.pct,   color: onHold.color    },
      { pct: completed.pct, color: completed.color  },
    ];

    ctx.clearRect(0, 0, size, size);

    let startAngle = -Math.PI / 2;
    slices.forEach(({ pct, color }) => {
      const sweep = (pct / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sweep);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      startAngle += sweep;
    });

    // Donut hole
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Draw percentage labels on slices
    startAngle = -Math.PI / 2;
    slices.forEach(({ pct }) => {
      const sweep = (pct / total) * 2 * Math.PI;
      const midAngle = startAngle + sweep / 2;
      const labelR = (outerR + innerR) / 2;
      const lx = cx + labelR * Math.cos(midAngle);
      const ly = cy + labelR * Math.sin(midAngle);
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${size * 0.075}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${pct}%`, lx, ly);
      startAngle += sweep;
    });
  }, [donut]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Chart */}
      <div className="relative inline-block">
        <canvas ref={canvasRef} width={150} height={150} />
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-extrabold text-gray-900 leading-none">{centerPct}%</span>
          <span className="text-sm font-bold text-gray-700 leading-none mt-0.5">{centerTotal}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-1 text-xs text-gray-700 w-full px-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: donut.active.color }} />
          <span className="font-semibold">Active</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: donut.onHold.color }} />
          <span className="font-semibold">On Hold</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: donut.completed.color }} />
          <span className="font-semibold">Completed Total</span>
        </div>
      </div>
    </div>
  );
}
