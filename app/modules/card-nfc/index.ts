import { requireOptionalNativeModule } from 'expo';

// Reads a contactless card's number and expiry over NFC, the way a payment
// terminal starts a payment, but without one: nothing is charged and no
// transaction history is read. Android only (iPhones don't let apps read
// payment cards); null elsewhere, where the button is hidden.
export type ChipCard = { number: string | null; expiry: string | null; holder: string | null };

type CardNfcModule = {
  isSupported(): boolean;
  isEnabled(): boolean;
  openSettings(): void;
  /** Waits for a card to be tapped. Rejects with code ERR_NFC_OFF, ERR_NOT_A_CARD, ERR_NO_NUMBER, ERR_READ or ERR_CANCELLED. */
  readCard(): Promise<ChipCard>;
  cancel(): Promise<void>;
};

export const CardNfc = requireOptionalNativeModule<CardNfcModule>('CardNfc');
