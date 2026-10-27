#!/usr/bin/env python3
"""Render the battle BGM "Glass Cascade" from scratch (original composition).

Run: python3 tools/make-bgm.py OUT.wav   (needs numpy; deterministic output)
Then encode, as the shipped files are:
  ffmpeg -i OUT.wav -c:a libopus -b:a 96k public/assets/6ball-battle-bgm.ogg
  ffmpeg -i OUT.wav -c:a aac -b:a 128k -movflags +faststart public/assets/6ball-battle-bgm.m4a

Everything here is written for this game: the melodies, the arrangement and
every sound (additive synthesis, synthesised drums, a generated reverb). It
keeps only general traits of the previous track: 160 BPM, 4/4, C major, an
upbeat puzzle-game mood. The piece is 120 bars (3 minutes) and loops
seamlessly (the reverb and echo tails wrap round to the start).
"""
import sys
import numpy as np

SR = 44100
BPM = 160
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(6)

NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def midi(name):
    """'G#5' -> 80."""
    return 12 * (int(name[-1]) + 1) + NOTE[name[:-1]]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- harmony
CHORDS = {  # root, chord tones (midi, around octave 4)
    "C": ("C", ["C4", "E4", "G4"]), "G/B": ("B", ["B3", "D4", "G4"]), "G": ("G", ["G3", "B3", "D4"]),
    "Am": ("A", ["A3", "C4", "E4"]), "F": ("F", ["F3", "A3", "C4"]), "Em": ("E", ["E3", "G3", "B3"]),
    "Dm": ("D", ["D4", "F4", "A4"]), "E": ("E", ["E3", "G#3", "B3"]),
}


def chord_notes(name):
    root, tones = CHORDS[name]
    return midi(root + "2"), [midi(t) for t in tones]


# ---------------------------------------------------------------- melodies
# One string per bar: NOTE:beats or r:beats, summing to 4.
MEL_A = [
    "G4:.5 C5:.5 E5:1 D5:.5 C5:.5 G5:1", "F5:.5 E5:.5 D5:1 B4:1 G4:1",
    "A4:.5 C5:.5 E5:1 A5:1 G5:.5 E5:.5", "F5:1.5 E5:.5 C5:1 r:1",
    "G4:.5 C5:.5 E5:1 G5:.5 A5:.5 G5:1", "D5:.5 E5:.5 F5:1 G5:1 D5:1",
    "E5:.5 F5:.5 E5:.5 D5:.5 C5:1 A4:1", "F4:.5 A4:.5 C5:.5 D5:.5 B4:1 r:1",
]
MEL_B = [
    "A5:1 G5:.5 F5:.5 E5:1 C5:1", "D5:.5 E5:.5 F5:.5 G5:.5 B5:1.5 r:.5",
    "G5:1 E5:.5 B4:.5 E5:1 G5:1", "A5:2 E5:1 C5:1",
    "F5:.5 G5:.5 A5:1 C6:1 A5:1", "G5:1 F5:.5 E5:.5 D5:1 B4:1",
    "C5:.5 E5:.5 G5:.5 C6:.5 B5:.5 G5:.5 E5:1", "D5:1 C5:1 r:2",
]
MEL_BR = [
    "F5:1 E5:.5 D5:.5 A4:2", "B4:.5 C5:.5 D5:1 G4:2",
    "E5:1 D5:.5 C5:.5 G4:2", "A4:.5 B4:.5 C5:1 E5:2",
    "F5:1 A5:1 G5:.5 F5:.5 D5:1", "G5:1 B5:1 A5:.5 G5:.5 D5:1",
    "G#5:1 E5:1 B4:1 G#4:1", "A4:2 B4:1 D5:1",
]
MEL_C = [
    "E5:.5 A5:.5 B5:.5 C6:.5 B5:1 A5:1", "A5:.5 G5:.5 F5:1 C5:1 F5:1",
    "G5:1.5 E5:.5 C5:1 E5:1", "D5:.5 E5:.5 G5:1 B5:1 D6:1",
    "C6:1 B5:.5 A5:.5 E5:1 A5:1", "F5:.5 G5:.5 A5:.5 F5:.5 C5:1 A4:1",
    "G4:.5 C5:.5 E5:.5 G5:.5 E5:1 C5:1", "D5:2 B4:1 G4:1",
]
PROG = {
    "A": ["C", "G/B", "Am", "F", "C", "G/B", "Am", ["F", "G"]],
    "B": ["F", "G", "Em", "Am", "F", "G", "C", "C"],
    "BR": ["Dm", "G", "C", "Am", "Dm", "G", "E", ["Am", "G"]],
    "C": ["Am", "F", "C", "G", "Am", "F", "C", "G"],
    "IN": ["C", "G/B", "Am", "F"],
    "TURN": ["F", "G", "Am", "G"],
}
# section, melody, variation, drums
FORM = [
    ("IN", None, 0, "intro"), ("A", MEL_A, 0, "full"), ("A", MEL_A, 1, "full"),
    ("B", MEL_B, 0, "full"), ("B", MEL_B, 2, "full"), ("BR", MEL_BR, 0, "half"),
    ("C", MEL_C, 0, "full"), ("C", MEL_C, 2, "full"), ("C", None, 0, "none"),
    ("A", None, 0, "build"), ("A", MEL_A, 0, "full"), ("A", MEL_A, 1, "full"),
    ("B", MEL_B, 0, "full"), ("B", MEL_B, 2, "full"), ("BR", MEL_BR, 2, "half"),
    ("TURN", None, 0, "fill"),
]
SCALE = [0, 2, 4, 5, 7, 9, 11]


def third_below(m):
    """Diatonic third below in C major (G#/C# kept chromatic)."""
    pc = m % 12
    if pc not in SCALE:
        return m - 4
    i = SCALE.index(pc)
    j = (i - 2) % 7
    return m - ((pc - SCALE[j]) % 12)


def parse_bar(s):
    t, out = 0.0, []
    for tok in s.split():
        n, d = tok.split(":")
        d = float(d)
        if n != "r":
            out.append((t, d, midi(n)))
        t += d
    assert abs(t - 4) < 1e-9, s
    return out


# ---------------------------------------------------------------- sounds
def env(n, a, d, s, r_len):
    """ADSR over n samples (release is the last r_len samples)."""
    e = np.ones(n)
    a, d, r_len = int(a * SR), int(d * SR), int(r_len * SR)
    a = max(1, min(a, n))
    e[:a] = np.linspace(0, 1, a)
    if d > 0 and a < n:
        k = min(d, n - a)
        e[a:a + k] = 1 - (1 - s) * (1 - np.exp(-5 * np.arange(k) / d))
        e[a + k:] = e[a + k - 1] if a + k > 0 else s
    if r_len > 0:
        r_len = min(r_len, n)
        e[n - r_len:] *= np.linspace(1, 0, r_len) ** 2
    return e


def additive(freq, n, harmonics, vib=0.0, vib_delay=0.15):
    """Band-limited tone: harmonics is a list of (n, amplitude)."""
    t = np.arange(n) / SR
    f = np.full(n, freq)
    if vib:
        depth = vib * np.clip((t - vib_delay) / 0.2, 0, 1)
        f = f * (1 + depth * np.sin(2 * np.pi * 5.5 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    out = np.zeros(n)
    for k, a in harmonics:
        if freq * k < SR / 2.2:
            out += a * np.sin(k * ph)
    return out


SAW = [(k, 1 / k) for k in range(1, 40)]
SQUARE = [(k, 1 / k) for k in range(1, 40, 2)]
_cache = {}


def lead_tone(m, dur):
    key = ("lead", m, round(dur, 4))
    if key not in _cache:
        n = int((dur * 0.92 + 0.06) * SR)
        f = hz(m)
        tone = 0.55 * additive(f, n, [(k, a * 0.95 ** k) for k, a in SQUARE], vib=0.006)
        tone += 0.35 * additive(f, n, [(1, 1), (2, 0.35), (3, 0.12)], vib=0.006)
        tone += 0.10 * additive(2 * f, n, [(1, 1)])
        _cache[key] = tone * env(n, 0.006, 0.18, 0.72, 0.06)
    return _cache[key]


def pluck(m):
    key = ("pluck", m)
    if key not in _cache:
        n = int(0.22 * SR)
        t = np.arange(n) / SR
        bright = [(k, a * np.exp(-0.1 * k)) for k, a in SAW[:24]]
        _cache[key] = additive(hz(m), n, bright) * np.exp(-t / 0.07)
    return _cache[key]


def bass_tone(m, dur):
    key = ("bass", m, round(dur, 4))
    if key not in _cache:
        n = int(dur * 0.85 * SR)
        f = hz(m)
        tone = additive(f, n, [(k, a * 0.8 ** k) for k, a in SAW[:14]]) + 0.6 * np.sin(2 * np.pi * f * np.arange(n) / SR)
        _cache[key] = tone * env(n, 0.004, 0.12, 0.6, 0.03)
    return _cache[key]


def pad_chord(ms, dur, detune):
    n = int((dur + 0.4) * SR)
    out = np.zeros(n)
    for m in ms:
        for c in (-detune, detune):
            f = hz(m) * 2 ** (c / 1200)
            out += additive(f, n, [(k, a * 0.7 ** k) for k, a in SAW[:10]])
    return out * env(n, 0.25, 0.5, 0.8, 0.4) / len(ms)


def noise_band(n, lo, hi, seed):
    x = np.random.default_rng(seed).standard_normal(n)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, n)


def kick():
    n = int(0.32 * SR)
    t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t / 0.04)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    click = noise_band(n, 1500, 6000, 1) * np.exp(-t / 0.004) * 0.15
    return body + click


def snare():
    n = int(0.2 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.5
    sn = noise_band(n, 1200, 9000, 2)
    sn = sn / np.abs(sn).max() * np.exp(-t / 0.07)
    return tone + sn * 0.8


def hat(open_=False):
    n = int((0.2 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    x = noise_band(n, 7000, 16000, 3 if open_ else 4)
    return x / np.abs(x).max() * np.exp(-t / (0.08 if open_ else 0.012))


KICK, SNARE, HAT, OHAT = kick(), snare(), hat(), hat(True)


# ---------------------------------------------------------------- arrange
def place(buf, at, sig, gain=1.0, pan=0.0):
    i = int(round(at * SR))
    j = min(len(buf), i + len(sig))
    if j <= i:
        return
    left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:j, 0] += sig[: j - i] * gain * left * 1.4142
    buf[i:j, 1] += sig[: j - i] * gain * right * 1.4142


def render():
    bars = sum(len(PROG[s]) for s, *_ in FORM)
    length = bars * BAR
    tail = 3.0
    n = int((length + tail) * SR)
    lead, arp, pad, bass, drums, send = (np.zeros((n, 2)) for _ in range(6))
    bar = 0
    for sec, mel, var, drum in FORM:
        prog = PROG[sec]
        nb = len(prog)
        for b in range(nb):
            t0 = (bar + b) * BAR
            names = prog[b] if isinstance(prog[b], list) else [prog[b]]
            half = 4 / len(names)
            last_bar = b == nb - 1
            for ci, name in enumerate(names):
                root, tones = chord_notes(name)
                ct = t0 + ci * half * BEAT
                # pad
                if drum != "intro" or b >= 2:
                    pc = pad_chord(tones, half * BEAT, 8)
                    g = 0.10 if drum != "none" else 0.16
                    place(pad, ct, pc, g, -0.3)
                    place(pad, ct, pad_chord(tones, half * BEAT, -6), g, 0.3)
                # arpeggio: chord tones up an octave, 16ths
                seq = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[0] + 24]
                for k in range(int(half * 4)):
                    m = seq[[0, 1, 2, 3, 2, 1][k % 6] if var == 2 else k % 4]
                    acc = 1.0 if k % 4 == 0 else 0.7
                    place(arp, ct + k * BEAT / 4, pluck(m), 0.11 * acc, -0.45 if k % 2 else 0.45)
                # bass: eighth notes, octave bounce
                if drum not in ("none",) and not (drum == "intro" and b < 2):
                    for k in range(int(half * 2)):
                        m = root + (12 if k % 4 == 2 else 0)
                        place(bass, ct + k * BEAT / 2, bass_tone(m, BEAT / 2), 0.32)
            # melody
            if mel is not None:
                for st, d, m in parse_bar(mel[b]):
                    at = t0 + st * BEAT
                    if var == 2:
                        m2 = m + 12 if m < midi("A5") else m
                        place(lead, at, lead_tone(m2, d * BEAT), 0.07, 0.25)
                    place(lead, at, lead_tone(m, d * BEAT), 0.17)
                    if var == 1:
                        place(lead, at, lead_tone(third_below(m), d * BEAT), 0.08, -0.25)
            # drums
            for k in range(8):
                at = t0 + k * BEAT / 2
                if drum in ("full", "half", "fill", "intro", "build"):
                    if drum == "build" and b < 4:
                        pass
                    else:
                        open_ = k % 2 == 1 and k in (3, 7) and drum == "full"
                        place(drums, at, OHAT if open_ else HAT, 0.17 if k % 2 else 0.24, 0.3)
                if drum in ("full", "fill") or (drum == "build" and b >= 2) or (drum == "intro" and b >= 2):
                    if k in (0, 3, 4) or (drum == "full" and k == 7 and b % 2 == 1):
                        place(drums, at, KICK, 0.55)
                    if k in (2, 6):
                        place(drums, at, SNARE, 0.30, -0.05)
                        place(send, at, SNARE, 0.10)
                if drum == "half":
                    if k == 0 or (k == 5 and b % 2):
                        place(drums, at, KICK, 0.55)
                    if k == 4:
                        place(drums, at, SNARE, 0.32, -0.05)
                        place(send, at, SNARE, 0.12)
            # rolls into the next section
            if drum == "build" and b >= 6:
                steps = 8 if b == 6 else 16
                for k in range(steps):
                    g = 0.10 + 0.25 * (((b - 6) * steps + k) / (2 * steps))
                    place(drums, t0 + k * BAR / steps, SNARE, g, -0.05)
            if drum in ("fill", "half", "full") and last_bar and drum != "half":
                for k in range(4):
                    place(drums, t0 + 3 * BEAT + k * BEAT / 4, SNARE, 0.16 + 0.04 * k, -0.05)
            if b == 0 and bar > 0:
                place(send, t0, OHAT, 0.15)
        bar += nb

    # Echo on the lead (dotted eighth, ping-pong), reverb on lead/pad/snare.
    d = int(0.75 * BEAT * SR)
    echo = np.zeros_like(lead)
    src = lead.copy()
    for k in range(1, 5):
        g = 0.32 ** k
        side = 0 if k % 2 else 1
        echo[d * k:, side] += src[: n - d * k].mean(1) * g
    wet_in = (lead + echo) * 0.35 + pad * 0.5 + send + arp * 0.15
    ir_n = int(1.6 * SR)
    t = np.arange(ir_n) / SR
    rev = np.zeros_like(wet_in)
    size = 1 << int(np.ceil(np.log2(n + ir_n)))
    for ch in range(2):
        ir = np.random.default_rng(10 + ch).standard_normal(ir_n) * np.exp(-t / 0.42)
        ir[: int(0.012 * SR)] = 0
        ir /= np.sqrt((ir ** 2).sum())
        rev[:, ch] = np.fft.irfft(np.fft.rfft(wet_in[:, ch], size) * np.fft.rfft(ir, size), size)[:n]
    mix = lead + echo * 0.6 + arp + pad + bass + drums + rev * 0.28

    # Seamless loop: the tails past the end wrap round to the start.
    L = int(length * SR)
    mix[: n - L] += mix[L:]
    mix = mix[:L]
    # Master: gentle saturation, then level close to the previous track.
    mix -= mix.mean(0)
    mix = np.tanh(mix * 1.1) / 1.1
    rms = np.sqrt((mix ** 2).mean())
    mix *= 10 ** (-15 / 20) / rms
    peak = np.abs(mix).max()
    if peak > 0.97:
        mix = np.tanh(mix / 0.97) * 0.97
    return mix


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "bgm.wav"
    x = render()
    write_wav(out, x)
    print("wrote", out, f"{len(x) / SR:.1f} s")
