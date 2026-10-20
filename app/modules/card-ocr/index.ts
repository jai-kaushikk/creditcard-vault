import { requireOptionalNativeModule } from 'expo';

// On-device text recognition for scanning cards (Google ML Kit, bundled model:
// works offline, and nothing leaves the phone). Android only for now; null on
// iOS and the web, where the scan button is hidden.
type CardOcrModule = {
  /** Lines of text found in the photo at this file:// URI. */
  recognize(uri: string): Promise<string[]>;
};

export const CardOcr = requireOptionalNativeModule<CardOcrModule>('CardOcr');
