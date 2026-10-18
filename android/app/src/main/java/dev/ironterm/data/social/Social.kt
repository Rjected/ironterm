package dev.ironterm.data.social

import dev.ironterm.data.GraphDay
import java.time.Instant
import java.time.LocalDate

/** Pure social logic (no Android): reaction toggling, identities, graph and time helpers. */
object Social {
    /** "https://Gym.Example.com/" → "https://gym.example.com" */
    fun origin(s: String?): String = s.orEmpty().trim().trimEnd('/').lowercase()

    fun same(a: String?, b: String?): Boolean = a != null && b != null && origin(a).isNotEmpty() && origin(a) == origin(b)

    /** The emoji I currently have on [item] (one reaction per person per item), or null. */
    fun myReaction(item: FeedItem, me: String?): String? =
        item.reactions.firstOrNull { r -> r.from.any { same(it.server, me) } }?.emoji

    /**
     * Tapping [emoji] on [item]: the same emoji again removes it, another one replaces mine.
     * Returns the item as it should look now (optimistic) and what to POST (null = remove).
     */
    fun toggle(item: FeedItem, emoji: String, me: String, myName: String?): Pair<FeedItem, String?> {
        val current = myReaction(item, me)
        val send = if (current == emoji) null else emoji
        return withReaction(item, send, me, myName) to send
    }

    /** [item] with my reaction set to [emoji] (null = none). Empty reaction groups are dropped; order is kept. */
    fun withReaction(item: FeedItem, emoji: String?, me: String, myName: String?): FeedItem {
        val stripped = item.reactions.map { r -> r.copy(from = r.from.filterNot { same(it.server, me) }) }
        val added = if (emoji == null) stripped else {
            val who = Who(origin(me), myName)
            if (stripped.any { it.emoji == emoji }) stripped.map { if (it.emoji == emoji) it.copy(from = it.from + who) else it }
            else stripped + Reaction(emoji, listOf(who))
        }
        return item.copy(reactions = added.filter { it.from.isNotEmpty() })
    }

    /** Reaction chips in the fixed order, with counts and whether one is mine. Unknown emoji keep their count after the fixed set. */
    fun chips(item: FeedItem, me: String?): List<Chip> {
        val mine = myReaction(item, me)
        val counts = item.reactions.associate { it.emoji to it.from.size }
        val fixed = Emoji.all.map { Chip(it, counts[it] ?: 0, it == mine) }
        val extra = item.reactions.filter { it.emoji !in Emoji.all && it.from.isNotEmpty() }.map { Chip(it.emoji, it.from.size, it.emoji == mine) }
        return fixed + extra
    }

    data class Chip(val emoji: String, val count: Int, val mine: Boolean)

    /** Apply [f] to every copy of the item ([authorId], [itemId]) in [items]. */
    fun update(items: List<FeedItem>, authorId: String?, itemId: String, f: (FeedItem) -> FeedItem): List<FeedItem> =
        items.map { if (it.id == itemId && (authorId == null || it.author == null || it.author.id == authorId)) f(it) else it }

    /** Profile graph (Monday-first weeks × 7 levels) → graph days, like the snapshot's. */
    fun graphDays(g: ProfileGraph): List<GraphDay> {
        val start = runCatching { LocalDate.parse(g.start) }.getOrNull() ?: return emptyList()
        return g.levels.mapIndexed { i, l -> GraphDay(start.plusDays(i.toLong()).toString(), l.coerceIn(0, 4)) }
    }

    fun epochMs(iso: String?): Long = runCatching { Instant.parse(iso).toEpochMilli() }.getOrDefault(0L)

    /** "JUST NOW" · "12M" · "3H" · "2D" · "15 OCT" */
    fun ago(iso: String?, now: Long): String {
        val t = epochMs(iso)
        if (t <= 0) return ""
        val s = (now - t) / 1000
        return when {
            s < 60 -> "NOW"
            s < 3600 -> "${s / 60}M"
            s < 86_400 -> "${s / 3600}H"
            s < 7 * 86_400 -> "${s / 86_400}D"
            else -> {
                val d = Instant.ofEpochMilli(t).atZone(java.time.ZoneOffset.UTC).toLocalDate()
                "${d.dayOfMonth} ${dev.ironterm.Fmt.month(d)}"
            }
        }
    }

    /** Valid directory handle (PROTOCOL.md §3). */
    fun validHandle(h: String): Boolean = Regex("^[a-z0-9][a-z0-9_-]{1,29}$").matches(h)

    /** What ADD FRIEND sends for free text: a server URL (has a dot or scheme) or a handle. */
    fun target(input: String): Pair<String, String>? {
        val s = input.trim().removePrefix("@")
        if (s.isEmpty()) return null
        return if (s.contains("://") || s.contains('.') || s.contains(':')) {
            val url = if (s.contains("://")) s else "https://$s"
            "server" to url.trimEnd('/')
        } else "handle" to s.lowercase()
    }
}
