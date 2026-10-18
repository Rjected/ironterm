package dev.ironterm.data.social

import kotlinx.serialization.Serializable

// The owner's social API (GET/POST /api/social/*), docs/social/PROTOCOL.md §6. Same JSON rules as
// /api/app (AppJson): unknown keys ignored, every field defaulted, so additive server changes and
// share-level-filtered documents (fields left out at "basic") never break parsing.

object Share {
    const val BASIC = "basic"
    const val LIFTS = "lifts"
    const val FULL = "full"
    val all = listOf(BASIC, LIFTS, FULL)

    fun label(level: String?): String = when (level) {
        BASIC -> "BASIC"
        LIFTS -> "LIFTS"
        FULL -> "FULL"
        null -> "—"
        else -> level.uppercase()
    }

    /** What a friend at [level] can see (PROTOCOL.md §4). */
    fun describe(level: String?): String = when (level) {
        BASIC -> "Streak, sessions per week and the year graph (no values). PRs and achievements without weights."
        LIFTS -> "Basic, plus PR weights, your current e1RM per lift and session summaries (exercises and top set)."
        FULL -> "Lifts, plus every set, workout notes and readiness."
        else -> "Not known yet."
    }

    /** Short one-liner for rows. */
    fun short(level: String?): String = when (level) {
        BASIC -> "streak · graph · PRs without weights"
        LIFTS -> "+ weights · e1RM · session summaries"
        FULL -> "+ every set · notes · readiness"
        else -> "unknown"
    }

    fun rank(level: String?): Int = all.indexOf(level)
}

/** The fixed reaction set (PROTOCOL.md §4). */
object Emoji {
    val all = listOf("💪", "🔥", "👏", "🏆", "😤")
}

@Serializable
data class SocialMe(
    val enabled: Boolean = false,
    val handle: String? = null,
    val name: String? = null,
    val server: String? = null,
    val directory: String? = null,
    val listed: Boolean = false,
    val fingerprint: String? = null,
    /** a directory is configured on the server (SOCIAL_DIRECTORY), even before setup */
    val directoryConfigured: Boolean = false,
    val unread: Int = 0,
)

@Serializable
data class SetupResult(val ok: Boolean = false, val handle: String? = null)

@Serializable
data class DirectoryUser(val handle: String = "", val name: String? = null, val server: String = "")

@Serializable
data class SearchResult(val users: List<DirectoryUser> = emptyList())

@Serializable
data class Author(
    val id: String = "",
    val server: String = "",
    val handle: String? = null,
    val name: String? = null,
) {
    /** "Sam" / "@sam" / "gym.example.com" */
    val display: String get() = name?.takeIf { it.isNotBlank() } ?: handle?.let { "@$it" } ?: host
    val host: String get() = server.substringAfter("://").trimEnd('/')
    /** "@sam · gym.example.com" */
    val address: String get() = listOfNotNull(handle?.let { "@$it" }, host.takeIf { it.isNotBlank() }).joinToString(" · ")
}

@Serializable
data class Friend(
    val id: String = "",
    val server: String = "",
    val handle: String? = null,
    val name: String? = null,
    /** friends | outgoing | incoming */
    val status: String = FRIENDS,
    /** what I let them see */
    val share: String = Share.BASIC,
    /** what they let me see; null until fetched */
    val theirShare: String? = null,
    val since: String = "",
    val lastSeen: String? = null,
    val fingerprint: String = "",
    val note: String? = null,
) {
    val author: Author get() = Author(id, server, handle, name)

    companion object {
        const val FRIENDS = "friends"
        const val OUTGOING = "outgoing"
        const val INCOMING = "incoming"
    }
}

@Serializable
data class FriendList(val friends: List<Friend> = emptyList()) {
    val incoming get() = friends.filter { it.status == Friend.INCOMING }
    val accepted get() = friends.filter { it.status == Friend.FRIENDS }
    val outgoing get() = friends.filter { it.status == Friend.OUTGOING }
}

@Serializable
data class FriendResult(val friend: Friend? = null)

@Serializable
data class Who(val server: String = "", val name: String? = null) {
    val display: String get() = name?.takeIf { it.isNotBlank() } ?: server.substringAfter("://").trimEnd('/')
}

@Serializable
data class Reaction(val emoji: String = "", val from: List<Who> = emptyList())

@Serializable
data class Comment(val id: String = "", val from: Who = Who(), val text: String = "", val at: String = "")

@Serializable
data class TopSet(val weight: Double = 0.0, val reps: Int = 0)

@Serializable
data class FeedSet(val weight: Double? = null, val reps: Int? = null)

@Serializable
data class FeedExercise(
    val name: String = "",
    val lift: String? = null,
    /** lifts+ */
    val top: TopSet? = null,
    /** full */
    val sets: List<FeedSet>? = null,
)

/**
 * One feed item. The protocol's union (session | pr | achievement) is flattened: [kind] says which
 * fields apply. [author] is set on the merged feed; per-friend and "mine" feeds may leave it out.
 */
@Serializable
data class FeedItem(
    val id: String = "",
    val at: String = "",
    val kind: String = "",
    val author: Author? = null,
    val reactions: List<Reaction> = emptyList(),
    val comments: List<Comment> = emptyList(),
    // session
    val title: String? = null,
    val durationMin: Double? = null,
    val sets: Int? = null,
    val exercises: List<FeedExercise> = emptyList(),
    val volume: Double? = null,
    val note: String? = null,
    // pr
    val lift: String? = null,
    val liftName: String? = null,
    val prKind: String? = null,
    val reps: Int? = null,
    val weight: Double? = null,
    val prev: Double? = null,
    // achievement
    val tier: String? = null,
    val description: String? = null,
    /** not in v1 of the protocol; shown when a server sends it */
    val unit: String? = null,
) {
    companion object {
        const val SESSION = "session"
        const val PR = "pr"
        const val ACHIEVEMENT = "achievement"
    }
}

@Serializable
data class FeedPage(
    val items: List<FeedItem> = emptyList(),
    val next: String? = null,
    /** friend ids served from the server's cache */
    val stale: List<String> = emptyList(),
    /** friend ids that couldn't be reached and had nothing cached (merged feed only) */
    val unreachable: List<String> = emptyList(),
)

@Serializable
data class ProfileStreak(val current: Int = 0, val best: Int = 0)

@Serializable
data class ProfileWeek(val done: Int = 0, val target: Int = 0)

@Serializable
data class ProfileGraph(val start: String = "", val levels: List<Int> = emptyList())

@Serializable
data class ProfileLift(val key: String = "", val name: String = "", val e1rm: Double? = null, val best: Double? = null)

@Serializable
data class SocialProfile(
    val server: String = "",
    val handle: String? = null,
    val name: String? = null,
    val share: String = Share.BASIC,
    val unit: String? = null,
    val streak: ProfileStreak = ProfileStreak(),
    val week: ProfileWeek = ProfileWeek(),
    val sessions52: Int = 0,
    val graph: ProfileGraph = ProfileGraph(),
    val lifts: List<ProfileLift> = emptyList(),
    val bodyweight: Double? = null,
    val program: String? = null,
    val updatedAt: String = "",
)

@Serializable
data class ProfileDoc(val profile: SocialProfile = SocialProfile(), val stale: Boolean = false)

@Serializable
data class CompareLift(
    val key: String = "",
    val name: String = "",
    val me: Double? = null,
    val them: Double? = null,
    val meBw: Double? = null,
    val themBw: Double? = null,
)

@Serializable
data class CompareWeek(val week: String = "", val me: Int = 0, val them: Int = 0)

@Serializable
data class CompareStreak(val me: Int = 0, val them: Int = 0)

@Serializable
data class Compare(
    val friend: Author = Author(),
    val unit: String = "kg",
    val lifts: List<CompareLift> = emptyList(),
    val weeks: List<CompareWeek> = emptyList(),
    val streak: CompareStreak = CompareStreak(),
    val stale: Boolean = false,
) {
    /** ×bodyweight is available when both sides share it for at least one lift. */
    val hasBw: Boolean get() = lifts.any { it.meBw != null && it.themBw != null }
}

@Serializable
data class SocialNotification(
    val id: String = "",
    /** request | accepted | reaction | comment */
    val kind: String = "",
    val from: Author = Author(),
    val item: String? = null,
    val emoji: String? = null,
    val text: String? = null,
    val at: String = "",
    val read: Boolean = false,
)

@Serializable
data class NotificationList(val items: List<SocialNotification> = emptyList()) {
    val unread: Int get() = items.count { !it.read }
}
