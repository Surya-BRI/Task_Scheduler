const PLATFORM_META = {
  onedrive: {
    id: "onedrive",
    label: "OneDrive",
    badgeClass: "bg-sky-100 text-sky-800 border-sky-200",
    icon: "OD",
  },
  google_drive: {
    id: "google_drive",
    label: "Google Drive",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: "GD",
  },
  sharepoint: {
    id: "sharepoint",
    label: "SharePoint",
    badgeClass: "bg-teal-100 text-teal-800 border-teal-200",
    icon: "SP",
  },
  dropbox: {
    id: "dropbox",
    label: "Dropbox",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
    icon: "DB",
  },
  generic: {
    id: "generic",
    label: "External link",
    badgeClass: "bg-slate-100 text-slate-800 border-slate-200",
    icon: "LN",
  },
};

export function normalizeExternalUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function isValidExternalUrl(value) {
  try {
    const url = new URL(normalizeExternalUrl(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function detectLinkPlatform(urlString) {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    if (host.includes("1drv.ms") || host.includes("onedrive.live.com") || host.includes("onedrive.com")) {
      return PLATFORM_META.onedrive;
    }
    if (host.includes("sharepoint.com") || host.includes("sharepoint.")) {
      return PLATFORM_META.sharepoint;
    }
    if (
      host.includes("drive.google.com") ||
      host.includes("docs.google.com") ||
      host.includes("drive.googleusercontent.com")
    ) {
      return PLATFORM_META.google_drive;
    }
    if (host.includes("dropbox.com") || host.includes("dropboxusercontent.com")) {
      return PLATFORM_META.dropbox;
    }
    return PLATFORM_META.generic;
  } catch {
    return PLATFORM_META.generic;
  }
}

function decodeSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getLinkDisplayName(urlString) {
  try {
    const url = new URL(urlString);
    const segments = url.pathname.split("/").filter(Boolean).map(decodeSegment);
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment !== "view" && lastSegment !== "edit") {
      return lastSegment.replace(/\+/g, " ");
    }
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "Shared link";
  }
}

export function createLinkAttachment(urlValue, id = `link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) {
  const url = normalizeExternalUrl(urlValue);
  const platform = detectLinkPlatform(url);
  return {
    id,
    url,
    platformId: platform.id,
    platformLabel: platform.label,
    platformBadgeClass: platform.badgeClass,
    platformIcon: platform.icon,
    name: getLinkDisplayName(url),
  };
}
