/**
 * Light-appearance tokens under a class, for the gallery only. tokens.css switches to dark tokens
 * through `prefers-color-scheme`, so on a phone or laptop set to dark mode the "Light" pane would
 * otherwise render dark. The rule is generated from tokens.css itself (the colour properties that
 * the dark list overrides), so it can never drift from the real light values.
 */
import tokensCss from '../theme/tokens.css?raw';
import { customProperties, declarationsFor, parseStylesheet } from '../theme/cssTokens';

export const KIT_LIGHT_CLASS = 'kit-light';

export function lightTokenRule(css: string, selector = `.${KIT_LIGHT_CLASS}`): string {
  const rules = parseStylesheet(css);
  const light = customProperties(rules, { colorScheme: 'light' }, [':root']);
  const themed = Object.keys(declarationsFor(rules, {}, ['.dark'])).filter((p) => p.startsWith('--'));
  const body = themed
    .filter((p) => light[p] !== undefined)
    .map((p) => `${p}:${light[p]};`)
    .join('');
  return `${selector}{color-scheme:light;${body}color:var(--label);}`;
}

export function installLightTokens(): void {
  if (document.getElementById('kit-light-tokens')) return;
  const style = document.createElement('style');
  style.id = 'kit-light-tokens';
  style.textContent = lightTokenRule(tokensCss);
  document.head.appendChild(style);
}
