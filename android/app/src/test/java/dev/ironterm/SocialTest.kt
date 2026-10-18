package dev.ironterm

import dev.ironterm.data.app.AppJson
import dev.ironterm.data.social.Author
import dev.ironterm.data.social.Compare
import dev.ironterm.data.social.Emoji
import dev.ironterm.data.social.FeedItem
import dev.ironterm.data.social.FeedPage
import dev.ironterm.data.social.Friend
import dev.ironterm.data.social.FriendList
import dev.ironterm.data.social.NotificationList
import dev.ironterm.data.social.ProfileDoc
import dev.ironterm.data.social.ProfileGraph
import dev.ironterm.data.social.Reaction
import dev.ironterm.data.social.SearchResult
import dev.ironterm.data.social.Share
import dev.ironterm.data.social.Social
import dev.ironterm.data.social.SocialMe
import dev.ironterm.data.social.SocialNotification
import dev.ironterm.data.social.Who
import dev.ironterm.ui.Nav
import dev.ironterm.ui.Route
import dev.ironterm.ui.Tabs
import dev.ironterm.data.SourceMode
import dev.ironterm.work.SocialNotifier
import kotlinx.serialization.KSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Social documents parse from the server's own fixtures (docs/api/social, copied to test resources). */
class SocialModelsTest {
    private fun <T> parse(name: String, ser: KSerializer<T>): T =
        AppJson.json.decodeFromString(ser, SocialModelsTest::class.java.classLoader!!.getResource("social/$name.json")!!.readText())

    @Test fun me() {
        val m = parse("me", SocialMe.serializer())
        assertTrue(m.enabled)
        assertEquals("alice", m.handle)
        assertEquals("https://a.test", m.server)
        assertTrue(m.listed)
        assertTrue(m.directoryConfigured)
        // a fresh server key each fixture run: check the format (16 hex in groups of 4), not the value
        assertTrue(Regex("^[0-9a-f]{4}(-[0-9a-f]{4}){3}$").matches(m.fingerprint ?: ""))
    }

    @Test fun friends() {
        val l = parse("friends", FriendList.serializer())
        val f = l.friends.single()
        assertEquals("650b12a8f954", f.id)
        assertEquals(Friend.FRIENDS, f.status)
        assertEquals(Share.FULL, f.share)
        assertEquals(Share.LIFTS, f.theirShare)
        assertEquals("Gym buddy from Tuesdays", f.note)
        assertEquals(listOf(f), l.accepted)
        assertTrue(l.incoming.isEmpty() && l.outgoing.isEmpty())
        assertEquals("Bob", f.author.display)
        assertEquals("@bob · b.test", f.author.address)
    }

    @Test fun mergedFeed() {
        val p = parse("feed", FeedPage.serializer())
        assertEquals(20, p.items.size)
        assertNotNull(p.next)
        assertTrue(p.stale.isEmpty())
        assertTrue(p.items.all { it.author?.id == "650b12a8f954" })
        val pr = p.items.first()
        assertEquals(FeedItem.PR, pr.kind)
        assertEquals("rep", pr.prKind)
        assertEquals(134.6, pr.weight!!, 0.0)
        assertEquals(132.1, pr.prev!!, 0.0)
        val s = p.items.first { it.kind == FeedItem.SESSION }
        assertEquals("Strength · B1", s.title)
        assertEquals(16, s.sets)
        assertEquals(66.0, s.durationMin!!, 0.0)
        assertNotNull(s.exercises.first().top)
        assertNull(s.exercises.first().sets) // lifts share: no per-set detail
        assertEquals("💪", s.reactions.single().emoji)
        assertEquals("https://a.test", s.reactions.single().from.single().server)
        assertEquals("Big week, nice work.", s.comments.single().text)
        // newest first
        assertEquals(p.items.map { it.at }, p.items.map { it.at }.sortedDescending())
    }

    @Test fun friendFeedFull() {
        val p = parse("feed-full", FeedPage.serializer())
        val s = p.items.first { it.kind == FeedItem.SESSION }
        assertTrue(s.exercises.first().sets!!.isNotEmpty())
        assertEquals(68.6, s.exercises.first().sets!!.first().weight!!, 0.0)
    }

    @Test fun mine() {
        val p = parse("mine", FeedPage.serializer())
        assertEquals(30, p.items.size)
        assertTrue(p.items.all { it.author == null })
        assertEquals("🔥", p.items.first().reactions.single().emoji)
        assertEquals(setOf(FeedItem.PR, FeedItem.SESSION, FeedItem.ACHIEVEMENT).containsAll(p.items.map { it.kind }.toSet()), true)
    }

    @Test fun profile() {
        val d = parse("profile", ProfileDoc.serializer())
        val p = d.profile
        assertFalse(d.stale)
        assertEquals(Share.LIFTS, p.share)
        assertEquals("kg", p.unit)
        assertEquals(371, p.graph.levels.size)
        assertEquals(119, p.sessions52)
        assertEquals(2, p.week.done)
        assertEquals("squat", p.lifts.first().key)
        assertNotNull(p.lifts.first().e1rm)
        assertNull(p.bodyweight) // full only
        val days = Social.graphDays(p.graph)
        assertEquals(371, days.size)
        assertEquals("2025-10-13", days.first().date)
        assertEquals("2026-10-18", days.last().date)
    }

    @Test fun compare() {
        val c = parse("compare", Compare.serializer())
        assertEquals("lb", c.unit)
        assertEquals("bob", c.friend.handle)
        assertEquals(12, c.weeks.size)
        assertTrue(c.hasBw)
        assertEquals(589.2, c.lifts.first().me!!, 0.0)
        assertEquals(3.4, c.lifts.first().themBw!!, 0.0)
    }

    @Test fun notifications() {
        val n = parse("notifications", NotificationList.serializer())
        assertEquals(4, n.unread)
        assertEquals(listOf("comment", "reaction", "reaction", "request"), n.items.map { it.kind })
        assertEquals("🔥", n.items[1].emoji)
        assertEquals("93fb074e7b13", n.items[0].from.id)
        assertNull(n.items[3].item)
    }

    @Test fun search() {
        val s = parse("search", SearchResult.serializer())
        assertEquals("bob", s.users.single().handle)
    }

    @Test fun lenientAboutUnknownAndMissing() {
        val i = AppJson.json.decodeFromString(FeedItem.serializer(), """{"id":"x","kind":"future","newField":{"a":1}}""")
        assertEquals("future", i.kind)
        assertTrue(i.reactions.isEmpty())
        val m = AppJson.json.decodeFromString(SocialMe.serializer(), """{"enabled":false,"handle":null}""")
        assertFalse(m.enabled)
    }
}

class SocialLogicTest {
    private val me = "https://a.test"
    private val bob = Author("650b12a8f954", "https://b.test", "bob", "Bob")
    private fun item(vararg r: Reaction) = FeedItem(id = "w:1", kind = FeedItem.SESSION, author = bob, reactions = r.toList())
    private val carol = Who("https://c.test", "Carol")
    private val self = Who(me, "Alice")

    @Test fun toggleAddsWhenNone() {
        val (i, send) = Social.toggle(item(), "💪", me, "Alice")
        assertEquals("💪", send)
        assertEquals(listOf(Reaction("💪", listOf(Who(me, "Alice")))), i.reactions)
        assertEquals("💪", Social.myReaction(i, me))
    }

    @Test fun toggleSameRemoves() {
        val (i, send) = Social.toggle(item(Reaction("💪", listOf(self, carol))), "💪", me, "Alice")
        assertNull(send)
        assertEquals(listOf(Reaction("💪", listOf(carol))), i.reactions)
        assertNull(Social.myReaction(i, me))
    }

    @Test fun toggleOtherReplacesMine() {
        val (i, send) = Social.toggle(item(Reaction("💪", listOf(self)), Reaction("🔥", listOf(carol))), "🔥", me, "Alice")
        assertEquals("🔥", send)
        // my 💪 group is gone (it had only me), 🔥 now has Carol and me
        assertEquals(listOf(Reaction("🔥", listOf(carol, Who(me, "Alice")))), i.reactions)
    }

    @Test fun myReactionMatchesOriginLoosely() {
        val i = item(Reaction("👏", listOf(Who("https://A.test/", null))))
        assertEquals("👏", Social.myReaction(i, me))
        assertNull(Social.myReaction(i, "https://a.test.evil"))
        assertNull(Social.myReaction(i, null))
    }

    @Test fun rollbackRestoresPrevious() {
        val start = item(Reaction("💪", listOf(self)))
        val before = Social.myReaction(start, me)
        val (optimistic, _) = Social.toggle(start, "🔥", me, "Alice")
        val rolled = Social.withReaction(optimistic, before, me, "Alice")
        assertEquals("💪", Social.myReaction(rolled, me))
        assertEquals(1, rolled.reactions.size)
    }

    @Test fun chipsAreTheFixedSetInOrder() {
        val chips = Social.chips(item(Reaction("🏆", listOf(carol, self)), Reaction("🦄", listOf(carol))), me)
        assertEquals(Emoji.all + "🦄", chips.map { it.emoji })
        assertEquals(2, chips.first { it.emoji == "🏆" }.count)
        assertTrue(chips.first { it.emoji == "🏆" }.mine)
        assertEquals(0, chips.first { it.emoji == "💪" }.count)
        assertEquals(listOf("💪", "🔥", "👏", "🏆", "😤"), Emoji.all)
    }

    @Test fun updateTouchesOnlyThatAuthorsItem() {
        val other = FeedItem(id = "w:1", kind = FeedItem.SESSION, author = Author("ffffffffffff", "https://c.test"))
        val out = Social.update(listOf(item(), other), bob.id, "w:1") { it.copy(title = "X") }
        assertEquals("X", out[0].title)
        assertNull(out[1].title)
    }

    @Test fun shareLabels() {
        assertEquals("BASIC", Share.label("basic"))
        assertEquals("LIFTS", Share.label("lifts"))
        assertEquals("FULL", Share.label("full"))
        assertEquals("—", Share.label(null))
        assertEquals(listOf("basic", "lifts", "full"), Share.all)
        assertTrue(Share.describe("basic").contains("without weights"))
        assertTrue(Share.describe("lifts").contains("e1RM"))
        assertTrue(Share.describe("full").contains("every set"))
        assertTrue(Share.rank("full") > Share.rank("lifts") && Share.rank("lifts") > Share.rank("basic"))
        assertEquals("Not known yet.", Share.describe(null))
    }

    @Test fun addTargets() {
        assertEquals("handle" to "sam", Social.target("@Sam"))
        assertEquals("server" to "https://gym.example.com", Social.target("gym.example.com/"))
        assertEquals("server" to "http://127.0.0.1:8771", Social.target("http://127.0.0.1:8771"))
        assertNull(Social.target("  "))
        assertTrue(Social.validHandle("sam_1"))
        assertFalse(Social.validHandle("s"))
        assertFalse(Social.validHandle("-sam"))
        assertFalse(Social.validHandle("Sam"))
    }

    @Test fun graphDaysClampLevels() {
        val d = Social.graphDays(ProfileGraph("2026-10-12", listOf(0, 9, -1)))
        assertEquals(listOf(0, 4, 0), d.map { it.level })
        assertEquals("2026-10-14", d.last().date)
        assertTrue(Social.graphDays(ProfileGraph("bad", listOf(1))).isEmpty())
    }

    @Test fun ago() {
        val now = java.time.Instant.parse("2026-10-15T16:04:00Z").toEpochMilli()
        assertEquals("NOW", Social.ago("2026-10-15T16:03:30Z", now))
        assertEquals("42M", Social.ago("2026-10-15T15:22:00Z", now))
        assertEquals("5H", Social.ago("2026-10-15T11:00:00Z", now))
        assertEquals("2D", Social.ago("2026-10-13T12:00:00Z", now))
        assertEquals("15 SEP", Social.ago("2026-09-15T12:00:00Z", now))
        assertEquals("", Social.ago("garbage", now))
    }

    @Test fun notifierAnnouncesEachOnce() {
        val a = SocialNotification("1", "reaction", bob, emoji = "💪", at = "2026-10-15T10:00:00Z")
        val b = SocialNotification("2", "comment", bob, text = "nice", at = "2026-10-15T11:00:00Z")
        val read = SocialNotification("3", "request", bob, at = "2026-10-15T12:00:00Z", read = true)
        assertEquals(listOf(b, a), SocialNotifier.fresh(listOf(a, b, read), null))
        assertEquals(listOf(b), SocialNotifier.fresh(listOf(a, b, read), a.at))
        assertTrue(SocialNotifier.fresh(listOf(a, b), b.at).isEmpty())
        assertEquals("Friends · 2 new" to "Bob commented: nice and 1 more", SocialNotifier.summary(listOf(b, a)))
        assertEquals("Friends" to "Bob reacted 💪 to your activity", SocialNotifier.summary(listOf(a)))
    }

    @Test fun navBarAndNormalize() {
        assertEquals(listOf(Tabs.TODAY, Tabs.GYM, Tabs.FRIENDS, Tabs.HISTORY, Tabs.MORE), Tabs.bar(SourceMode.SERVER))
        assertEquals(listOf(Tabs.TODAY, Tabs.GYM, Tabs.LIFTS, Tabs.HISTORY, Tabs.MORE), Tabs.bar(SourceMode.DIRECT))
        // LIFTS (widget deep link) with a server opens under MORE; FRIENDS in Direct mode too
        assertEquals(Nav(Tabs.MORE, listOf(Route.Lifts, Route.Lift("squat"))), Nav(Tabs.LIFTS, listOf(Route.Lift("squat"))).normalize(Tabs.bar(SourceMode.SERVER)))
        assertEquals(Nav(Tabs.MORE, listOf(Route.Friends)), Nav(Tabs.FRIENDS).normalize(Tabs.bar(SourceMode.DIRECT)))
        assertEquals(Nav(Tabs.LIFTS), Nav(Tabs.LIFTS).normalize(Tabs.bar(SourceMode.DIRECT)))
        assertEquals(Nav(Tabs.FRIENDS, listOf(Route.Notifications)), Nav.resolve(Tabs.NOTIFICATIONS))
        assertEquals(Nav(Tabs.LIFTS), Nav.resolve(Tabs.LIFTS))
    }
}
