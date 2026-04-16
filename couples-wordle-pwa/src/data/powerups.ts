export type PowerUpType = 'extra-hint' | 'reveal-letter' | 'swap-row';

export const powerups: Record<PowerUpType, { title: string; desc: string }> = {
  'extra-hint': { title: 'Extra Hint', desc: 'Request one more contextual hint.' },
  'reveal-letter': { title: 'Reveal Letter', desc: 'Reveal one correct letter.' },
  'swap-row': { title: 'Swap Row', desc: 'Swap your current row with a fresh attempt.' }
};
