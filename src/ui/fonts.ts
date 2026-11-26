import type { FontId } from '../core/settings';

export const FONT_STACKS: Record<FontId, string> = {
  'eb-garamond': "'EB Garamond', Garamond, Georgia, serif",
  'libre-baskerville': "'Libre Baskerville', Baskerville, Georgia, serif",
  literata: "'Literata', Georgia, serif",
  'crimson-pro': "'Crimson Pro', Georgia, serif",
  cormorant: "'Cormorant Garamond', Garamond, Georgia, serif",
  'source-serif': "'Source Serif 4', Georgia, serif",
  'system-serif': "ui-serif, 'New York', 'Iowan Old Style', Georgia, 'Times New Roman', serif",
};

export const FONT_NAMES: Record<FontId, string> = {
  'eb-garamond': 'EB Garamond',
  'libre-baskerville': 'Libre Baskerville',
  literata: 'Literata',
  'crimson-pro': 'Crimson Pro',
  cormorant: 'Cormorant Garamond',
  'source-serif': 'Source Serif 4',
  'system-serif': 'System serif (New York on Apple devices)',
};
