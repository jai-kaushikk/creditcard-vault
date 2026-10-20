package expo.modules.cardnfc;

import android.nfc.tech.IsoDep;

import com.github.devnied.emvnfccard.exception.CommunicationException;
import com.github.devnied.emvnfccard.model.EmvCard;
import com.github.devnied.emvnfccard.model.EmvTrack2;
import com.github.devnied.emvnfccard.parser.EmvTemplate;
import com.github.devnied.emvnfccard.parser.IProvider;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Reads number, expiry and (rarely present) name from a contactless card. Java because the library's factories are static methods named like its nested classes. */
final class EmvReader {
  private EmvReader() {}

  /** Returns {number, expiry "MM/YY", holder}; any of them may be null. */
  static String[] read(final IsoDep iso) throws IOException {
    IProvider provider = new IProvider() {
      @Override
      public byte[] transceive(byte[] command) throws CommunicationException {
        try {
          return iso.transceive(command);
        } catch (IOException e) {
          throw new CommunicationException(e.getMessage());
        }
      }

      @Override
      public byte[] getAt() {
        byte[] at = iso.getHistoricalBytes();
        return at != null ? at : iso.getHiLayerResponse();
      }
    };
    EmvTemplate.Config config = EmvTemplate.Config()
        .setContactLess(true)
        .setReadAllAids(true)
        .setReadTransactions(false) // never read the card's payment history
        .setReadCplc(false)
        .setReadAt(false)
        .setRemoveDefaultParsers(false);
    EmvCard card = EmvTemplate.Builder().setProvider(provider).setConfig(config).build().readEmvCard();

    String number = card.getCardNumber();
    Date expires = card.getExpireDate();
    EmvTrack2 track2 = card.getTrack2();
    if (number == null && track2 != null) number = track2.getCardNumber();
    if (expires == null && track2 != null) expires = track2.getExpireDate();

    String holder = null;
    if (card.getHolderFirstname() != null || card.getHolderLastname() != null) {
      holder = ((card.getHolderFirstname() == null ? "" : card.getHolderFirstname()) + " "
          + (card.getHolderLastname() == null ? "" : card.getHolderLastname())).trim();
    }
    String expiry = expires == null ? null : new SimpleDateFormat("MM/yy", Locale.US).format(expires);
    return new String[] {number, expiry, holder == null || holder.isEmpty() ? null : holder};
  }
}
