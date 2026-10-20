package expo.modules.cardnfc

import android.content.Intent
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.os.Bundle
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CardNfcModule : Module() {
  // The scan waiting for a card. Touched from the main thread and NFC's binder thread.
  @Volatile private var pending: Promise? = null

  private val adapter: NfcAdapter?
    get() = appContext.reactContext?.let { NfcAdapter.getDefaultAdapter(it) }

  /** Hands the scan its one answer and turns reader mode off. */
  private fun finish(answer: (Promise) -> Unit) {
    val promise = synchronized(this) { pending.also { pending = null } } ?: return
    val activity = appContext.currentActivity
    activity?.runOnUiThread {
      try {
        adapter?.disableReaderMode(activity)
      } catch (e: Exception) {
        // The activity may already be paused, which disables it anyway.
      }
    }
    answer(promise)
  }

  private fun onTag(tag: Tag) {
    val iso = IsoDep.get(tag)
    if (iso == null) {
      finish { it.reject("ERR_NOT_A_CARD", "That isn't a contactless payment card.", null) }
      return
    }
    try {
      iso.connect()
      iso.timeout = 5000
      val (number, expiry, holder) = EmvReader.read(iso)
      if (number.isNullOrEmpty()) {
        finish { it.reject("ERR_NO_NUMBER", "This card doesn't share its number over NFC. Scan it with the camera instead.", null) }
      } else {
        finish { it.resolve(mapOf("number" to number, "expiry" to expiry, "holder" to holder)) }
      }
    } catch (e: Exception) {
      finish { it.reject("ERR_READ", "The card moved away too soon. Hold it still against the back of the phone.", e) }
    } finally {
      try {
        iso.close()
      } catch (e: Exception) {
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("CardNfc")

    Function("isSupported") { adapter != null }

    Function("isEnabled") { adapter?.isEnabled == true }

    Function("openSettings") {
      val activity = appContext.currentActivity ?: return@Function
      activity.startActivity(Intent(Settings.ACTION_NFC_SETTINGS))
    }

    AsyncFunction("readCard") { promise: Promise ->
      val activity = appContext.currentActivity
      val nfc = adapter
      when {
        activity == null -> promise.reject("ERR_NO_ACTIVITY", "Open CardVault first.", null)
        nfc == null -> promise.reject("ERR_NO_NFC", "This phone doesn't have NFC.", null)
        !nfc.isEnabled -> promise.reject("ERR_NFC_OFF", "NFC is turned off.", null)
        else -> {
          synchronized(this@CardNfcModule) {
            pending?.reject("ERR_CANCELLED", "A new scan started.", null)
            pending = promise
          }
          val flags = NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
          val extras = Bundle().apply { putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250) }
          nfc.enableReaderMode(activity, { tag -> onTag(tag) }, flags, extras)
        }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancel") {
      finish { it.reject("ERR_CANCELLED", "Cancelled.", null) }
    }.runOnQueue(Queues.MAIN)

    // Reader mode stops when the app leaves the screen; end the scan with it.
    OnActivityEntersBackground {
      finish { it.reject("ERR_CANCELLED", "CardVault went to the background.", null) }
    }
  }
}
