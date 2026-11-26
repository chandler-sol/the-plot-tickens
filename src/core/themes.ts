export type ThemeId = 'paper' | 'eink' | 'parchment' | 'oled' | 'midnight' | 'sepia' | 'system';

export interface ThemePalette {
  id: Exclude<ThemeId, 'system'>;
  name: string;
  description: string;
  bg: string;
  text: string;
  muted: string;
  highlight: string;
  rule: string;
  /** browser chrome / status bar colour */
  chrome: string;
  dark: boolean;
}

export const THEMES: Record<Exclude<ThemeId, 'system'>, ThemePalette> = {
  paper: {
    id: 'paper', name: 'Paper', description: 'Warm off-white and charcoal',
    bg: '#f4efe6', text: '#2b2926', muted: '#7a746b', highlight: '#141311', rule: '#d9d1c3', chrome: '#f4efe6', dark: false,
  },
  eink: {
    id: 'eink', name: 'E-Ink', description: 'Neutral grey, like electronic paper',
    bg: '#e4e4e1', text: '#262626', muted: '#6b6b69', highlight: '#000000', rule: '#c4c4c0', chrome: '#e4e4e1', dark: false,
  },
  parchment: {
    id: 'parchment', name: 'Parchment', description: 'Muted vintage paper',
    bg: '#ebdfc4', text: '#3b3226', muted: '#7d6d55', highlight: '#22190f', rule: '#cdbb98', chrome: '#ebdfc4', dark: false,
  },
  oled: {
    id: 'oled', name: 'OLED', description: 'Pure black, soft white',
    bg: '#000000', text: '#cfcbc4', muted: '#77736d', highlight: '#f4f1ec', rule: '#262626', chrome: '#000000', dark: true,
  },
  midnight: {
    id: 'midnight', name: 'Midnight', description: 'Deep navy, warm ivory',
    bg: '#0f1626', text: '#e8dfca', muted: '#8f8a7c', highlight: '#fff6e0', rule: '#223049', chrome: '#0f1626', dark: true,
  },
  sepia: {
    id: 'sepia', name: 'Sepia', description: 'Warm brown on cream',
    bg: '#f6ecd6', text: '#5b4128', muted: '#9a7f60', highlight: '#3a2614', rule: '#e0cfab', chrome: '#f6ecd6', dark: false,
  },
};

export const THEME_ORDER: ThemeId[] = ['paper', 'eink', 'parchment', 'sepia', 'midnight', 'oled', 'system'];

export function resolveTheme(id: ThemeId, prefersDark: boolean): ThemePalette {
  if (id === 'system') return prefersDark ? THEMES.oled : THEMES.paper;
  return THEMES[id] ?? THEMES.paper;
}
