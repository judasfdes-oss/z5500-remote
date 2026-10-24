package deck.z5500.remote

/**
 * NEC 32-bit encoder for ConsumerIrManager.transmit.
 * Hex layout is addr, ~addr, cmd, ~cmd. Each byte is sent LSB first.
 * Pattern alternates mark, space and ends on the stop mark.
 */
object NecEncoder {
    const val CARRIER_HZ = 38_000
    const val REPEAT_MS = 110L

    private const val HDR_MARK = 9000
    private const val HDR_SPACE = 4500
    private const val BIT_MARK = 560
    private const val ONE_SPACE = 1690
    private const val ZERO_SPACE = 560

    const val POWER = 0x10EF58A7
    const val VOLUME_UP = 0x10EF708F
    const val VOLUME_DOWN = 0x10EFB04F
    const val MUTE = 0x10EF30CF
    const val INPUT = 0x10EF20DF
    const val EFFECT = 0x10EF609F
    const val LEVEL = 0x10EFA05F

    fun frame(code: Int): IntArray {
        val out = ArrayList<Int>(67)
        out.add(HDR_MARK)
        out.add(HDR_SPACE)
        intArrayOf(24, 16, 8, 0).forEach { shift ->
            var byte = (code ushr shift) and 0xFF
            repeat(8) {
                out.add(BIT_MARK)
                out.add(if ((byte and 1) == 1) ONE_SPACE else ZERO_SPACE)
                byte = byte ushr 1
            }
        }
        out.add(BIT_MARK)
        return out.toIntArray()
    }
}
