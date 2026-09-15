/** "?" for a glossary term that opens the routed InfoTip sheet (`?sheet=term&id=…`, MOBILE §5.9). */
import { InfoTipButton } from '../ios/InfoTipButton';
import { GLOSSARY } from '../../lib/glossary';
import { useSheet } from '../../shell/useSheet';

export function TermTip({ id, className }: { id: string; className?: string }) {
  const { open } = useSheet();
  const entry = GLOSSARY[id];
  if (!entry) return null;
  return <InfoTipButton entry={entry} className={className ? `bx-tip ${className}` : 'bx-tip'} onClick={() => open({ kind: 'term', id })} />;
}
