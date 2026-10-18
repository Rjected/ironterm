package dev.ironterm.widget

import android.graphics.Color

/**
 * Graph colour ramps, index = level 0..4 (0 = no workout, 1 lightest .. 4 darkest).
 * BLUE is the Terminal ramp from docs/api/README.md, shared with the web app and iOS.
 */
enum class ColorTheme(val displayName: String, val colors: IntArray) {
    BLUE("Blue", intArrayOf(
        Color.rgb(0x16, 0x18, 0x1d),
        Color.rgb(0x8c, 0xb4, 0xff),
        Color.rgb(0x50, 0x82, 0xdc),
        Color.rgb(0x28, 0x5a, 0xb4),
        Color.rgb(0x0f, 0x32, 0x78),
    )),
    GREEN("Green", intArrayOf(
        Color.rgb(0x16, 0x18, 0x1d),
        Color.rgb(140, 230, 160),
        Color.rgb(80, 180, 100),
        Color.rgb(40, 130, 60),
        Color.rgb(15, 80, 30),
    )),
    PURPLE("Purple", intArrayOf(
        Color.rgb(0x16, 0x18, 0x1d),
        Color.rgb(200, 160, 255),
        Color.rgb(160, 110, 220),
        Color.rgb(120, 70, 180),
        Color.rgb(70, 30, 120),
    )),
    ORANGE("Orange", intArrayOf(
        Color.rgb(0x16, 0x18, 0x1d),
        Color.rgb(255, 200, 140),
        Color.rgb(230, 150, 80),
        Color.rgb(200, 100, 40),
        Color.rgb(140, 60, 15),
    ));

    fun level(l: Int): Int = colors[l.coerceIn(0, 4)]

    companion object {
        fun fromName(name: String?): ColorTheme = entries.find { it.name == name } ?: BLUE
    }
}
