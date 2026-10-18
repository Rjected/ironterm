package dev.ironterm.data.app

import dev.ironterm.data.AuthException
import dev.ironterm.data.HttpStatusException
import dev.ironterm.data.Net
import dev.ironterm.data.normalizeServerUrl
import dev.ironterm.gym.Live
import dev.ironterm.gym.LiveSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder

/** The server answered but rejected the request (4xx/5xx other than auth); retrying won't help for 4xx. */
class ApiException(val code: Int, message: String) : IOException(message) {
    /** 409 on /api/live/finish = "still being saved": try again later. */
    val retryable: Boolean get() = code >= 500 || code == 408 || code == 409 || code == 429
}

/** Bearer-token client for /api/app/… and the gym endpoints. Blocking calls run on Dispatchers.IO. */
class AppApi(
    serverUrl: String,
    private val token: String,
    private val client: OkHttpClient = Net.client,
) {
    private val base = normalizeServerUrl(serverUrl) ?: throw IOException("Invalid server URL")
    private val jsonType = "application/json".toMediaType()

    internal fun enc(s: String) = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

    /** [authOn403] false: only 401 means "token revoked" (social answers 403 for other reasons). */
    internal suspend fun <T> call(method: String, path: String, body: String?, de: DeserializationStrategy<T>?, json: Json = AppJson.json, authOn403: Boolean = true): T? =
        withContext(Dispatchers.IO) {
            val req = Request.Builder().url(base + path)
                .header("Authorization", "Bearer $token")
                .header("accept", "application/json")
                .method(method, body?.toRequestBody(jsonType) ?: if (method == "GET" || method == "DELETE") null else "{}".toRequestBody(jsonType))
                .build()
            client.newCall(req).execute().use { res ->
                val text = res.body?.string().orEmpty()
                when {
                    res.code == 401 || (res.code == 403 && authOn403) -> throw AuthException()
                    !res.isSuccessful -> throw ApiException(res.code, errorText(text) ?: "Server error ${res.code}")
                    de == null -> null
                    else -> try {
                        json.decodeFromString(de, text)
                    } catch (e: Exception) {
                        throw IOException("Server sent an unexpected response (update the server?)", e)
                    }
                }
            }
        }

    private fun errorText(body: String): String? =
        runCatching { AppJson.json.parseToJsonElement(body).jsonObject["error"]?.jsonPrimitive?.content }.getOrNull()

    private suspend fun <T> get(path: String, de: DeserializationStrategy<T>): T = call("GET", path, null, de)!!

    suspend fun home() = get("/api/app/home", AppHome.serializer())
    suspend fun gym() = get("/api/app/gym", AppGym.serializer())
    suspend fun lifts() = get("/api/app/lifts", AppLiftList.serializer())
    suspend fun lift(key: String) = get("/api/app/lifts/${enc(key)}", AppLiftDetail.serializer())
    suspend fun history(cursor: String?, limit: Int = 30, q: String? = null): AppHistory {
        val qs = buildList {
            if (!cursor.isNullOrBlank()) add("cursor=${enc(cursor)}")
            add("limit=$limit")
            if (!q.isNullOrBlank()) add("q=${enc(q)}")
        }.joinToString("&")
        return get("/api/app/history?$qs", AppHistory.serializer())
    }
    suspend fun workout(id: String) = get("/api/app/workouts/${enc(id)}", AppWorkout.serializer())
    suspend fun calendar(month: String?) = get("/api/app/calendar" + (month?.let { "?month=${enc(it)}" } ?: ""), AppCalendar.serializer())
    suspend fun program() = get("/api/app/program", AppProgram.serializer())
    suspend fun body(mode: String) = get("/api/app/body?mode=${enc(mode)}", AppBody.serializer())
    suspend fun insights() = get("/api/app/insights", AppInsights.serializer())
    suspend fun stats() = get("/api/app/stats", AppStats.serializer())

    suspend fun startGym(dayIndex: Int?, empty: Boolean): LiveSession =
        call("POST", "/api/app/gym/start", AppJson.json.encodeToString(GymStart.serializer(), GymStart(dayIndex, if (empty) true else null)), LiveSession.serializer(), Live.json)!!

    suspend fun putLive(s: LiveSession) { call<Unit>("PUT", "/api/live", Live.encode(s), null) }
    suspend fun deleteLive() { call<Unit>("DELETE", "/api/live", null, null) }
    suspend fun finishLive(s: LiveSession): FinishResult = call("POST", "/api/live/finish", Live.encode(s), FinishResult.serializer())!!
    suspend fun saveNotes(id: String, edit: NotesEdit) {
        call<Unit>("PUT", "/api/workouts/${enc(id)}/notes", AppJson.json.encodeToString(NotesEdit.serializer(), edit), null)
    }
    /** Hevy exercise templates (live servers; [] in demo mode). Used for cardio and non-library exercises. */
    suspend fun templates(): List<HevyTemplate> = get("/api/templates", kotlinx.serialization.builtins.ListSerializer(HevyTemplate.serializer()))
    suspend fun sync() { call<Unit>("POST", "/api/sync", "{}", null) }
    suspend fun pushRoutines() { call<Unit>("POST", "/api/routines/push", "{}", null) }
}

/** HttpStatusException kept for the snapshot client; treat both as server errors. */
fun Throwable.isAuth() = this is AuthException
fun Throwable.isRetryable(): Boolean = when (this) {
    is AuthException -> false
    is ApiException -> retryable
    is HttpStatusException -> code >= 500
    is IOException -> true // connect / timeout / DNS
    else -> false
}
