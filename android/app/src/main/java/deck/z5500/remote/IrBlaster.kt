package deck.z5500.remote

import android.content.Context
import android.hardware.ConsumerIrManager
import android.os.Handler
import android.os.Looper
import java.util.concurrent.Executors

class IrBlaster(context: Context) {
    private val ir = context.getSystemService(Context.CONSUMER_IR_SERVICE) as? ConsumerIrManager
    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    @Volatile private var repeating = false
    private var repeatTask: Runnable? = null
    var onFrame: ((code: Int, pattern: IntArray) -> Unit)? = null

    fun hasEmitter(): Boolean = ir?.hasIrEmitter() == true

    fun transmit(code: Int) {
        val pattern = NecEncoder.frame(code)
        onFrame?.invoke(code, pattern)
        executor.execute {
            val emitter = ir
            if (emitter == null || !emitter.hasIrEmitter()) return@execute
            try {
                emitter.transmit(NecEncoder.CARRIER_HZ, pattern)
            } catch (_: Exception) {
                // Carrier rejected by the HAL. The UI already reported hardware state.
            }
        }
    }

    /** First frame immediately, then the same code every 110 ms while held. */
    fun startRepeat(code: Int) {
        stopRepeat()
        repeating = true
        transmit(code)
        val task = object : Runnable {
            override fun run() {
                if (!repeating) return
                transmit(code)
                handler.postDelayed(this, NecEncoder.REPEAT_MS)
            }
        }
        repeatTask = task
        handler.postDelayed(task, NecEncoder.REPEAT_MS)
    }

    fun stopRepeat() {
        repeating = false
        repeatTask?.let(handler::removeCallbacks)
        repeatTask = null
    }

    fun shutdown() {
        stopRepeat()
        executor.shutdownNow()
    }
}
