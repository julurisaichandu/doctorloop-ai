# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "vexo-open[ble,serial] @ git+https://github.com/VexoAI-Org/vexo-open-kit@1e4291e2fa4896b1f603d3d4f0b009c483425da0#subdirectory=python",
# ]
# ///
"""Watch every signal a Vexo Open band sends, live in the terminal.

    uv run vexo-band/watch_band.py              list the bands advertising nearby
    uv run vexo-band/watch_band.py 42           watch band Vexo-HACK-42 over Bluetooth
    uv run vexo-band/watch_band.py 42 --usb     over a USB data cable (works while Bluetooth is taken)
    uv run vexo-band/watch_band.py --sim        a pretend band, no hardware

--mic adds microphone loudness and audio packets (the band's light goes solid blue).
--seconds N stops after N seconds. --tap-threshold G sets tap sensitivity (0.2..8 g, lower = lighter taps).

Double-tap the band first: its light blinks blue and it can be found for 60 seconds. It takes one
Bluetooth connection at a time, so close the dashboard or any other program using it. Settings made
here (which gestures, tap threshold) go back to the band's defaults when this program disconnects.
"""
import argparse
import asyncio
import threading
import time
from collections import Counter

from vexo_open import SERVICE_UUID
from vexo_open.sync import Band

GESTURES = ["tap", "double-tap", "free-fall", "tilt", "orientation", "motion"]
CONTINUOUS = ["motion", "activity", "battery", "temperature", "link", "mic-level", "audio"]
STATUS_EVERY = 2.0


def clock(when):
    when = when or time.time()
    return time.strftime("%H:%M:%S", time.localtime(when)) + f".{int(when % 1 * 1000):03d}"


def list_bands(seconds):
    from bleak import BleakScanner

    seen = set()

    def found(device, adv):
        if SERVICE_UUID not in (u.lower() for u in adv.service_uuids) or device.address in seen:
            return
        seen.add(device.address)
        maker = bytes(adv.manufacturer_data.get(0xFFFF, b""))
        number = int.from_bytes(maker[2:4], "little") if len(maker) >= 4 else "?"
        print(f"  band {number}  ({adv.local_name or device.name or 'name not received yet'})  signal {adv.rssi} dBm")

    async def scan():
        async with BleakScanner(found, service_uuids=[SERVICE_UUID]):
            await asyncio.sleep(seconds)

    print(f"Looking for Vexo bands for {seconds} s. Double-tap yours now (its light blinks blue).")
    asyncio.run(scan())
    if not seen:
        print("No band is advertising. Close anything connected to it (dashboard tab, another program or "
              "laptop), double-tap it, and run this again. Or plug it in and use --usb.")


def status(counts, before, latest):
    rate = lambda name: (counts[name] - before[name]) / STATUS_EVERY
    parts = []
    if m := latest.get("motion"):
        accel = f"accel {m.ax:+.2f} {m.ay:+.2f} {m.az:+.2f} g" if m.ax is not None else ""
        gyro = f"gyro {m.gx:+.0f} {m.gy:+.0f} {m.gz:+.0f} deg/s" if m.gx is not None else ""
        parts.append(f"motion {rate('motion'):.0f}/s {accel} {gyro}".strip())
    if a := latest.get("activity"):
        parts.append(f"{a.state}, {a.steps} steps total, {a.cadence} steps/min")
    if b := latest.get("battery"):
        parts.append(f"battery {b.percent}% {b.state}")
    if t := latest.get("temperature"):
        parts.append(f"chip {t.celsius:.1f} C")
    if link := latest.get("link"):
        parts.append(f"rssi {link.rssi} dBm {link.phy}")
    if mic := latest.get("mic-level"):
        parts.append(f"mic rms {mic.rms_db} dB below max (level {mic.level:.2f})")
    if counts["audio"]:
        parts.append(f"audio {rate('audio'):.0f} opus packets/s")
    return "  " + (" | ".join(parts) if parts else "no data yet")


def watch(args):
    transport = "sim" if args.sim else "serial" if args.usb else "ble"
    options = {"scan_seconds": 30} if transport == "ble" else {}
    if transport == "ble":
        print(f"Looking for band {args.number} for up to 30 s. Double-tap it now if its light is not blinking blue.")
    band = Band.connect(args.number, transport, auto_reconnect=True, **options)
    try:
        info = band.info
        print(f"Connected to {band.name} over {band.transport_kind}. Firmware {info.firmware}, "
              f"protocol {info.protocol}, hardware {info.hardware}, up {info.uptime_ms / 1000:.0f} s.")
        print(f"  Parts: {', '.join(info.capabilities)}. Features: {', '.join(info.features) or 'none (firmware 1.0)'}.")
        battery = band.get_battery()
        print(f"  Battery {battery.percent}% ({battery.state}, {battery.millivolts} mV).")
        mic = band.get_mic()
        print(f"  Mic: {mic.sample_rate} Hz, {mic.channels} channel, {mic.frame_ms} ms Opus frames, "
              f"bitrate {mic.bitrate}, gain {mic.gain_db:+g} dB.")
        limits = band.motion_limits()
        print(f"  Motion over {limits.transport}: up to {limits.both} Hz accel+gyro, {limits.accel} Hz accel alone.")
        if transport != "serial":
            radio = band.get_radio()
            print(f"  Radio: rssi {radio.rssi} dBm, tx {radio.tx_power} dBm, {radio.phy}, MTU {radio.mtu}.")
        events = band.set_events(kinds=GESTURES, tap_threshold=args.tap_threshold)
        print(f"  Gestures on: {', '.join(events.kinds)} (tap threshold {events.tap_threshold:g} g).")

        counts, latest = Counter(), {}

        def keep(name):
            def handler(msg):
                counts[name] += 1
                latest[name] = msg
            return handler

        def gesture(e):
            counts[e.kind] += 1
            detail = f" face {e.face} up" if e.get("face") else f" (arg {e.arg})" if e.arg else ""
            print(f"{clock(e.time)}  >>> {e.kind.upper()}{detail}")

        for name in CONTINUOUS:
            band.on(name, keep(name))
        band.on("event", gesture)
        band.on("notice", lambda n: print(f"{clock(n.time)}  notice: {n.kind} ({n.arg})"))
        for name in ("reconnecting", "reconnected", "disconnect", "stream-taken"):
            band.on(name, lambda msg, name=name: print(f"{clock(None)}  [{name}] {dict(msg)}"))

        streams = dict(events=True, motion=25, activity=True, battery=True, temperature=True)
        if transport != "serial":
            streams["link"] = True
        if args.mic:
            streams.update(mic_level=True, audio=True)
        band.configure(**streams)
        print("Tap the band. Ctrl+C to stop.\n")

        stop = threading.Event()

        def ticker():
            before = Counter()
            while not stop.wait(STATUS_EVERY):
                print(status(counts, before, latest))
                before = counts.copy()

        threading.Thread(target=ticker, daemon=True).start()
        started = time.monotonic()
        band.wait(args.seconds)
        stop.set()
        took = time.monotonic() - started
        print(f"\nIn {took:.0f} s: " + ", ".join(f"{name} {n}" for name, n in counts.most_common()))
    finally:
        band.disconnect()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("number", nargs="?", type=int, help="band number on the band's bag (42 = Vexo-HACK-42)")
    parser.add_argument("--usb", action="store_true", help="use the USB cable instead of Bluetooth")
    parser.add_argument("--sim", action="store_true", help="pretend band, no hardware")
    parser.add_argument("--mic", action="store_true", help="also stream mic loudness and audio packets")
    parser.add_argument("--seconds", type=float, help="stop after this many seconds (default: Ctrl+C)")
    parser.add_argument("--tap-threshold", type=float, help="tap sensitivity in g, 0.2..8 (lower = lighter taps)")
    args = parser.parse_args()
    if args.number is None and not (args.sim or args.usb):
        list_bands(20)
    else:
        watch(args)


if __name__ == "__main__":
    main()
