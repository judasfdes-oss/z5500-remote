package deck.z5500.remote

import android.os.Bundle
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.dialog.MaterialAlertDialogBuilder

class MainActivity : AppCompatActivity() {
    private lateinit var blaster: IrBlaster
    private lateinit var status: TextView
    private lateinit var frame: TextView

    private var power = true
    private var inputIndex = 0
    private var effectIndex = 0
    private var levelIndex = 0

    private val inputs = arrayOf("Optical", "Coax", "6-Ch Direct", "Aux")
    private val effects = arrayOf("Stereo", "Stereo ×2", "PLII Movie", "PLII Music")
    private val levels = arrayOf("Master", "Subwoofer", "Center", "Surround")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        blaster = IrBlaster(this)
        status = findViewById(R.id.status)
        frame = findViewById(R.id.frame)
        blaster.onFrame = { code, pattern ->
            runOnUiThread {
                frame.text = "0x%08X · %d pulses\ntransmit(%d, …%d)".format(
                    code,
                    pattern.size,
                    NecEncoder.CARRIER_HZ,
                    pattern.last(),
                )
            }
        }

        findViewById<Button>(R.id.power).setOnClickListener {
            click(it)
            blaster.transmit(NecEncoder.POWER)
            power = !power
            render()
        }
        findViewById<Button>(R.id.mute).setOnClickListener {
            click(it)
            blaster.transmit(NecEncoder.MUTE)
        }

        hold(findViewById(R.id.volumeDown), NecEncoder.VOLUME_DOWN)
        hold(findViewById(R.id.volumeUp), NecEncoder.VOLUME_UP)

        wireCycle(R.id.inputOptical, 0, inputs, NecEncoder.INPUT) { inputIndex = it }
        wireCycle(R.id.inputCoax, 1, inputs, NecEncoder.INPUT) { inputIndex = it }
        wireCycle(R.id.inputDirect, 2, inputs, NecEncoder.INPUT) { inputIndex = it }
        wireCycle(R.id.inputAux, 3, inputs, NecEncoder.INPUT) { inputIndex = it }
        wireCycle(R.id.effectStereo, 0, effects, NecEncoder.EFFECT) { effectIndex = it }
        wireCycle(R.id.effectStereo2, 1, effects, NecEncoder.EFFECT) { effectIndex = it }
        wireCycle(R.id.effectMovie, 2, effects, NecEncoder.EFFECT) { effectIndex = it }
        wireCycle(R.id.effectMusic, 3, effects, NecEncoder.EFFECT) { effectIndex = it }
        wireCycle(R.id.levelSub, 1, levels, NecEncoder.LEVEL) { levelIndex = it }
        wireCycle(R.id.levelCenter, 2, levels, NecEncoder.LEVEL) { levelIndex = it }
        wireCycle(R.id.levelSurround, 3, levels, NecEncoder.LEVEL) { levelIndex = it }

        render()
        if (!blaster.hasEmitter()) showMissingHardware()
    }

    override fun onDestroy() {
        blaster.shutdown()
        super.onDestroy()
    }

    private fun showMissingHardware() {
        val banner = findViewById<TextView>(R.id.hardware)
        banner.visibility = View.VISIBLE
        banner.text = "IR Hardware not detected or blocked"
        MaterialAlertDialogBuilder(this)
            .setTitle("IR Hardware not detected or blocked")
            .setMessage("ConsumerIrManager.hasIrEmitter() returned false. NEC frames are still built, but this phone cannot transmit them.")
            .setPositiveButton("OK", null)
            .show()
    }

    private fun click(view: View) {
        view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    }

    private fun hold(view: View, code: Int) {
        view.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    view.isPressed = true
                    click(view)
                    blaster.startRepeat(code)
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    view.isPressed = false
                    blaster.stopRepeat()
                    view.performClick()
                    true
                }
                else -> false
            }
        }
    }

    private fun wireCycle(
        id: Int,
        target: Int,
        labels: Array<String>,
        code: Int,
        commit: (Int) -> Unit,
    ) {
        findViewById<Button>(id).setOnClickListener { view ->
            click(view)
            val current = when (labels) {
                inputs -> inputIndex
                effects -> effectIndex
                else -> levelIndex
            }
            val steps = (target - current + labels.size) % labels.size
            if (steps == 0) return@setOnClickListener
            repeat(steps) { step ->
                view.postDelayed({ blaster.transmit(code) }, step * NecEncoder.REPEAT_MS)
            }
            commit(target)
            render()
        }
    }

    private fun render() {
        status.text = if (!power) {
            "Standby"
        } else {
            "${inputs[inputIndex]} · ${effects[effectIndex]} · ${levels[levelIndex]}"
        }
    }
}
