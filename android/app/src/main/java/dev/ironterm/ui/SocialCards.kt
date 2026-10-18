package dev.ironterm.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ironterm.Fmt
import dev.ironterm.data.social.Author
import dev.ironterm.data.social.Compare
import dev.ironterm.data.social.FeedItem
import dev.ironterm.data.social.Share
import dev.ironterm.data.social.Social

// ═════════════════════════════ small pieces ═════════════════════════════

private val AVATAR = listOf(Color(0xFF8CB4FF), Color(0xFFFFB000), Color(0xFF7FD1AE), Color(0xFFE58FD6), Color(0xFFFF8A65), Color(0xFFB0BEC5))

/** Square initial in a colour derived from the friend id. */
@Composable
fun Avatar(a: Author?, size: Dp = 32.dp) {
    val c = AVATAR[Math.floorMod((a?.id ?: a?.server ?: "").hashCode(), AVATAR.size)]
    Box(Modifier.size(size).background(c.copy(alpha = 0.16f)).border(1.dp, c.copy(alpha = 0.6f)), contentAlignment = Alignment.Center) {
        Mono((a?.display ?: "?").trimStart('@').take(1).uppercase(), size = (size.value * 0.45f).sp, color = c, bold = true)
    }
}

/** Notification bell drawn on a canvas (crisp at any size, no emoji font needed) with an unread count. */
@Composable
fun Bell(unread: Int, onClick: () -> Unit) {
    Box(
        Modifier.clickable(onClickLabel = "Notifications", role = Role.Button, onClick = onClick).size(44.dp)
            .semantics { contentDescription = if (unread > 0) "Notifications, $unread unread" else "Notifications" },
        contentAlignment = Alignment.Center,
    ) {
        val col = if (unread > 0) T.amber else T.dim
        Canvas(Modifier.size(20.dp)) {
            val w = size.width
            val h = size.height
            val p = Path().apply {
                moveTo(w * 0.18f, h * 0.74f)
                cubicTo(w * 0.26f, h * 0.62f, w * 0.24f, h * 0.48f, w * 0.26f, h * 0.36f)
                cubicTo(w * 0.30f, h * 0.16f, w * 0.70f, h * 0.16f, w * 0.74f, h * 0.36f)
                cubicTo(w * 0.76f, h * 0.48f, w * 0.74f, h * 0.62f, w * 0.82f, h * 0.74f)
                close()
            }
            drawPath(p, col, style = Stroke(1.6.dp.toPx()))
            drawLine(col, Offset(w * 0.10f, h * 0.74f), Offset(w * 0.90f, h * 0.74f), 1.6.dp.toPx())
            drawCircle(col, w * 0.08f, Offset(w * 0.5f, h * 0.86f))
            drawCircle(col, w * 0.05f, Offset(w * 0.5f, h * 0.12f))
        }
        if (unread > 0) Box(Modifier.align(Alignment.TopEnd).padding(top = 6.dp, end = 4.dp).background(T.down).padding(horizontal = 4.dp)) {
            Mono(if (unread > 99) "99+" else "$unread", size = 9.sp, color = T.bg, bold = true, maxLines = 1)
        }
    }
}

/** Subtle "served from cache" marker for a friend whose server didn't answer. */
@Composable
fun StaleMark() {
    Mono("◌ CACHED", size = 8.sp, color = T.faint, maxLines = 1)
}

/** The three share levels with what each shows; tap one to pick it. */
@Composable
fun SharePicker(value: String, onPick: (String) -> Unit, name: String = "they") {
    Column(Modifier.fillMaxWidth()) {
        Share.all.forEach { lv ->
            val sel = lv == value
            Row(
                Modifier.fillMaxWidth().border(1.dp, if (sel) T.amber else T.line).background(if (sel) T.amber.copy(alpha = 0.08f) else T.bg)
                    .clickable(role = Role.RadioButton) { onPick(lv) }.heightIn(min = 56.dp).padding(12.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Mono(if (sel) "◉" else "○", Modifier.width(22.dp), size = 13.sp, color = if (sel) T.amber else T.dim)
                Column(Modifier.weight(1f)) {
                    Mono(Share.label(lv), size = 12.sp, color = if (sel) T.amber else T.text, bold = true)
                    Spacer(Modifier.height(2.dp))
                    Mono(Share.describe(lv), size = 10.sp, color = T.dim)
                }
            }
            Spacer(Modifier.height(6.dp))
        }
        Mono("You can change this any time. Lowering it stops future fetches; what $name already saw can't be recalled.", size = 9.sp, color = T.faint)
    }
}

// ═════════════════════════════ feed card ═════════════════════════════

/**
 * One feed item. [readOnly] (MY ACTIVITY): reactions show who left them and there's no comment box.
 * Weights appear only when the friend shares them (the server leaves them out at "basic").
 */
@Composable
fun FeedCard(
    item: FeedItem,
    me: String?,
    now: Long,
    actions: AppActions,
    stale: Boolean = false,
    busy: Set<String> = emptySet(),
    readOnly: Boolean = false,
    showAuthor: Boolean = true,
    onAuthor: ((Author) -> Unit)? = null,
) {
    var open by rememberSaveable(item.id) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        // header
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (showAuthor && item.author != null) {
                Box(Modifier.let { m -> onAuthor?.let { f -> m.clickable { f(item.author) } } ?: m }) { Avatar(item.author, 28.dp) }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Mono(item.author.display.uppercase(), size = 12.sp, bold = true, maxLines = 1)
                    Mono(kindLabel(item), size = 9.sp, color = T.faint, maxLines = 1)
                }
            } else {
                Mono(kindLabel(item), Modifier.weight(1f), size = 10.sp, color = T.faint, maxLines = 1)
            }
            if (stale) { StaleMark(); Spacer(Modifier.width(8.dp)) }
            Mono(Social.ago(item.at, now), size = 10.sp, color = T.dim, maxLines = 1)
        }
        Spacer(Modifier.height(10.dp))
        when (item.kind) {
            FeedItem.SESSION -> SessionBody(item)
            FeedItem.PR -> PrBody(item)
            FeedItem.ACHIEVEMENT -> AchievementBody(item)
            else -> Mono(item.title ?: item.kind.uppercase(), size = 12.sp, color = T.dim)
        }
        Spacer(Modifier.height(12.dp))
        ReactionRow(item, me, readOnly, busy, onReact = { actions.react(item, it) }, comments = item.comments.size, open = open, onComments = { open = !open })
        if (readOnly && item.reactions.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            item.reactions.filter { it.from.isNotEmpty() }.forEach { r ->
                Mono("${r.emoji} ${r.from.joinToString(", ") { it.display }}", size = 10.sp, color = T.dim, maxLines = 2)
            }
        }
        if (open || (readOnly && item.comments.isNotEmpty())) Comments(item, now, readOnly, sending = "comment:${item.id}" in busy) { actions.comment(item, it) }
    }
    Line()
}

private fun kindLabel(i: FeedItem) = when (i.kind) {
    FeedItem.SESSION -> "WORKOUT"
    FeedItem.PR -> "PERSONAL RECORD"
    FeedItem.ACHIEVEMENT -> "ACHIEVEMENT"
    else -> i.kind.uppercase()
}

@Composable
private fun SessionBody(i: FeedItem) {
    Mono((i.title ?: "Workout").uppercase(), size = 14.sp, bold = true, maxLines = 2)
    Spacer(Modifier.height(3.dp))
    val u = i.unit?.uppercase()
    val bits = listOfNotNull(
        i.durationMin?.takeIf { it > 0 }?.let { "${it.toInt()} MIN" },
        i.sets?.let { "$it SETS" },
        i.volume?.takeIf { it > 0 }?.let { Fmt.compact(it) + (u?.let { " $it" } ?: " VOL") },
    )
    if (bits.isNotEmpty()) Mono(bits.joinToString(" · "), size = 10.sp, color = T.dim, maxLines = 1)
    if (i.exercises.isNotEmpty()) {
        Spacer(Modifier.height(8.dp))
        val withTop = i.exercises.any { it.top != null || !it.sets.isNullOrEmpty() }
        if (!withTop) {
            Mono(i.exercises.joinToString(" · ") { it.name }, size = 11.sp, color = T.text, maxLines = 3)
        } else i.exercises.take(8).forEach { e ->
            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.Top) {
                Mono(e.name, Modifier.weight(1f), size = 11.sp, maxLines = 1)
                e.top?.let { t -> Mono("${Fmt.w(t.weight)}×${t.reps}", size = 11.sp, color = T.amber, bold = true, maxLines = 1) }
            }
            e.sets?.takeIf { it.isNotEmpty() }?.let { sets ->
                Mono(sets.joinToString("  ") { s -> listOfNotNull(s.weight?.let(Fmt::w), s.reps?.toString()).joinToString("×").ifEmpty { "—" } }, size = 9.sp, color = T.faint, maxLines = 2)
            }
        }
        if (i.exercises.size > 8) Mono("+${i.exercises.size - 8} more", size = 9.sp, color = T.faint)
    }
    i.note?.takeIf { it.isNotBlank() }?.let {
        Spacer(Modifier.height(8.dp))
        Row { Box(Modifier.width(2.dp).height(14.dp).background(T.line)); Spacer(Modifier.width(8.dp)); Mono(it, size = 11.sp, color = T.dim, maxLines = 4) }
    }
}

private fun prKindLabel(k: String?): String = when (k?.lowercase()) {
    "e1rm" -> "e1RM PR"
    "weight", "heaviest" -> "HEAVIEST"
    "reps", "rep" -> "REP PR"
    "volume" -> "VOLUME PR"
    null, "" -> "PR"
    else -> k.uppercase() + " PR"
}

@Composable
private fun PrBody(i: FeedItem) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Badge(prKindLabel(i.prKind))
        Spacer(Modifier.width(8.dp))
        Mono((i.liftName ?: i.lift ?: "").uppercase(), Modifier.weight(1f), size = 14.sp, bold = true, maxLines = 1)
    }
    Spacer(Modifier.height(6.dp))
    val u = i.unit?.uppercase()?.let { " $it" }.orEmpty()
    if (i.weight != null) {
        Row(verticalAlignment = Alignment.Bottom) {
            Mono(Fmt.w(i.weight) + if ((i.reps ?: 0) > 0) " × ${i.reps}" else "", size = 22.sp, color = T.amber, bold = true, maxLines = 1)
            if (u.isNotEmpty()) Mono(u, Modifier.padding(bottom = 3.dp), size = 11.sp, color = T.dim)
        }
        i.prev?.let { p -> Mono("WAS ${Fmt.w(p)}$u · ${Fmt.delta(i.weight - p)}", size = 10.sp, color = T.up, maxLines = 1) }
    } else {
        Mono(if ((i.reps ?: 0) > 0) "${i.reps} REP${if (i.reps == 1) "" else "S"}" else "NEW RECORD", size = 16.sp, color = T.amber, bold = true)
        Mono("weights not shared", size = 9.sp, color = T.faint)
    }
}

@Composable
private fun AchievementBody(i: FeedItem) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        i.tier?.takeIf { it.isNotBlank() }?.let { Badge(it.uppercase(), tierColor(it)); Spacer(Modifier.width(8.dp)) }
        Mono((i.title ?: "Achievement").uppercase(), Modifier.weight(1f), size = 14.sp, bold = true, maxLines = 2)
    }
    i.description?.takeIf { it.isNotBlank() }?.let { Spacer(Modifier.height(4.dp)); Mono(it, size = 11.sp, color = T.dim, maxLines = 3) }
}

private fun tierColor(t: String) = when (t.lowercase()) {
    "gold", "platinum", "legend" -> T.amber
    "silver" -> T.text
    "bronze" -> Color(0xFFCD8B55)
    else -> T.up
}

@Composable
private fun ReactionRow(item: FeedItem, me: String?, readOnly: Boolean, busy: Set<String>, onReact: (String) -> Unit, comments: Int, open: Boolean, onComments: () -> Unit) {
    val haptic = LocalHapticFeedback.current
    val chips = Social.chips(item, me).let { cs -> if (readOnly) cs.filter { it.count > 0 } else cs }
    val sending = "react:${item.author?.id}:${item.id}" in busy
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        chips.forEach { c ->
            Row(
                Modifier.border(1.dp, if (c.mine) T.amber else T.line).background(if (c.mine) T.amber.copy(alpha = 0.12f) else T.bg)
                    .let { if (readOnly || item.author == null) it else it.clickable(enabled = !sending, role = Role.Checkbox) { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onReact(c.emoji) } }
                    .heightIn(min = 34.dp).widthIn(min = 40.dp).padding(horizontal = 6.dp)
                    .semantics { contentDescription = "${c.emoji} ${c.count}${if (c.mine) ", yours" else ""}" },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
            ) {
                Mono(c.emoji, size = 13.sp)
                if (c.count > 0) Mono(" ${c.count}", size = 10.sp, color = if (c.mine) T.amber else T.dim, bold = c.mine)
            }
        }
        Spacer(Modifier.weight(1f))
        if (!readOnly || comments > 0) {
            Row(
                Modifier.clickable(enabled = !readOnly, onClickLabel = "Comments", onClick = onComments).heightIn(min = 34.dp).padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Mono("💬", size = 12.sp)
                Mono(if (comments > 0) " $comments" else "", size = 10.sp, color = if (open) T.amber else T.dim, bold = open)
                if (!readOnly) Mono(if (open) " ▴" else " ▾", size = 10.sp, color = T.faint)
            }
        }
    }
}

@Composable
private fun Comments(item: FeedItem, now: Long, readOnly: Boolean, sending: Boolean, onSend: (String) -> Unit) {
    Spacer(Modifier.height(10.dp))
    Column(Modifier.fillMaxWidth().background(T.panel).border(1.dp, T.line).padding(10.dp)) {
        if (item.comments.isEmpty()) Mono("No comments yet.", size = 10.sp, color = T.faint)
        item.comments.forEach { c ->
            Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Mono(c.from.display.uppercase(), size = 9.sp, color = T.amber, bold = true, maxLines = 1)
                    Mono(c.text, size = 11.sp)
                }
                Spacer(Modifier.width(8.dp))
                Mono(if (c.id.startsWith("local-")) "…" else Social.ago(c.at, now), size = 9.sp, color = T.faint)
            }
        }
        if (!readOnly) {
            Spacer(Modifier.height(8.dp))
            var text by rememberSaveable(item.id + "_c") { mutableStateOf("") }
            Row(verticalAlignment = Alignment.CenterVertically) {
                SearchField(text, { if (it.length <= 280) text = it }, "Write a comment…", Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                TButton(if (sending) "…" else "Send", primary = text.isNotBlank(), enabled = text.isNotBlank() && !sending) { onSend(text); text = "" }
            }
        }
    }
}

// ═════════════════════════════ compare ═════════════════════════════

/** Side-by-side e1RM per lift (or × bodyweight), sessions per week over 12 weeks, and the streaks. */
@Composable
fun CompareBlock(c: Compare, themName: String) {
    var bw by rememberSaveable { mutableStateOf(false) }
    val useBw = bw && c.hasBw
    val u = c.unit.uppercase()
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Mono("COMPARE", Modifier.weight(1f), size = 11.sp, color = T.amber, bold = true)
            if (c.hasBw) Seg(listOf("abs" to "E1RM", "bw" to "×BW"), if (useBw) "bw" else "abs", { bw = it == "bw" })
            else Mono("E1RM", size = 10.sp, color = T.dim)
        }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(9.dp).background(T.amber)); Mono(" YOU   ", size = 9.sp, color = T.dim)
            Box(Modifier.size(9.dp).background(T.up)); Mono(" ${themName.uppercase()}", Modifier.weight(1f), size = 9.sp, color = T.dim, maxLines = 1)
            Mono(if (useBw) "× BODYWEIGHT" else u, size = 9.sp, color = T.faint)
        }
        Spacer(Modifier.height(8.dp))
        val rows = c.lifts.map { l -> Triple(l.name, if (useBw) l.meBw else l.me, if (useBw) l.themBw else l.them) }.filter { it.second != null || it.third != null }
        if (rows.isEmpty()) {
            Mono(if (useBw) "Bodyweight isn't shared on both sides." else "No lifts to compare: they share at BASIC, or neither of you has logged the same lifts.", size = 10.sp, color = T.faint)
        }
        val max = rows.maxOfOrNull { maxOf(it.second ?: 0.0, it.third ?: 0.0) }?.takeIf { it > 0 } ?: 1.0
        fun v(x: Double?) = x?.let { if (useBw) "%.2f×".format(java.util.Locale.US, it) else Fmt.w(it) } ?: "—"
        rows.forEach { (name, me, them) ->
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Mono(name.uppercase(), Modifier.weight(1f), size = 10.sp, bold = true, maxLines = 1)
                if (me != null && them != null) Mono(Fmt.delta(if (useBw) (me - them) * 100 else me - them).let { if (useBw) "$it%BW" else it }, size = 9.sp, color = deltaColor(me - them))
            }
            Spacer(Modifier.height(3.dp))
            CompareBar(me, max, T.amber, v(me))
            Spacer(Modifier.height(2.dp))
            CompareBar(them, max, T.up, v(them))
        }
        if (c.weeks.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Mono("SESSIONS / WEEK", Modifier.weight(1f), size = 10.sp, color = T.dim, bold = true)
                Mono("${c.weeks.size}W · YOU ${c.weeks.sumOf { it.me }} · ${themName.uppercase().take(10)} ${c.weeks.sumOf { it.them }}", size = 9.sp, color = T.faint, maxLines = 1)
            }
            Spacer(Modifier.height(6.dp))
            WeekPairs(c)
        }
        Spacer(Modifier.height(14.dp))
        Row(Modifier.fillMaxWidth()) {
            Stat("Your streak", "${c.streak.me} WK", Modifier.weight(1f), valueColor = T.amber)
            Stat("${themName.take(12)}'s streak", "${c.streak.them} WK", Modifier.weight(1f), valueColor = T.up)
        }
    }
    Line()
}

@Composable
private fun CompareBar(x: Double?, max: Double, color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f).height(10.dp).background(T.line.copy(alpha = 0.5f))) {
            if (x != null && x > 0) Box(Modifier.fillMaxWidth((x / max).toFloat().coerceIn(0.02f, 1f)).height(10.dp).background(color))
        }
        Mono(label, Modifier.width(64.dp), size = 10.sp, color = if (x == null) T.faint else T.text, align = TextAlign.End, maxLines = 1)
    }
}

@Composable
private fun WeekPairs(c: Compare) {
    val max = c.weeks.maxOfOrNull { maxOf(it.me, it.them) }?.coerceAtLeast(1) ?: 1
    Canvas(Modifier.fillMaxWidth().height(56.dp)) {
        val n = c.weeks.size
        val slot = size.width / n
        val bw = (slot - 4.dp.toPx()) / 2
        c.weeks.forEachIndexed { i, w ->
            val x = i * slot + 1.dp.toPx()
            val hm = size.height * w.me / max
            val ht = size.height * w.them / max
            drawRect(T.line, Offset(x, 0f), Size(slot - 2.dp.toPx(), size.height), alpha = 0.25f)
            if (w.me > 0) drawRect(T.amber, Offset(x + 1.dp.toPx(), size.height - hm), Size(bw, hm))
            if (w.them > 0) drawRect(T.up, Offset(x + 1.dp.toPx() + bw, size.height - ht), Size(bw, ht))
        }
    }
    Row(Modifier.fillMaxWidth()) {
        Mono(c.weeks.firstOrNull()?.week?.let { Fmt.day(it).substringAfter(' ') } ?: "", Modifier.weight(1f), size = 8.sp, color = T.faint)
        Mono("THIS WEEK", size = 8.sp, color = T.faint)
    }
}
