/** Shared visual tokens for leave / regularization timeline blocks. */

export const LEAVE_BLOCK_CLASS =
  "bg-amber-50 border border-dashed border-amber-400 text-amber-950 shadow-none";

export const REGULARIZATION_BLOCK_CLASS =
  "bg-violet-50 border border-dashed border-violet-400 text-violet-950 shadow-none";

export const LEAVE_BLOCK_HATCH = {
  backgroundImage:
    "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(180, 83, 9, 0.09) 3px, rgba(180, 83, 9, 0.09) 6px)",
};

export const REGULARIZATION_BLOCK_HATCH = {
  backgroundImage:
    "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(109, 40, 217, 0.08) 3px, rgba(109, 40, 217, 0.08) 6px)",
};

export function getSystemBlockColorClass(requestType) {
  if (requestType === "LEAVE") return LEAVE_BLOCK_CLASS;
  if (requestType === "REGULARIZATION") return REGULARIZATION_BLOCK_CLASS;
  return null;
}

export function getSystemBlockHatchStyle(requestType) {
  if (requestType === "LEAVE") return LEAVE_BLOCK_HATCH;
  if (requestType === "REGULARIZATION") return REGULARIZATION_BLOCK_HATCH;
  return undefined;
}

export function getSystemBlockBadge(requestType) {
  if (requestType === "LEAVE") {
    return {
      label: "LEAVE",
      className: "bg-amber-200/70 text-amber-800 border border-amber-300/60",
    };
  }
  if (requestType === "REGULARIZATION") {
    return {
      label: "REG",
      className: "bg-violet-200/60 text-violet-700 border border-violet-300/50",
    };
  }
  return null;
}
