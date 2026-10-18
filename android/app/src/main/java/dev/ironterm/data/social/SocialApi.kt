package dev.ironterm.data.social

import dev.ironterm.data.app.AppApi
import dev.ironterm.data.app.AppJson
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The owner's social API on the app's own server (PROTOCOL.md §6), with the app's Bearer token.
 * The server does all the server-to-server work; the app never talks to a friend's server.
 */
class SocialApi(private val api: AppApi) {
    private fun e(s: String) = api.enc(s)

    private suspend fun <T> get(path: String, de: DeserializationStrategy<T>): T = api.call("GET", path, null, de, authOn403 = false)!!
    private suspend fun <T> send(method: String, path: String, body: JsonObject?, de: DeserializationStrategy<T>?): T? =
        api.call(method, path, body?.let { AppJson.json.encodeToString(JsonObject.serializer(), it) }, de, authOn403 = false)

    private fun qs(vararg kv: Pair<String, String?>): String =
        kv.filter { !it.second.isNullOrBlank() }.joinToString("&") { "${it.first}=${e(it.second!!)}" }.let { if (it.isEmpty()) "" else "?$it" }

    suspend fun me() = get("/api/social/me", SocialMe.serializer())

    suspend fun setup(handle: String, name: String, listed: Boolean): SetupResult =
        send("POST", "/api/social/setup", buildJsonObject { put("handle", handle); put("name", name); put("listed", listed) }, SetupResult.serializer())!!

    suspend fun unregister() { send<Unit>("DELETE", "/api/social/setup", null, null) }

    suspend fun search(q: String) = get("/api/social/search" + qs("q" to q), SearchResult.serializer())

    suspend fun friends() = get("/api/social/friends", FriendList.serializer())

    /** [kind] is "handle" or "server" (see [Social.target]). */
    suspend fun addFriend(kind: String, value: String, note: String?, share: String): FriendResult =
        send("POST", "/api/social/friends", buildJsonObject {
            put(kind, value)
            if (!note.isNullOrBlank()) put("note", note)
            put("share", share)
        }, FriendResult.serializer())!!

    suspend fun accept(id: String, share: String) { send<Unit>("POST", "/api/social/friends/${e(id)}/accept", buildJsonObject { put("share", share) }, null) }
    suspend fun reject(id: String) { send<Unit>("POST", "/api/social/friends/${e(id)}/reject", JsonObject(emptyMap()), null) }
    suspend fun setShare(id: String, share: String) { send<Unit>("PUT", "/api/social/friends/${e(id)}", buildJsonObject { put("share", share) }, null) }
    suspend fun unfriend(id: String) { send<Unit>("DELETE", "/api/social/friends/${e(id)}", null, null) }

    suspend fun feed(before: String? = null, fresh: Boolean = false, limit: Int = 30) =
        get("/api/social/feed" + qs("before" to before, "limit" to limit.toString(), "fresh" to if (fresh) "1" else null), FeedPage.serializer())

    suspend fun profile(id: String, fresh: Boolean = false) =
        get("/api/social/friends/${e(id)}/profile" + qs("fresh" to if (fresh) "1" else null), ProfileDoc.serializer())

    suspend fun friendFeed(id: String, before: String? = null, fresh: Boolean = false) =
        get("/api/social/friends/${e(id)}/feed" + qs("before" to before, "fresh" to if (fresh) "1" else null), FeedPage.serializer())

    suspend fun compare(id: String, fresh: Boolean = false) =
        get("/api/social/compare/${e(id)}" + qs("fresh" to if (fresh) "1" else null), Compare.serializer())

    suspend fun mine(before: String? = null) = get("/api/social/mine" + qs("before" to before), FeedPage.serializer())

    /** [emoji] null removes my reaction; sent as an explicit JSON null. */
    suspend fun react(friend: String, item: String, emoji: String?) {
        send<Unit>("POST", "/api/social/react", JsonObject(mapOf(
            "friend" to JsonPrimitive(friend), "item" to JsonPrimitive(item), "emoji" to (emoji?.let(::JsonPrimitive) ?: JsonNull),
        )), null)
    }

    suspend fun comment(friend: String, item: String, text: String) {
        send<Unit>("POST", "/api/social/comment", buildJsonObject { put("friend", friend); put("item", item); put("text", text) }, null)
    }

    suspend fun notifications() = get("/api/social/notifications", NotificationList.serializer())
    suspend fun markRead() { send<Unit>("POST", "/api/social/notifications/read", JsonObject(emptyMap()), null) }
}
