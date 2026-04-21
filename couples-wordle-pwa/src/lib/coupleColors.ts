export interface CoupleTheme {
  color: string;
  /** True when the color wasn't explicitly picked by a member — derived from couple_id. */
  isDefault: boolean;
}

// Curated warm/muted hex palette chosen to read on the cream/sage surface.
// Also exposed for the profile color picker so the swatches match what
// the leaderboard falls back to.
export const COUPLE_COLOR_PALETTE: readonly string[] = [
  '#E07A5F',
  '#F2CC8F',
  '#81B29A',
  '#3D5A80',
  '#8D99AE',
  '#B5838D',
  '#6D6875',
  '#A8DADC',
  '#457B9D',
  '#E63946',
  '#9D8189',
  '#F4A261'
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string | null | undefined): value is string {
  return !!value && HEX_RE.test(value);
}

/**
 * Resolve a couple's theme color. Uses the stored value when valid,
 * otherwise derives a deterministic palette slot from couple_id so the
 * UI always shows the same color for the same couple.
 */
export function resolveCoupleColor(coupleId: string, stored: string | null | undefined): CoupleTheme {
  if (isValidHexColor(stored)) return { color: stored, isDefault: false };
  return { color: COUPLE_COLOR_PALETTE[hashToIndex(coupleId, COUPLE_COLOR_PALETTE.length)], isDefault: true };
}

function hashToIndex(input: string, modulo: number): number {
  // FNV-1a 32-bit — cheap, stable, good enough for UI bucketing.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h) % Math.max(1, modulo);
}
