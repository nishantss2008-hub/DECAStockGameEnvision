/** `?sheet=term&id=peRatio` → the glossary InfoTip sheet (MOBILE §5.9). Unknown ids close the sheet. */
import { useEffect } from 'react';
import { InfoTipSheet } from '../components/ios/InfoTipSheet';
import { GLOSSARY } from '../lib/glossary';
import type { RoutedSheetProps } from '../shell/useSheet';

export default function InfoTipRoute({ open, onClose, termId }: RoutedSheetProps & { termId: string }) {
  const entry = GLOSSARY[termId] ?? null;
  useEffect(() => {
    if (open && !entry) onClose();
  }, [open, entry, onClose]);
  return <InfoTipSheet entry={open ? entry : null} open={open && entry !== null} onOpenChange={(next) => !next && onClose()} replaceOnOpenInLearn />;
}
