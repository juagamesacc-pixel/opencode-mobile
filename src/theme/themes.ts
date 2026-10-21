import porcelain from '../../assets/theme-presets/porcelain.json';
import linen from '../../assets/theme-presets/linen.json';
import signal from '../../assets/theme-presets/signal.json';
import hotline from '../../assets/theme-presets/hotline.json';
import phosphor from '../../assets/theme-presets/phosphor.json';
import matchSyntax from '../../assets/syntax-presets/syntax-manifest.json';
import nocturne from '../../assets/syntax-presets/nocturne.json';
import citrus from '../../assets/syntax-presets/citrus.json';
import neon from '../../assets/syntax-presets/neon.json';
import paper from '../../assets/syntax-presets/paper.json';

export type ThemeID = 'porcelain' | 'linen' | 'signal' | 'hotline' | 'phosphor';
export type SyntaxID = 'match' | 'nocturne' | 'citrus' | 'neon' | 'paper';
export type ThemeMode = 'light' | 'dark' | 'system';

type Preset = {
  id: ThemeID;
  name: string;
  light: { palette: Record<string, string>; overrides: Record<string, string> };
  dark: { palette: Record<string, string>; overrides: Record<string, string> };
};

export const THEME_PRESETS: Preset[] = [porcelain, linen, signal, hotline, phosphor] as Preset[];
export const THEME_MANIFEST = [
  { id: 'porcelain', name: 'Porcelain', blurb: 'Near-white / near-black' },
  { id: 'linen', name: 'Linen', blurb: 'Warm paper / espresso' },
  { id: 'signal', name: 'Signal', blurb: 'True white / true black' },
  { id: 'hotline', name: 'Hotline', blurb: 'Neutral chrome, loud pink' },
  { id: 'phosphor', name: 'Phosphor', blurb: 'Neutral chrome, CRT green' },
] as { id: ThemeID; name: string; blurb: string }[];

export const SYNTAX_MANIFEST = matchSyntax as { id: SyntaxID; name: string; blurb: string }[];
export const SYNTAX_PRESETS: Record<Exclude<SyntaxID, 'match'>, any> = {
  nocturne, citrus, neon, paper,
};

export interface AppTheme {
  id: ThemeID;
  mode: 'light' | 'dark';
  colors: {
    background: string;
    surface: string;
    surfaceRaised: string;
    surfaceInteractive: string;
    surfaceSuccess: string;
    surfaceCritical: string;
    text: string;
    textBase: string;
    textWeak: string;
    textWeaker: string;
    textInteractive: string;
    iconInvert: string;
    border: string;
    borderWeaker: string;
    icon: string;
    iconStrong: string;
    buttonPrimary: string;
    interactive: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    diffAdd: string;
    diffDelete: string;
    codeBg: string;
  };
  syntax: Record<string, string>;
}

function pick(o: Record<string, string>, key: string, fallback: string) {
  return o[key] || fallback;
}

export function buildTheme(id: ThemeID, mode: 'light' | 'dark', syntaxID: SyntaxID): AppTheme {
  const preset = THEME_PRESETS.find((p) => p.id === id) || THEME_PRESETS[0];
  const raw = mode === 'light' ? preset.light : preset.dark;
  const o = raw.overrides;
  const colors = {
    background: pick(o, 'background-base', mode === 'light' ? '#f7f7f7' : '#111111'),
    surface: pick(o, 'surface-base', mode === 'light' ? '#f7f7f7' : '#111111'),
    surfaceRaised: pick(o, 'surface-raised-base', mode === 'light' ? '#ffffff' : '#1b1b1b'),
    surfaceInteractive: pick(o, 'surface-interactive-weak', mode === 'light' ? '#e8eeff' : '#1e2638'),
    surfaceSuccess: pick(o, 'surface-success-base', mode === 'light' ? '#e3f5ea' : '#122a1c'),
    surfaceCritical: pick(o, 'surface-critical-base', mode === 'light' ? '#fcecec' : '#2e1515'),
    text: pick(o, 'text-strong', mode === 'light' ? '#171717' : '#f5f5f5'),
    textBase: pick(o, 'text-base', mode === 'light' ? '#6f6f6f' : '#a6a6a6'),
    textWeak: pick(o, 'text-weak', mode === 'light' ? '#8f8f8f' : '#858585'),
    textWeaker: pick(o, 'text-weaker', mode === 'light' ? '#c7c7c7' : '#5c5c5c'),
    textInteractive: pick(o, 'text-interactive-base', '#1456f7'),
    iconInvert: pick(o, 'icon-invert-base', '#ffffff'),
    border: pick(o, 'border-weak-base', mode === 'light' ? '#e5e5e5' : '#2b2b2b'),
    borderWeaker: pick(o, 'border-weaker-base', mode === 'light' ? '#f0f0f0' : '#222222'),
    icon: pick(o, 'icon-base', '#8f8f8f'),
    iconStrong: pick(o, 'icon-strong-base', mode === 'light' ? '#171717' : '#f5f5f5'),
    buttonPrimary: pick(o, 'button-primary-base', mode === 'light' ? '#171717' : '#f5f5f5'),
    interactive: pick(o, 'interactive', '#1456f7'),
    success: pick(o, 'success', '#089b00'),
    warning: pick(o, 'warning', '#c78b05'),
    error: pick(o, 'error', '#cb321c'),
    info: pick(o, 'info', '#5a5a8a'),
    diffAdd: pick(o, 'diff-add', '#089b00'),
    diffDelete: pick(o, 'diff-delete', '#cb321c'),
    codeBg: pick(o, 'markdown-code-bg', mode === 'light' ? '#f1f1f1' : '#1d1d1d'),
  };
  let syntax: Record<string, string> = {
    comment: pick(o, 'syntax-comment', colors.textWeak),
    keyword: pick(o, 'syntax-keyword', colors.interactive),
    string: pick(o, 'syntax-string', colors.success),
    primitive: pick(o, 'syntax-primitive', colors.interactive),
    property: pick(o, 'syntax-property', colors.info),
    type: pick(o, 'syntax-type', colors.warning),
    constant: pick(o, 'syntax-constant', colors.info),
    variable: pick(o, 'syntax-variable', colors.error),
    operator: pick(o, 'syntax-operator', colors.textBase),
    punctuation: pick(o, 'syntax-punctuation', colors.textBase),
  };
  if (syntaxID !== 'match') {
    const presetSyntax = SYNTAX_PRESETS[syntaxID]?.[mode];
    if (presetSyntax) {
      syntax = Object.fromEntries(
        Object.entries(presetSyntax).map(([k, v]) => [k.replace('syntax-', ''), v as string]),
      );
    }
  }
  return { id, mode, colors, syntax };
}
