package dev.ironterm.gym

import dev.ironterm.data.app.CatalogItem

/** One row in the ADD EXERCISE picker. */
data class PickItem(
    val lift: String,
    val name: String,
    val sub: String?,
    val kind: String,
    val title: String? = null,
    val templateId: String? = null,
    val cardio: Boolean = false,
) {
    companion object {
        /** Cardio machines the web picker offers (gym.tsx CARDIO). */
        val CARDIO = listOf(
            "Recumbent Bike", "Treadmill", "Running", "Cycling", "Rowing Machine", "Elliptical Trainer", "Stair Machine (Steps)",
            "Walking", "Air Bike", "Ski Erg", "Jump Rope", "Swimming", "Spinning",
        )

        fun fromCatalog(c: CatalogItem) = PickItem(lift = c.key, name = c.name, sub = c.hevy ?: "custom", kind = c.kind)

        /** Server mode without a catalog yet (offline): the built-in library. */
        fun library(): List<PickItem> = LiftLibrary.all.map { PickItem(it.key, it.name, it.hevy.firstOrNull() ?: "custom", it.kind) }

        fun cardio(): List<PickItem> = CARDIO.map { PickItem("cardio", it, "cardio", "cardio", title = it, templateId = "demo-cardio-$it", cardio = true) }

        /** Case-insensitive search over name and Hevy title, like the web picker. */
        fun filter(items: List<PickItem>, q: String, limit: Int = 60): List<PickItem> {
            val t = q.trim().lowercase()
            if (t.isEmpty()) return items.take(limit)
            return items.filter { it.name.lowercase().contains(t) || it.sub?.lowercase()?.contains(t) == true }.take(limit)
        }
    }
}
