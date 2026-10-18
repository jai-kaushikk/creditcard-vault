import type * as React from 'react';

/** Amounts are always integer minor units (paise, cents). */
export type Minor = number;
export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP' | string;
/** lent = money owed TO the viewer; owe = money the viewer owes. */
export type Direction = 'lent' | 'owe' | 'neutral';
export type TxStatus = 'pending' | 'confirmed' | 'settled' | 'disputed' | 'expired' | 'shared';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: once per screen. secondary (default): bordered. quiet: text-only. danger: destructive only. */
  /** glass: floating liquid-glass pill over content (camera, filters, back). */
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger' | 'glass';
  size?: 'md' | 'sm';
  /** Full width — sheets and mobile footers. */
  block?: boolean;
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface CreditCardProps {
  nickname?: string;
  network?: 'visa' | 'mastercard' | 'rupay' | 'amex' | 'diners';
  last4: string;
  holder?: string;
  /** "MM/YY" */
  expiry?: string;
  face?: 'onyx' | 'jade' | 'brass' | 'slate';
  /** Show the full number. Only after a fresh biometric check; re-mask after 30s. */
  revealed?: boolean;
  /** Full PAN, read from the device vault. Never from the server. */
  number?: string;
  /** Owner view: the friend the card is shared with. */
  sharedWith?: string;
  /** Borrower view: who shared it. */
  sharedBy?: string;
  compact?: boolean;
  className?: string;
}
export declare function CreditCard(props: CreditCardProps): React.ReactElement;

export interface AvatarProps { name: string; size?: number; tone?: 'vault' | 'lent' | 'owe' | 'neutral'; className?: string }
export declare function Avatar(props: AvatarProps): React.ReactElement;

export interface StatusBadgeProps { status: TxStatus; children?: React.ReactNode; className?: string }
export declare function StatusBadge(props: StatusBadgeProps): React.ReactElement;

export interface AmountTextProps {
  minor: Minor;
  currency?: Currency;
  direction?: Direction;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** false hides the +/− (use when a label like "owes you" sits beside it). */
  signed?: boolean;
  className?: string;
}
export declare function AmountText(props: AmountTextProps): React.ReactElement;

export interface LedgerRowProps {
  /** The other person. */
  name: string;
  merchant?: string;
  cardLast4?: string;
  minor: Minor;
  currency?: Currency;
  direction: 'lent' | 'owe';
  status?: TxStatus;
  /** Pre-formatted, e.g. "Today, 9:41 PM". */
  time?: string;
  className?: string;
}
export declare function LedgerRow(props: LedgerRowProps): React.ReactElement;

export interface BalanceCardProps {
  name: string;
  /** Positive: they owe you. Negative: you owe them. */
  netMinor: Minor;
  currency?: Currency;
  actionLabel?: string;
  /** false hides the action button. */
  action?: boolean;
  onAction?: () => void;
  className?: string;
}
export declare function BalanceCard(props: BalanceCardProps): React.ReactElement;

export interface OtpShareSheetProps {
  /** request: OTP arrived, owner decides. shared: waiting on the bank. success: recorded. */
  state?: 'request' | 'shared' | 'success';
  requester: string;
  merchant?: string;
  minor: Minor;
  currency?: Currency;
  cardName?: string;
  cardLast4: string;
  /** 4–8 digits. Only on the owner's device. */
  otp?: string;
  /** Seconds left; the app ticks it. */
  expiresIn?: number;
  /** Seconds the OTP is valid for (default 180). */
  validFor?: number;
  onShare?: () => void;
  onDecline?: () => void;
  onRevoke?: () => void;
  onDone?: () => void;
  className?: string;
}
export declare function OtpShareSheet(props: OtpShareSheetProps): React.ReactElement;

export interface TabBarItem { id: string; label: string; /** vault | friends | ledger | settings (defaults to id) */ icon?: string }
export interface TabBarProps {
  /** Defaults to Vault, Friends, Ledger, Settings. */
  items?: TabBarItem[];
  active?: string;
  onChange?: (id: string) => void;
  className?: string;
}
/** Floating liquid-glass tab bar; position it 16px above the bottom safe area. */
export declare function TabBar(props: TabBarProps): React.ReactElement;

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  delta?: string;
  trend?: 'up' | 'down';
  /** good / bad colours the delta; the arrow and words still carry the meaning. */
  deltaTone?: 'good' | 'bad' | 'neutral';
  className?: string;
}
export declare function StatTile(props: StatTileProps): React.ReactElement;

export interface DataTableColumn<R = any> { key: string; label: string; align?: 'left' | 'right'; mono?: boolean; render?: (row: R) => React.ReactNode }
export interface DataTableProps<R = any> { columns: DataTableColumn<R>[]; rows: R[]; dense?: boolean; caption?: string; className?: string }
export declare function DataTable<R = any>(props: DataTableProps<R>): React.ReactElement;

export declare function formatMoney(minor: Minor, currency?: Currency): string;

declare global {
  interface Window {
    CardVault: {
      Button: typeof Button; CreditCard: typeof CreditCard; Avatar: typeof Avatar; StatusBadge: typeof StatusBadge;
      AmountText: typeof AmountText; LedgerRow: typeof LedgerRow; BalanceCard: typeof BalanceCard;
      OtpShareSheet: typeof OtpShareSheet; TabBar: typeof TabBar; StatTile: typeof StatTile; DataTable: typeof DataTable; formatMoney: typeof formatMoney;
    };
  }
}
