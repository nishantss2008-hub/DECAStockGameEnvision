/**
 * Pure mapping from Button variant × tone to a MOBILE §5.7 style.
 * Destructive is never the prominent (filled) style; unsupported pairs keep
 * the variant's neutral style instead of inventing new colours.
 */

export type ButtonVariant = 'filled' | 'tinted' | 'gray' | 'plain' | 'glass';
export type ButtonTone = 'default' | 'buy' | 'sell' | 'destructive';
export type ButtonSize = 'large' | 'medium' | 'small';

export type ButtonStyleName =
  | 'prominent'
  | 'buy'
  | 'sell'
  | 'tinted'
  | 'tinted-sell'
  | 'destructive-tinted'
  | 'gray'
  | 'plain'
  | 'destructive-plain'
  | 'glass';

export function buttonStyle(variant: ButtonVariant, tone: ButtonTone): ButtonStyleName {
  switch (variant) {
    case 'filled':
      if (tone === 'buy') return 'buy';
      if (tone === 'sell') return 'sell';
      if (tone === 'destructive') return 'destructive-tinted';
      return 'prominent';
    case 'tinted':
      if (tone === 'sell') return 'tinted-sell';
      if (tone === 'destructive') return 'destructive-tinted';
      return 'tinted';
    case 'plain':
      return tone === 'destructive' ? 'destructive-plain' : 'plain';
    case 'gray':
      return 'gray';
    case 'glass':
      return 'glass';
  }
}
