/** "?" that opens the InfoTip sheet for a glossary term through the URL (`?sheet=term&id=…`, MOBILE §5.9 / §6.5). */
import { InfoTipButton } from '../ios/InfoTipButton';
import { GLOSSARY } from '../../lib/glossary';
import { useSheet } from '../../shell/useSheet';

export function TermInfo({ id, className }: { id: string; className?: string }) {
  const { open } = useSheet();
  const entry = GLOSSARY[id];
  if (!entry) return null;
  return <InfoTipButton entry={entry} className={className} onClick={() => open({ kind: 'term', id })} />;
}
