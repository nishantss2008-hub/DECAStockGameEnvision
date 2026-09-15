/**
 * iOS-style component library (MOBILE §5). Plain CSS co-located with each
 * component; @base-ui/react only for overlay behaviour.
 *
 * Add further components as their own section below; keep names unique.
 */

// ─── Navigation, lists, controls (MOBILE §5.1–§5.7, §5.20, §5.21, §5.24, §5.25) ───

export { TabBar, type TabBarItem, type TabBarProps, type TabItemClickInfo } from './TabBar';
export { activeTabIndex, badgeText, tabAccessibleName, type TabBadge } from './tabBarMatch';

export {
  LargeTitleNavBar,
  NavBarButton,
  NavBarButtonGroup,
  StatusLine,
  type LargeTitleNavBarProps,
  type NavBarButtonGroupProps,
  type NavBarButtonProps,
  type StatusLineProps,
} from './LargeTitleNavBar';
export { isCollapsedEntry } from './navBarCollapse';

export { SearchField, type SearchFieldProps } from './SearchField';

export { InsetGroupedList, type InsetGroupedListProps } from './InsetGroupedList';
export {
  ListRow,
  StockRow,
  KeyValueRow,
  ExplainRow,
  DisclosureRow,
  ActionRow,
  DestructiveRow,
  ToggleRow,
  type ListRowProps,
  type StockRowProps,
  type KeyValueRowProps,
  type ExplainRowProps,
  type DisclosureRowProps,
  type ActionRowProps,
  type ToggleRowProps,
} from './ListRow';
export { isLargeTextRoot, useLargeText, useLargeTextAttribute, LARGE_TEXT_ROOT_PX } from './largeText';
export { splitLastWord } from './labelText';

export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from './SegmentedControl';
export {
  segmentedReducer,
  keyToSegmentedAction,
  segmentedPresentation,
  segmentedMenuButtonText,
  SEGMENTED_MAX_AT_LARGE_TEXT,
  type SegmentedAction,
  type SegmentedState,
} from './segmentedReducer';

export { Button, type ButtonProps } from './Button';
export { buttonStyle, type ButtonSize, type ButtonStyleName, type ButtonTone, type ButtonVariant } from './buttonClass';

export {
  ChangePill,
  ChangeTriangle,
  TagPill,
  YouPill,
  CountBadge,
  StatusDot,
  type ChangePillProps,
  type StatusTone,
} from './Pill';
export { changeParts, type ChangeDirection, type ChangeParts } from './changeText';

export { Crest, type CrestProps } from './Crest';
export { crestFill, crestLetters, crestMetrics, CREST_CREW_FILL, type CrestSize } from './crestStyle';

export { Toggle, supportsNativeSwitch, type ToggleProps } from './Toggle';

export { Stepper, type StepperProps } from './Stepper';
export { stepperReducer, clampStep, canDecrement, canIncrement, type StepperAction, type StepperState } from './stepperReducer';

// ─── Quote, position and ornaments (MOBILE §5.14, §5.15, §5.19, §5.22, §5.23) ───
// Charts (ChartCard, Sparkline, RangeBar, AllocationBar, ScatterChart) live in ../charts.

export { SignedChange, MoneyText, type SignedChangeProps, type MoneyTextProps } from './SignedChange';
export {
  DEFAULT_CURRENCY,
  formatMoneyCents,
  formatPercentPlain,
  signedParts,
  spokenMoney,
  type CurrencyNames,
  type SignedKind,
  type SignedOptions,
} from './signedText';

export {
  StockHeader,
  StockBarSubtitle,
  type StockHeaderProps,
  type StockHeaderScrub,
  type StockHeaderTermId,
  type StockBarSubtitleProps,
} from './StockHeader';
export { asOfText, headerScrubFromChart, scrubLineText, stockBarSubtitle, stockPriceSentence } from './stockHeaderText';

export { PositionSummary, type PositionSummaryProps, type PositionSummaryTermId } from './PositionSummary';
export {
  derivePositionFigures,
  positionSummaryCells,
  cashAvailableText,
  type PositionFigures,
  type PositionCell,
  type PositionTermId,
} from './positionFigures';

export { CompassRose, CompassRoseGlyph, CompassLoader, type CompassRoseProps, type CompassLoaderProps } from './CompassRose';
export { WaxSeal, type WaxSealProps } from './WaxSeal';
export { Medallion, type MedallionProps } from './Medallion';
export { Podium, type PodiumEntry, type PodiumProps } from './Podium';
export { medallionSpec, podiumOrder, podiumStepHeight, ordinal, sealPath, type MedalMetal } from './ornamentGeometry';

// ─── Overlays, feedback and input (MOBILE §5.8–§5.12, §5.16–§5.19) ───
// Base UI supplies overlay behaviour only (drawer, dialog, alert-dialog, menu, toast).

export { Sheet, type SheetProps, type SheetDetents, type SheetDismissReason } from './Sheet';
export {
  snapPointsFor,
  defaultSnapPoint,
  isResizable,
  nextSnapPoint,
  sheetLayout,
  toDismissReason,
  MEDIUM_FRACTION,
  LARGE_SNAP,
  type SheetSnapPoint,
} from './sheetDetents';
export { useInertOutside, INERT_EXEMPT_ATTR, VISUALLY_HIDDEN } from './overlay';

export { InfoTipButton, type InfoTipButtonProps } from './InfoTipButton';
export {
  InfoTipSheet,
  InfoTipLines,
  INFO_TIP_COPY,
  glossaryTermPath,
  type InfoTipSheetProps,
  type InfoTipLinesProps,
  type InfoTipCopy,
} from './InfoTipSheet';

export { Menu, type MenuProps, type MenuGroupSpec, type MenuItemSpec } from './Menu';
export { menuProblems, MAX_MENU_GROUPS } from './menuSpec';

export { ActionSheet, type ActionSheetProps, type ActionSheetAction } from './ActionSheet';
export { Alert, alertButtonsStacked, ALERT_STACK_AFTER_CHARS, type AlertProps } from './Alert';

export {
  ToastProvider,
  AnnouncerProvider,
  useToast,
  useAnnounce,
  toastTimeout,
  TOAST_MIN_TIMEOUT_MS,
  type ToastProviderProps,
  type ToastOptions,
  type ToastApi,
  type AnnounceKind,
} from './Toast';
export { Banner, type BannerProps, type BannerTone } from './Banner';

export { Keypad, KeypadAmount, useKeypad, AMOUNT_ANNOUNCE_DELAY_MS, type KeypadProps, type KeypadAmountProps } from './Keypad';
export {
  keypadReducer,
  initialKeypadState,
  keypadValue,
  keypadDisplay,
  keypadSpoken,
  keypadActionForKey,
  KEYPAD_LIMITS,
  type KeypadAction,
  type KeypadMode,
  type KeypadState,
} from './keypadReducer';

export { SwipeActions, type SwipeAction, type SwipeActionsProps } from './SwipeActions';
export {
  swipeIntent,
  dragOffset,
  settleSwipe,
  exceedsSlop,
  ACTION_WIDTH,
  INTENT_THRESHOLD_PX,
  MAX_SWIPE_ANGLE_DEG,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP_PX,
  type SwipeIntent,
} from './swipeGesture';

export { EmptyState, type EmptyStateProps } from './EmptyState';
export {
  Skeleton,
  SkeletonGroup,
  SkeletonRow,
  SkeletonList,
  SkeletonChart,
  SkeletonHeader,
  SKELETON_DELAY_MS,
  type SkeletonProps,
  type SkeletonGroupProps,
} from './Skeleton';
