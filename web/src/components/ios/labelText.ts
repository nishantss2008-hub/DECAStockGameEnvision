/**
 * Keeps an InfoTip "?" on the same line as the end of its label (MOBILE §5.5, §5.9). The label is
 * split before its last word; the last word and the "?" render inside one no-wrap span, so a
 * wrapped label never leaves the "?" alone on the next line. (A U+2060 word joiner does not stop
 * Chromium or WebKit from breaking before an inline-flex button.)
 */
export function splitLastWord(label: string): [head: string, last: string] {
  const text = label.replace(/[ \t\n\r]+$/, '');
  const match = /^(.*[ \t\n\r])([^ \t\n\r]+)$/s.exec(text);
  if (!match) return ['', text];
  return [match[1]!, match[2]!];
}
