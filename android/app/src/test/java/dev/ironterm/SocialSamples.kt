package dev.ironterm

import dev.ironterm.data.app.Load
import dev.ironterm.data.social.Author
import dev.ironterm.data.social.Comment
import dev.ironterm.data.social.Compare
import dev.ironterm.data.social.CompareLift
import dev.ironterm.data.social.CompareStreak
import dev.ironterm.data.social.CompareWeek
import dev.ironterm.data.social.FeedExercise
import dev.ironterm.data.social.FeedItem
import dev.ironterm.data.social.FeedSet
import dev.ironterm.data.social.Friend
import dev.ironterm.data.social.FriendList
import dev.ironterm.data.social.NotificationList
import dev.ironterm.data.social.ProfileDoc
import dev.ironterm.data.social.ProfileGraph
import dev.ironterm.data.social.ProfileLift
import dev.ironterm.data.social.ProfileStreak
import dev.ironterm.data.social.ProfileWeek
import dev.ironterm.data.social.Reaction
import dev.ironterm.data.social.SocialMe
import dev.ironterm.data.social.SocialNotification
import dev.ironterm.data.social.SocialProfile
import dev.ironterm.data.social.TopSet
import dev.ironterm.data.social.Who
import dev.ironterm.ui.FeedUi
import dev.ironterm.ui.SocialUi
import java.time.Instant
import java.time.LocalDate

/** Made-up social data for screenshots and controller tests (spec-shaped; fixtures cover the real wire format). */
object SocialSamples {
    val now: Long = Instant.parse("2026-10-15T16:04:00Z").toEpochMilli()
    fun at(minutesAgo: Long): String = Instant.ofEpochMilli(now - minutesAgo * 60_000).toString()

    const val ME = "https://gym.example.com"
    val me = SocialMe(true, "lifter", "Lifter", ME, "https://directory.example.org", listed = true, fingerprint = "a1b2 c3d4 e5f6 0718", directoryConfigured = true)
    val meOff = SocialMe(false, null, null, ME, null, false, "a1b2 c3d4 e5f6 0718", directoryConfigured = true)

    val sam = Friend("5a3c0e1f2b4d", "https://sam.example.net", "sam", "Sam", Friend.FRIENDS, "lifts", "lifts", at(60L * 24 * 90), at(12), "9f8e 7d6c 5b4a 3921")
    val alex = Friend("0b7e4c2a9d11", "https://iron.alex.example", "alex", "Alex", Friend.FRIENDS, "full", "full", at(60L * 24 * 200), at(3), "1c2d 3e4f 5a6b 7c8d")
    val jo = Friend("7c1d2e3f4a5b", "https://jo-lifts.example.org", "jo", "Jo", Friend.FRIENDS, "basic", "basic", at(60L * 24 * 30), at(60L * 26), "2468 ace0 1357 9bdf")
    val riley = Friend("e4f5a6b7c8d9", "https://riley.example.com", "riley", "Riley", Friend.INCOMING, "basic", null, at(95), null, "77aa 88bb 99cc 00dd", note = "Hey! Saw you at the squat rack on Tuesday.")
    val casey = Friend("d0c1b2a39485", "https://casey.example.com", null, "Casey", Friend.OUTGOING, "lifts", null, at(60L * 24 * 2), null, "1111 2222 3333 4444")
    val friends = FriendList(listOf(sam, alex, jo, riley, casey))

    private fun who(f: Friend) = Who(f.server, f.name)
    private val self = Who(ME, "Lifter")

    val feedItems = listOf(
        FeedItem(
            id = "w:9001", at = at(42), kind = FeedItem.SESSION, author = alex.author, title = "Day B · Squat / Press", durationMin = 68.0, sets = 19,
            exercises = listOf(
                FeedExercise("Squat (Barbell)", "squat", TopSet(150.0, 5), listOf(FeedSet(60.0, 5), FeedSet(100.0, 3), FeedSet(150.0, 5), FeedSet(150.0, 5), FeedSet(150.0, 5))),
                FeedExercise("Overhead Press (Barbell)", "ohp", TopSet(65.0, 6), listOf(FeedSet(65.0, 6), FeedSet(65.0, 6), FeedSet(65.0, 5))),
                FeedExercise("Lat Pulldown (Cable)", null, TopSet(70.0, 10), listOf(FeedSet(70.0, 10), FeedSet(70.0, 10))),
            ),
            volume = 11840.0, note = "Squats moved fast today. Belt on for the top sets.",
            reactions = listOf(Reaction("💪", listOf(self, who(sam))), Reaction("🔥", listOf(who(jo)))),
            comments = listOf(Comment("c1", who(sam), "Easy depth on those, nice", at(30)), Comment("c2", who(alex), "Thanks! 160 next week", at(25))),
        ),
        FeedItem(id = "pr:9001:squat:e1rm:5", at = at(41), kind = FeedItem.PR, author = alex.author, lift = "squat", liftName = "Squat", prKind = "e1rm", reps = 5, weight = 150.0, prev = 145.0,
            reactions = listOf(Reaction("🏆", listOf(who(sam)))),
        ),
        FeedItem(
            id = "w:5120", at = at(60L * 5), kind = FeedItem.SESSION, author = sam.author, title = "Push Day", durationMin = 52.0, sets = 15,
            exercises = listOf(
                FeedExercise("Bench Press (Barbell)", "bench", TopSet(100.0, 5)),
                FeedExercise("Incline Dumbbell Press", null, TopSet(32.5, 8)),
                FeedExercise("Triceps Pushdown", null, TopSet(35.0, 12)),
            ),
            reactions = listOf(Reaction("👏", listOf(self))),
        ),
        FeedItem(id = "pr:7781:deadlift:weight:1", at = at(60L * 26), kind = FeedItem.PR, author = jo.author, lift = "deadlift", liftName = "Deadlift", prKind = "weight", reps = 1),
        FeedItem(id = "a:streak-12", at = at(60L * 30), kind = FeedItem.ACHIEVEMENT, author = sam.author, title = "12-week streak", tier = "gold", description = "Trained at least once a week for 12 weeks straight.",
            reactions = listOf(Reaction("🔥", listOf(who(alex), who(jo), self)))),
        FeedItem(id = "w:7770", at = at(60L * 28), kind = FeedItem.SESSION, author = jo.author, title = "Pull", durationMin = 47.0, sets = 14,
            exercises = listOf(FeedExercise("Deadlift (Barbell)", "deadlift"), FeedExercise("Barbell Row", "row"), FeedExercise("Chin Up", null))),
    )
    val feed = FeedUi(feedItems, next = "7c1d2e3f4a5b|w:7770", stale = listOf(jo.id), loaded = true, savedAt = now - 60_000)

    val mine = FeedUi(
        listOf(
            FeedItem(id = "w:1200", at = at(60L * 20), kind = FeedItem.SESSION, title = "Day A · Bench / Deadlift", durationMin = 71.0, sets = 21,
                exercises = listOf(FeedExercise("Bench Press (Barbell)", "bench", TopSet(110.0, 3)), FeedExercise("Deadlift (Barbell)", "deadlift", TopSet(200.0, 3))),
                volume = 12960.0,
                reactions = listOf(Reaction("💪", listOf(who(alex), who(sam))), Reaction("😤", listOf(who(jo)))),
                comments = listOf(Comment("m1", who(alex), "200 for a triple!", at(60L * 18)), Comment("m2", who(sam), "Beast", at(60L * 17)))),
            FeedItem(id = "pr:1200:deadlift:e1rm:3", at = at(60L * 20 - 1), kind = FeedItem.PR, lift = "deadlift", liftName = "Deadlift", prKind = "e1rm", reps = 3, weight = 200.0, prev = 195.0,
                reactions = listOf(Reaction("🏆", listOf(who(alex))))),
            FeedItem(id = "a:sessions-100", at = at(60L * 24 * 6), kind = FeedItem.ACHIEVEMENT, title = "100 sessions", tier = "silver", description = "Logged 100 workouts."),
        ),
        loaded = true, savedAt = now,
    )

    val notifications = NotificationList(listOf(
        SocialNotification("n1", "request", riley.author, at = at(95), read = false, text = riley.note),
        SocialNotification("n2", "reaction", alex.author, item = "w:1200", emoji = "💪", at = at(60L * 19), read = false),
        SocialNotification("n3", "comment", sam.author, item = "w:1200", text = "Beast", at = at(60L * 17), read = false),
        SocialNotification("n4", "accepted", jo.author, at = at(60L * 24 * 30), read = true),
    ))

    private fun graph(seed: Int, start: LocalDate = LocalDate.parse("2025-10-13")): ProfileGraph {
        var x = seed
        val days = java.time.temporal.ChronoUnit.DAYS.between(start, LocalDate.parse("2026-10-15")).toInt() + 1
        return ProfileGraph(start.toString(), (0 until 53 * 7).map { i ->
            x = (x * 1103515245 + 12345) and 0x7fffffff
            if (i >= days) 0 else if (x % 7 < 3) 1 + (x / 7) % 4 else 0
        })
    }

    val alexProfile = SocialProfile(
        alex.server, "alex", "Alex", "full", "kg", ProfileStreak(14, 31), ProfileWeek(3, 4), 168, graph(7),
        listOf(ProfileLift("squat", "Squat", 172.5, 175.0), ProfileLift("bench", "Bench Press", 112.0, 115.0), ProfileLift("deadlift", "Deadlift", 205.0, 210.0), ProfileLift("ohp", "Overhead Press", 74.0, 75.0)),
        bodyweight = 84.2, program = "GZCLP", updatedAt = at(3),
    )
    val joProfile = SocialProfile(
        jo.server, "jo", "Jo", "basic", null, ProfileStreak(5, 9), ProfileWeek(1, 3), 96, graph(3),
        listOf(ProfileLift("squat", "Squat"), ProfileLift("deadlift", "Deadlift")), updatedAt = at(60L * 26),
    )

    val alexCompare = Compare(
        alex.author, "kg",
        listOf(
            CompareLift("squat", "Squat", 165.0, 172.5, 1.96, 2.05), CompareLift("bench", "Bench Press", 118.0, 112.0, 1.40, 1.33),
            CompareLift("deadlift", "Deadlift", 215.0, 205.0, 2.55, 2.43), CompareLift("ohp", "Overhead Press", 70.0, 74.0, 0.83, 0.88),
        ),
        (0 until 12).map { i -> CompareWeek(LocalDate.parse("2026-07-27").plusWeeks(i.toLong()).toString(), listOf(3, 4, 3, 2, 4, 3, 3, 0, 4, 3, 4, 2)[i], listOf(4, 4, 3, 4, 4, 4, 3, 4, 4, 3, 4, 3)[i]) },
        CompareStreak(8, 14),
    )
    val joCompare = Compare(jo.author, "kg", listOf(CompareLift("squat", "Squat", 165.0, null), CompareLift("deadlift", "Deadlift", 215.0, null)),
        (0 until 12).map { i -> CompareWeek(LocalDate.parse("2026-07-27").plusWeeks(i.toLong()).toString(), 3, i % 3) }, CompareStreak(8, 5))

    val alexFeed = FeedUi(feedItems.filter { it.author?.id == alex.id }, next = null, loaded = true, savedAt = now)

    val ui = SocialUi(
        me = Load.of(me, now), friends = Load.of(friends, now), feed = feed, mine = mine,
        profile = mapOf(alex.id to Load.of(ProfileDoc(alexProfile), now), jo.id to Load.of(ProfileDoc(joProfile, stale = true), now)),
        compare = mapOf(alex.id to Load.of(alexCompare, now), jo.id to Load.of(joCompare, now)),
        friendFeed = mapOf(alex.id to alexFeed, jo.id to FeedUi(feedItems.filter { it.author?.id == jo.id }, loaded = true, stale = listOf(jo.id))),
        notifications = Load.of(notifications, now),
    )

    val authorOf: (Friend) -> Author = { it.author }
}
