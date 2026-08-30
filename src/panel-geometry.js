export const PANEL_DEFAULT_WIDTH = 720;
export const PANEL_DEFAULT_HEIGHT = 340;
export const PANEL_MIN_WIDTH = 320;
export const PANEL_MIN_HEIGHT = 240;
export const PANEL_MARGIN = 12;
export const PANEL_GAP = 12;

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function normalizePanelSize(width, height, viewport, margin = PANEL_MARGIN) {
  const viewportWidth = Math.max(1, finite(viewport?.width, PANEL_DEFAULT_WIDTH + margin * 2));
  const viewportHeight = Math.max(1, finite(viewport?.height, PANEL_DEFAULT_HEIGHT + margin * 2));
  const maxWidth = Math.max(1, viewportWidth - margin * 2);
  const maxHeight = Math.max(1, viewportHeight - margin * 2);
  return {
    width: clamp(finite(width, PANEL_DEFAULT_WIDTH), Math.min(PANEL_MIN_WIDTH, maxWidth), maxWidth),
    height: clamp(finite(height, PANEL_DEFAULT_HEIGHT), Math.min(PANEL_MIN_HEIGHT, maxHeight), maxHeight),
  };
}

export function panelRectsOverlap(left, top, width, height, other) {
  if (!other) return false;
  return left < other.right
    && left + width > other.left
    && top < other.bottom
    && top + height > other.top;
}

function boundedPosition(left, top, width, height, viewport, margin) {
  const viewportWidth = Math.max(1, finite(viewport?.width, width + margin * 2));
  const viewportHeight = Math.max(1, finite(viewport?.height, height + margin * 2));
  return {
    left: clamp(finite(left, margin), margin, viewportWidth - width - margin),
    top: clamp(finite(top, margin), margin, viewportHeight - height - margin),
  };
}

function normalizeAnchor(anchor) {
  if (!anchor) return null;
  const left = finite(anchor.left, 0);
  const top = finite(anchor.top, 0);
  const right = finite(anchor.right, left + finite(anchor.width, 0));
  const bottom = finite(anchor.bottom, top + finite(anchor.height, 0));
  return { left, top, right, bottom };
}

export function findPanelPosition({ anchor = null, width, height, viewport, preferred = null, margin = PANEL_MARGIN, gap = PANEL_GAP } = {}) {
  const safeWidth = Math.max(1, finite(width, PANEL_DEFAULT_WIDTH));
  const safeHeight = Math.max(1, finite(height, PANEL_DEFAULT_HEIGHT));
  const safeAnchor = normalizeAnchor(anchor);
  const candidates = [];
  if (preferred) candidates.push(preferred);
  if (safeAnchor) {
    candidates.push(
      { left: safeAnchor.left, top: safeAnchor.top - safeHeight - gap },
      { left: safeAnchor.right + gap, top: safeAnchor.top },
      { left: safeAnchor.left - safeWidth - gap, top: safeAnchor.top },
      { left: safeAnchor.left, top: safeAnchor.bottom + gap },
    );
  } else {
    const viewportWidth = finite(viewport?.width, safeWidth + margin * 2);
    const viewportHeight = finite(viewport?.height, safeHeight + margin * 2);
    candidates.push({
      left: (viewportWidth - safeWidth) / 2,
      top: (viewportHeight - safeHeight) / 2,
    });
  }

  let firstBounded = null;
  for (const candidate of candidates) {
    const bounded = boundedPosition(candidate.left, candidate.top, safeWidth, safeHeight, viewport, margin);
    firstBounded ??= bounded;
    if (!panelRectsOverlap(bounded.left, bounded.top, safeWidth, safeHeight, safeAnchor)) return bounded;
  }
  return firstBounded ?? boundedPosition(margin, margin, safeWidth, safeHeight, viewport, margin);
}

