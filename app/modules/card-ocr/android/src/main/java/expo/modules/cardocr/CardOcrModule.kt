package expo.modules.cardocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CardOcrModule : Module() {
  private var recognizer: TextRecognizer? = null

  private fun client(): TextRecognizer =
    recognizer ?: TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).also { recognizer = it }

  override fun definition() = ModuleDefinition {
    Name("CardOcr")

    AsyncFunction("recognize") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "The app isn't ready yet.", null)
        return@AsyncFunction
      }
      val image = try {
        // Reads EXIF rotation, so the camera's skipProcessing photos come out upright.
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (e: Exception) {
        promise.reject("ERR_IMAGE", e.message ?: "Couldn't open the photo.", e)
        return@AsyncFunction
      }
      client().process(image)
        .addOnSuccessListener { text -> promise.resolve(text.textBlocks.flatMap { block -> block.lines.map { it.text } }) }
        .addOnFailureListener { e -> promise.reject("ERR_OCR", e.message ?: "Text recognition failed.", e) }
      Unit
    }

    OnDestroy {
      recognizer?.close()
      recognizer = null
    }
  }
}
