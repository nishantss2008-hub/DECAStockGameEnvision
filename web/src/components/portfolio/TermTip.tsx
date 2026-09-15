/** The "?" after a metric label (MOBILE §5.9): opens the glossary InfoTip sheet at `?sheet=term&id=…`. */
import { InfoTipButton } from '../ios/InfoTipButton';
import { GLOSSARY } from '../../lib/glossary';
import { useSheet } from '../../shell/useSheet';

export function TermTip({ id, className }: { id: string; className?: string }) {
  const { open } = useSheet();
  const entry = GLOSSARY[id];
  if (!entry) return null;
  return <InfoTipButton entry={entry} className={className} data-term={id} onClick={() => open({ kind: 'term', id })} />;
}
