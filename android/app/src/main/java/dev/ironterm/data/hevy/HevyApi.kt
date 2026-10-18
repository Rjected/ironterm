package dev.ironterm.data.hevy

import dev.ironterm.data.AuthException
import dev.ironterm.data.HttpStatusException
import dev.ironterm.data.Net
import dev.ironterm.data.SnapshotJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Client for the Hevy public API. Direct mode reads GET /v1/workouts and, from GYM, creates workouts. */
class HevyApi(
    private val baseUrl: String = DEFAULT_BASE_URL,
    private val client: OkHttpClient = Net.client,
) {
    companion object {
        const val DEFAULT_BASE_URL = "https://api.hevyapp.com/"
        /** The API rejects anything above 10. */
        const val MAX_PAGE_SIZE = 10
    }

    suspend fun getWorkouts(apiKey: String, page: Int, pageSize: Int = MAX_PAGE_SIZE): WorkoutsResponse =
        withContext(Dispatchers.IO) {
            val url = baseUrl.toHttpUrl().newBuilder()
                .addPathSegments("v1/workouts")
                .addQueryParameter("page", page.toString())
                .addQueryParameter("pageSize", pageSize.coerceIn(1, MAX_PAGE_SIZE).toString())
                .build()
            val req = Request.Builder().url(url)
                .header("api-key", apiKey)
                .header("accept", "application/json")
                .get().build()
            client.newCall(req).execute().use { res ->
                val body = res.body?.string().orEmpty()
                when {
                    res.code == 401 || res.code == 403 -> throw AuthException("Hevy API key invalid or revoked. Reconnect.")
                    // Hevy answers 404 for a page past the end on some accounts: treat it as empty.
                    res.code == 404 && page > 1 -> WorkoutsResponse(page = page, pageCount = page - 1)
                    !res.isSuccessful -> throw HttpStatusException(res.code, "Hevy API error ${res.code}")
                    else -> SnapshotJson.json.decodeFromString(WorkoutsResponse.serializer(), body)
                }
            }
        }

    /** POST /v1/workouts with a [dev.ironterm.gym.HevyWorkoutBody] JSON. Returns the new workout id when Hevy sends one. */
    suspend fun createWorkout(apiKey: String, body: String): String? = withContext(Dispatchers.IO) {
        val url = baseUrl.toHttpUrl().newBuilder().addPathSegments("v1/workouts").build()
        val req = Request.Builder().url(url)
            .header("api-key", apiKey)
            .header("accept", "application/json")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            when {
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
}
