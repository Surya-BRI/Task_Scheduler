import { readFileSync } from 'fs';
import path from 'path';
import { DESIGNER_PROFILES, isUuidString, profileForRouteId } from './designers';

const DESIGNERS_DIR = path.join(process.cwd(), 'src', 'data', 'designers');

function loadJsonDesigner(slug) {
  const filePath = path.join(DESIGNERS_DIR, `${slug}.json`);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function loadD1Template() {
  return loadJsonDesigner('d1');
}

/**
 * Resolve a designer dashboard payload for route param (slug d1, UUID, or undefined).
 */
export function getDesigner(routeId) {
  const id = String(routeId ?? '').trim();
  if (!id || id === 'undefined') return null;

  try {
    const data = loadJsonDesigner(id);
    const profile = profileForRouteId(id);
    return {
      ...data,
      id: data.id ?? profile?.id ?? id,
      name: data.name ?? profile?.name ?? 'Designer',
      erpDesignerId: data.erpDesignerId ?? (isUuidString(id) ? id : undefined),
    };
  } catch {
    // not a JSON file for this id
  }

  const profile = profileForRouteId(id);
  if (profile) {
    try {
      const base = loadD1Template();
      return {
        ...base,
        id: profile.id,
        name: profile.name,
        erpDesignerId: base.erpDesignerId,
      };
    } catch {
      return null;
    }
  }

  if (isUuidString(id)) {
    try {
      const base = loadD1Template();
      return {
        ...base,
        id,
        name: 'Designer',
        erpDesignerId: id,
      };
    } catch {
      return null;
    }
  }

  if (DESIGNER_PROFILES.some((p) => p.id === id)) {
    try {
      const base = loadD1Template();
      const profile = DESIGNER_PROFILES.find((p) => p.id === id);
      return {
        ...base,
        id: profile.id,
        name: profile.name,
      };
    } catch {
      return null;
    }
  }

  return null;
}
