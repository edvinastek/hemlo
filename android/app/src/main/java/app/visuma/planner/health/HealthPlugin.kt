package app.visuma.planner.health

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Instant

/**
 * Sleep from Health Connect (SLP-05), for src/lib/health.ts: whether Health
 * Connect is there, the one permission Visuma asks for (reading sleep), and the
 * sleep sessions of a time range. Nothing is written to Health Connect and
 * nothing else is read. The app turns the sessions into nights
 * (src/lib/sleep-import-rules.ts) and keeps them as it keeps nights typed in.
 *
 * Health Connect runs on Android 9 and later: built in from Android 14, an
 * app from Google Play before that. Below Android 9 every call answers
 * "unsupported" without touching the library.
 */
@CapacitorPlugin(name = "VisumaHealth")
class HealthPlugin : Plugin() {

    private val scope = MainScope()
    private val sleepRead = HealthPermission.getReadPermission(SleepSessionRecord::class)

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    private fun supported() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P

    /** "available"; "install" when Health Connect has to be installed or
     *  updated from Google Play first; "unsupported" when this phone cannot
     *  have it. */
    private fun status(): String {
        if (!supported()) return "unsupported"
        return when (HealthConnectClient.getSdkStatus(context, PROVIDER)) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "install"
            else -> "unsupported"
        }
    }

    @PluginMethod
    fun availability(call: PluginCall) {
        call.resolve(JSObject().put("status", status()))
    }

    /** Health Connect's page on Google Play, to install or update it. */
    @PluginMethod
    fun install(call: PluginCall) {
        val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$PROVIDER&url=healthconnect%3A%2F%2Fonboarding"))
            .setPackage("com.android.vending")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(market)
        } catch (e: ActivityNotFoundException) {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$PROVIDER"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        call.resolve()
    }

    /** Health Connect's own settings, where a permission refused twice can
     *  still be given (Android stops asking after the second no). */
    @PluginMethod
    fun openSettings(call: PluginCall) {
        if (status() != "available") return call.reject("Health Connect is not available", "unavailable")
        try {
            context.startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            call.resolve()
        } catch (e: ActivityNotFoundException) {
            call.reject("Health Connect's settings could not be opened", "unavailable")
        }
    }

    /** Whether Visuma may read sleep now. Asks nothing. */
    @PluginMethod
    fun allowed(call: PluginCall) {
        if (status() != "available") return call.resolve(JSObject().put("allowed", false))
        scope.launch {
            try {
                call.resolve(JSObject().put("allowed", granted()))
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect did not answer", "failed")
            }
        }
    }

    /** Ask for reading sleep, and only that, with Health Connect's own screen. */
    @PluginMethod
    fun requestSleep(call: PluginCall) {
        if (status() != "available") return call.reject("Health Connect is not available", "unavailable")
        scope.launch {
            try {
                if (granted()) return@launch call.resolve(JSObject().put("allowed", true))
                val intent = PermissionController.createRequestPermissionResultContract().createIntent(context, setOf(sleepRead))
                startActivityForResult(call, intent, "requestSleepDone")
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect did not answer", "failed")
            }
        }
    }

    @ActivityCallback
    private fun requestSleepDone(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val answered = try {
            PermissionController.createRequestPermissionResultContract().parseResult(result.resultCode, result.data)
        } catch (e: Exception) {
            emptySet()
        }
        // The screen's answer, checked against Health Connect itself: some
        // versions hand back nothing when the permission was already there.
        scope.launch {
            val allowed = sleepRead in answered || (try { granted() } catch (e: Exception) { false })
            call.resolve(JSObject().put("allowed", allowed))
        }
    }

    /** Sleep sessions that overlap [start, end) (milliseconds since 1970),
     *  each with its stages, as HcSession (src/lib/sleep-import-rules.ts). */
    @PluginMethod
    fun readSleep(call: PluginCall) {
        val start = call.getLong("start")
        val end = call.getLong("end")
        if (start == null || end == null || end <= start) return call.reject("start and end are required", "bad-range")
        if (status() != "available") return call.reject("Health Connect is not available", "unavailable")
        scope.launch {
            try {
                if (!granted()) return@launch call.reject("Reading sleep is not allowed", "not-allowed")
                val client = HealthConnectClient.getOrCreate(context)
                val out = JSArray()
                var page: String? = null
                var count = 0
                do {
                    val response = client.readRecords(
                        ReadRecordsRequest(
                            recordType = SleepSessionRecord::class,
                            timeRangeFilter = TimeRangeFilter.between(Instant.ofEpochMilli(start), Instant.ofEpochMilli(end)),
                            pageSize = 200,
                            pageToken = page,
                        )
                    )
                    for (r in response.records) {
                        if (count++ >= MAX_SESSIONS) break
                        out.put(session(r))
                    }
                    page = response.pageToken
                } while (page != null && count < MAX_SESSIONS)
                call.resolve(JSObject().put("sessions", out))
            } catch (e: SecurityException) {
                call.reject("Reading sleep is not allowed", "not-allowed")
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect did not answer", "failed")
            }
        }
    }

    private suspend fun granted(): Boolean =
        HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions().contains(sleepRead)

    private fun session(r: SleepSessionRecord): JSObject {
        val stages = JSArray()
        for (s in r.stages) {
            stages.put(JSObject().put("start", s.startTime.toEpochMilli()).put("end", s.endTime.toEpochMilli()).put("stage", s.stage))
        }
        return JSObject()
            .put("id", r.metadata.id)
            .put("start", r.startTime.toEpochMilli())
            .put("end", r.endTime.toEpochMilli())
            .put("startOffset", r.startZoneOffset?.totalSeconds ?: JSONObject.NULL)
            .put("endOffset", r.endZoneOffset?.totalSeconds ?: JSONObject.NULL)
            .put("stages", stages)
    }

    companion object {
        /** Health Connect's own app, which holds the data before Android 14. */
        const val PROVIDER = "com.google.android.apps.healthdata"
        /** A month of nights is a few dozen; this only stops a runaway. */
        const val MAX_SESSIONS = 1000
    }
}
