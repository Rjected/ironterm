package dev.ironterm.ui

import android.app.Activity
import android.util.Log
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import dev.ironterm.data.ConnectCode

/**
 * Google's code scanner (Play services): its own camera UI, no CAMERA permission for this app.
 * QR only. [onText] gets the raw text; [onError] gets a user-facing message; cancel does nothing.
 */
object QrScanner {
    const val DOWNLOADING = "The QR scanner is still being downloaded by Google Play services. Try again in a minute, or enter the server URL and app token below."

    fun scan(activity: Activity, onText: (String?) -> Unit, onError: (String) -> Unit) {
        val gms = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(activity)
        if (gms != ConnectionResult.SUCCESS) {
            onError(ConnectCode.SCANNER_UNAVAILABLE); return
        }
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
        try {
            val scanner = GmsBarcodeScanning.getClient(activity, options)
            scanner.startScan()
                .addOnSuccessListener { onText(it.rawValue) }
                .addOnFailureListener { e ->
                    Log.w("QrScanner", "scan failed", e)
                    if (e is MlKitException && e.errorCode == MlKitException.CODE_SCANNER_CANCELLED) return@addOnFailureListener
                    // "Waiting for the Barcode UI module to be downloaded." (the code varies by version)
                    if (e is MlKitException && (e.errorCode == MlKitException.UNAVAILABLE || e.message?.contains("download", true) == true)) {
                        // Ask Play services to fetch the scanner module so the next tap works.
                        runCatching {
                            ModuleInstall.getClient(activity).installModules(ModuleInstallRequest.newBuilder().addApi(scanner).build())
                        }
                        onError(DOWNLOADING)
                    } else {
                        onError(ConnectCode.SCANNER_UNAVAILABLE)
                    }
                }
        } catch (e: Exception) {
            Log.w("QrScanner", "scanner unavailable", e)
            onError(ConnectCode.SCANNER_UNAVAILABLE)
        }
    }
}
