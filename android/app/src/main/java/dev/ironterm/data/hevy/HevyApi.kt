package dev.ironterm.data.hevy

import dev.ironterm.data.AuthException
import dev.ironterm.data.HttpStatusException
import dev.ironterm.data.Net
import dev.ironterm.data.SnapshotJson
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Client for the Hevy public API. Direct mode reads GET /v1/workouts and, from GYM, creates workouts. */
class HevyApi(
    private val baseUrl: String = DEFAULT_BASE_URL,
) {
    companion object {
        const val DEFAULT_BASE_URL = "https://api.hevyapp.com/"
        /** The API rejects anything above 10. */
        const val MAX_PAGE_SIZE = 10
    }

    private fun url(path: String) = baseUrl.trimEnd('/') + path
    private fun headers(apiKey: String) = mapOf("api-key" to apiKey, "accept" to "application/json")

    suspend fun getWorkouts(apiKey: String, page: Int, pageSize: Int = MAX_PAGE_SIZE): WorkoutsResponse {
        val res = Net.send(url("/v1/workouts?page=$page&pageSize=${pageSize.coerceIn(1, MAX_PAGE_SIZE)}"), headers = headers(apiKey))
        return when {
            res.code == 401 || res.code == 403 -> throw AuthException("Hevy API key invalid or revoked. Reconnect.")
            // Hevy answers 404 for a page past the end on some accounts: treat it as empty.
            res.code == 404 && page > 1 -> WorkoutsResponse(page = page, pageCount = page - 1)
            !res.isSuccessful -> throw HttpStatusException(res.code, "Hevy API error ${res.code}")
            else -> SnapshotJson.json.decodeFromString(WorkoutsResponse.serializer(), res.body)
        }
    }

    /** POST /v1/workouts with a [dev.ironterm.gym.HevyWorkoutBody] JSON. Returns the new workout id when Hevy sends one. */
    suspend fun createWorkout(apiKey: String, body: String): String? {
        val res = Net.send(url("/v1/workouts"), "POST", headers(apiKey) + ("Content-Type" to "application/json"), body)
        val text = res.body
        return when {
            res.code == 401 || res.code == 403 -> throw AuthException("Hevy API key invalid or revoked. Reconnect.")
            !res.isSuccessful -> throw dev.ironterm.data.app.ApiException(res.code, "Hevy API error ${res.code}: ${text.take(200)}")
            else -> runCatching {
                // Hevy answers {"workout": [{…}]} or {"workout": {…}}; take the id wherever it is.
                val el = SnapshotJson.json.parseToJsonElement(text).jsonObject
                val w = el["workout"]
                val obj = when (w) {
                    is kotlinx.serialization.json.JsonArray -> w.firstOrNull()?.jsonObject
                    is kotlinx.serialization.json.JsonObject -> w
                    else -> el
                }
                obj?.get("id")?.jsonPrimitive?.content
            }.getOrNull()
        }
    }
}
