function fixIllegalDuration(chord, nextChord, unitTime, keyLength, duration) {
  const error = keyLength.error;
  if (error != 0) {
    let abcString = "";
    if (keyLength.numerator / keyLength.denominator > 1) {
      const base = 60;
      const startTick = chord[0].startTick;
      const endTick = chord[0].endTick;
      const newDuration = base * keyLength.numerator / keyLength.denominator /
        unitTime;
      const t = chord[0].startTick + newDuration;
      for (let i = 0; i < chord.length; i++) {
        chord[i].startTick = t;
      }
      const abc2 = chordToString(chord, nextChord, unitTime);
      for (let i = 0; i < chord.length; i++) {
        chord[i].startTick = startTick;
        chord[i].endTick = t;
      }
      if (abc2 == "") {
        for (let i = 0; i < chord.length; i++) chord[i].tie = false;
      } else {
        for (let i = 0; i < chord.length; i++) chord[i].tie = true;
      }
      const abc1 = chordToString(chord, null, unitTime);
      for (let i = 0; i < chord.length; i++) {
        chord[i].endTick = endTick;
      }
      duration = round(duration, 1e6);
      console.log(
        `illegal duration is rounded: ${duration}, ${error}, ${abcString}`,
      );
      return abc1 + abc2;
    } else if (nextChord) {
      const diff = error / unitTime;
      if (chord[0].endTick == nextChord[0].startTick) {
        for (let i = 0; i < nextChord.length; i++) {
          nextChord[i].startTick -= diff;
        }
      }
      for (let i = 0; i < chord.length; i++) {
        chord[i].endTick -= diff;
      }
      abcString += chordToString(chord, nextChord, unitTime);
      duration = round(duration, 1e6);
      console.log(
        `illegal duration is rounded: ${duration}, ${error}, ${abcString}`,
      );
      return abcString;
    }
  }
}

function getTupletString(len1, keyLength) {
  if (tupletCount == 0 && keyLength.factor != 0) {
    tupletNum = keyLength.denominator;
    tupletCount += 1;
    return len1;
  } else if (tupletCount < tupletNum) {
    tupletCount += 1;
    if (tupletCount == tupletNum) {
      tupletCount = 0;
      tupletNum = 0;
    }
    return "";
  } else {
    return "";
  }
}

function noteToString(chord, nextChord, unitTime) {
  const note = chord[0];
  const keyString = noteToKeyString(note);
  const duration = (note.endTick - note.startTick) * unitTime;
  const keyLength = approximateKeyLength(duration);
  if (keyLength.numerator == 0) return "";
  const abc = fixIllegalDuration(
    chord,
    nextChord,
    unitTime,
    keyLength,
    duration,
  );
  if (abc) return abc;
  const [len1, len2] = calcKeyLength(keyLength);
  const tie = (note.tie) ? "-" : "";
  const tupletString = getTupletString(len1, keyLength);
  return tupletString + keyString + len2 + tie;
}

function chordToString(chord, nextChord, unitTime) {
  if (chord.length == 1 && !chord[0].splitted) {
    return noteToString(chord, nextChord, unitTime);
  } else {
    let str = "";
    for (let i = 0; i < chord.length; i++) {
      const note = chord[i];
      const tie = (note.tie) ? "-" : "";
      str += noteToKeyString(note) + tie;
    }
    const n = chord[0];
    const duration = (n.endTick - n.startTick) * unitTime;
    const keyLength = approximateKeyLength(duration);
    if (keyLength.numerator == 0) return "";
    const abc = fixIllegalDuration(
      chord,
      nextChord,
      unitTime,
      keyLength,
      duration,
    );
    if (abc) return abc;
    const [len1, len2] = calcKeyLength(keyLength);
    const tupletString = getTupletString(len1, keyLength);
    return tupletString + `[${str}]` + len2;
  }
}

function noteToKeyString(note) {
  const pitch = note.pitch;
  const doremi = [
    "C",
    "^C",
    "D",
    "^D",
    "E",
    "F",
    "^F",
    "G",
    "^G",
    "A",
    "^A",
    "B",
  ];
  const baseline = pitch - 60;
  const key = baseline % 12;
  const height = Math.floor(baseline / 12);
  if (height >= 1) {
    const count = height - 1;
    let keyString = doremi.at(key).toLowerCase();
    for (let i = 0; i < count; i++) {
      keyString += "'";
    }
    return keyString;
  } else {
    const count = -height;
    let keyString = doremi.at(key);
    for (let i = 0; i < count; i++) {
      keyString += ",";
    }
    return keyString;
  }
}

function cleanupTimeSignatures(timeSignatures) {
  const map = new Map();
  for (let i = 0; i < timeSignatures.length; i++) {
    map.set(timeSignatures[i].tick, timeSignatures[i]);
  }
  const values = Array.from(map.values());
  const result = [];
  for (let i = 0; i < values.length; i++) {
    result.push(values[i]);
  }
  return result;
}

function cleanupTempos(tempos, totalTicks) {
  const map = new Map();
  for (let i = 0; i < tempos.length; i++) {
    map.set(tempos[i].tick, tempos[i].qpm);
  }
  const entries = Array.from(map.entries());
  const result = [];
  for (let i = 0; i < entries.length; i++) {
    const [tick, qpm] = entries[i];
    result.push({ tick: tick, qpm: qpm, tickTo: totalTicks });
  }
  if (result.length != 1) {
    for (let i = 0; i < result.length - 1; i++) {
      result[i].tickTo = result[i + 1].tick;
    }
    result[result.length - 1].tickTo = totalTicks;
  }
  return result;
}

function splitTempos(notes, tempos, totalTicks) {
  const result = [];
  const cleanedTempos = cleanupTempos(tempos, totalTicks);
  if (cleanedTempos.length == 1) {
    return [[notes, cleanedTempos[0]]];
  }
  for (let i = 0; i < cleanedTempos.length; i++) {
    const tempo = cleanedTempos[i];
    const tFrom = tempo.tick;
    const tTo = tempo.tickTo;
    const filtered = [];
    for (let j = 0; j < notes.length; j++) {
      if (notes[j].startTick < tTo && tFrom <= notes[j].startTick) {
        filtered.push(notes[j]);
      }
    }
    result.push([filtered, cleanedTempos[i]]);
  }
  return result;
}

function splitInstruments(notes) {
  let instrument = 0;
  let pos = 0;
  const result = [];
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].instrument != instrument) {
      result.push(notes.slice(pos, i));
      instrument += 1;
      pos = i;
    }
  }
  result.push(notes.slice(pos));
  return result;
}

class KeyLength {
  constructor(numerator, denominator, factor, error) {
    this.numerator = numerator;
    this.denominator = denominator;
    this.factor = factor;
    this.error = error;
  }
}

function calcKeyLength(keyLength) {
  const n = keyLength.numerator;
  const d = keyLength.denominator;
  const f = keyLength.factor;
  if (n == 0) return [null, null];
  if (d == 1) {
    if (n == 1) return ["", ""];
    return ["", `${n}`];
  }
  if (f == 0) {
    if (n == 1) return ["", `/${d}`];
    return ["", `${n}/${d}`];
  }
  if (f > 0) {
    if (f == 1) return [`(${d}:${n}`, ""];
    return [`(${d}:${n}`, `/${f}`];
  } else {
    return [`(${d}:${n}`, `${-f}`];
  }
}

function approximateKeyLength(duration) {
  const base = 60;
  duration = Math.round(duration * 1e6) / 1e6;
  if (duration == base) return new KeyLength(1, 1, 0, 0);
  if (duration <= 0) {
    console.error(`duration is negative: ${duration}`);
    return new KeyLength(0, 0, 0, duration);
  }
  if (duration * 8 < base) {
    // abc.js does not support duration less than z/8.
    console.log(`duration (less than z/8) is ignored: ${duration}`);
    return new KeyLength(0, 0, 0, duration);
  }
  let n = 2;
  if (duration > base) {
    // normal note
    while (duration / n > base) n *= 2;
    if (duration / n == base) return new KeyLength(n, 1, 0, 0);
    // dotted note
    n /= 2;
    let nearestDiff = duration / n - base;
    let nearestNumerator = n;
    let nearestDenominator = 1;
    for (let p = 2; p <= 16; p *= 2) {
      const q = 2 * p - 1;
      const k = n * q / p;
      const diff = round(duration / k, 1e6) - base;
      if (diff == 0) {
        if (k == Math.round(k)) {
          return new KeyLength(k, 1, 0, 0);
        } else {
          return new KeyLength(n * q, p, 0, 0);
        }
      } else if (0 < diff && diff < nearestDiff) {
        nearestDiff = diff;
        nearestNumerator = n * q;
        nearestDenominator = p;
      }
    }
    // tuplet
    // - prime numbers only (consider speed)
    // - max denominator is 9 (limitation of abc.js)
    n *= 2;
    for (; n >= 1; n /= 2) {
      const primes1 = [3, 5, 7];
      for (let p = 0; p < primes1.length; p++) {
        const i = primes1[p];
        for (let j = 1; j <= i - 1; j++) {
          if (duration / n * i / j == base) {
            return new KeyLength(j, i, -n, 0);
          }
        }
      }
    }
    const diff = duration - base * nearestNumerator / nearestDenominator;
    return new KeyLength(nearestNumerator, nearestDenominator, 0, diff);
  } else {
    // normal note
    while (duration * n < base) n *= 2;
    if (duration * n == base) return new KeyLength(1, n, 0, 0);
    // dotted note
    let nearestDiff = duration * n - base;
    let nearestNumerator = 1;
    let nearestDenominator = n;
    for (let p = 2; p <= 16; p *= 2) {
      const q = 2 * p - 1;
      const k = q / (n * p);
      const diff = Math.abs(round(duration / k, 1e6) - base);
      if (diff == 0) {
        if (k == Math.round(k)) {
          return new KeyLength(k, 1, 0, 0);
        } else {
          return new KeyLength(q, n * p, 0, 0);
        }
      } else if (diff < nearestDiff) {
        nearestDiff = diff;
        nearestNumerator = q;
        nearestDenominator = n * p;
      }
    }
    // tuplet
    // - prime numbers only (consider speed)
    // - max denominator is 9 (limitation of abc.js)
    for (; n >= 1; n /= 2) {
      const primes2 = [3, 5, 7];
      for (let p = 0; p < primes2.length; p++) {
        const i = primes2[p];
        for (let j = 1; j <= i - 1; j++) {
          if (duration * n * i / j == base) {
            return new KeyLength(j, i, n, 0);
          }
        }
      }
    }
    const diff = duration - base * nearestNumerator / nearestDenominator;
    return new KeyLength(nearestNumerator, nearestDenominator, 0, diff);
  }
}

function splitRestDurtion(duration) {
  const base = 60;
  duration = Math.round(duration * 1e6) / 1e6;
  if (duration <= base) return [duration];
  const result = [];
  while (duration > 60) {
    let n = 2;
    while (duration / n > base) n *= 2;
    if (duration / n == base) {
      result.push(duration);
      return result;
    } else {
      const rest = n * 30;
      result.push(rest);
      duration -= rest;
    }
  }
  result.push(duration);
  return result;
}

function durationToRestString(startTick, endTick, unitTime) {
  if (startTick < endTick) {
    const duration = (endTick - startTick) * unitTime;
    let abc = "";
    const durations = splitRestDurtion(duration);
    for (let i = 0; i < durations.length; i++) {
      const keyLength = approximateKeyLength(durations[i]);
      const [len1, len2] = calcKeyLength(keyLength);
      if (len2 == null) continue;
      const tupletString = getTupletString(len1, keyLength);
      abc += tupletString + "z" + len2;
    }
    return abc;
  } else {
    return "";
  }
}

function guessClef(ins) {
  let total = 0;
  for (let i = 0; i < ins.length; i++) {
    total += ins[i].pitch;
  }
  const pitch = total / ins.length;
  if (pitch > 64) {
    return "G2";
  } else {
    return "F4";
  }
}

function cleanupTicks(ns) {
  let min = Infinity;
  for (let i = 0; i < ns.notes.length; i++) {
    if (ns.notes[i].startTick < min) min = ns.notes[i].startTick;
  }
  if (min != 0) {
    for (let i = 0; i < ns.notes.length; i++) {
      ns.notes[i].startTick -= min;
      ns.notes[i].endTick -= min;
    }
    for (let i = 0; i < ns.tempos.length; i++) {
      if (0 < ns.tempos[i].tick) ns.tempos[i].tick -= min;
    }
    ns.totalTicks -= min;
  }
  return ns;
}

function round(x, epsilon) {
  return Math.round(x * epsilon) / epsilon;
}

function chordToTieString(chord, nextChord, unitTime, sectionLength, tempo) {
  let abcString = "";
  const endTick = chord[0].endTick;
  for (let i = 0; i < chord.length; i++) chord[i].endTick = sectionEnd;
  if (round(sectionEnd, 1e13) == round(endTick, 1e13)) {
    for (let i = 0; i < chord.length; i++) chord[i].tie = false;
    abcString += chordToString(chord, nextChord, unitTime);
    abcString += "|";
    if (section % 4 == 0) abcString += "\n";
    section += 1;
    sectionEnd = tempo.tick + section * sectionLength;
    return abcString;
  } else {
    for (let i = 0; i < chord.length; i++) chord[i].tie = true;
    abcString += chordToString(chord, nextChord, unitTime);
    abcString += "|";
    const count = Math.floor((endTick - chord[0].startTick) / sectionLength);
    if (section % 4 == 0) abcString += "\n";
    for (let i = 1; i < count; i++) {
      const nextSection = section + 1;
      const nextSectionEnd = tempo.tick + nextSection * sectionLength;
      for (let j = 0; j < chord.length; j++) {
        chord[j].startTick = sectionEnd;
        chord[j].endTick = nextSectionEnd;
      }
      if (round(nextSectionEnd, 1e13) == round(endTick, 1e13)) {
        for (let j = 0; j < chord.length; j++) chord[j].tie = false;
        abcString += chordToString(chord, nextChord, unitTime);
        abcString += "|";
        if (nextSection % 4 == 0) abcString += "\n";
        section = nextSection;
        sectionEnd = nextSectionEnd;
        return abcString;
      } else {
        for (let j = 0; j < chord.length; j++) chord[j].tie = true;
        abcString += chordToString(chord, nextChord, unitTime);
        abcString += "|";
        if (nextSection % 4 == 0) abcString += "\n";
        section = nextSection;
        sectionEnd = nextSectionEnd;
      }
    }
    for (let i = 0; i < chord.length; i++) {
      chord[i].startTick = sectionEnd;
      chord[i].endTick = endTick;
      chord[i].tie = false;
    }
    abcString += chordToString(chord, nextChord, unitTime);
    section += 1;
    sectionEnd = tempo.tick + section * sectionLength;
    return abcString;
  }
}

function durationToRestStrings(
  startTick,
  endTick,
  tempo,
  unitTime,
  sectionLength,
) {
  let abcString = "";
  if (round(sectionEnd, 1e13) <= round(endTick, 1e13)) {
    let prevSectionEnd = sectionEnd;
    if (round(startTick, 1e13) < round(sectionEnd, 1e13)) {
      abcString += durationToRestString(startTick, sectionEnd, unitTime);
      abcString += "|";
      if (section % 4 == 0) abcString += "\n";
      section += 1;
      sectionEnd = tempo.tick + section * sectionLength;
      const count = Math.floor((endTick - prevSectionEnd) / sectionLength);
      for (let i = 0; i < count; i++) {
        abcString += durationToRestString(prevSectionEnd, sectionEnd, unitTime);
        abcString += "|";
        if (section % 4 == 0) abcString += "\n";
        section += 1;
        prevSectionEnd = sectionEnd;
        sectionEnd = tempo.tick + section * sectionLength;
      }
      abcString += durationToRestString(prevSectionEnd, endTick, unitTime);
    } else {
      if (round(sectionEnd, 1e13) == round(startTick, 1e13)) {
        abcString += "|";
        if (section % 4 == 0) abcString += "\n";
        section += 1;
        sectionEnd = tempo.tick + section * sectionLength;
      }
      if (round(endTick, 1e13) < round(sectionEnd, 1e13)) {
        abcString += durationToRestString(startTick, endTick, unitTime);
      } else {
        abcString += durationToRestString(startTick, sectionEnd, unitTime);
        abcString += "|";
        if (section % 4 == 0) abcString += "\n";
        section += 1;
        prevSectionEnd = sectionEnd;
        sectionEnd = section * sectionLength;
        const count = Math.floor((endTick - prevSectionEnd) / sectionLength);
        for (let i = 0; i < count; i++) {
          abcString += durationToRestString(
            prevSectionEnd,
            sectionEnd,
            unitTime,
          );
          abcString += "|";
          if (section % 4 == 0) abcString += "\n";
          section += 1;
          prevSectionEnd = sectionEnd;
          sectionEnd = tempo.tick + section * sectionLength;
        }
        abcString += durationToRestString(prevSectionEnd, endTick, unitTime);
      }
    }
  } else if (round(startTick, 1e13) < round(endTick, 1e13)) {
    abcString += durationToRestString(startTick, endTick, unitTime);
  }
  return abcString;
}

function cloneNote(note) {
  return {
    instrument: note.instrument,
    program: note.program,
    startTick: note.startTick,
    endTick: note.endTick,
    pitch: note.pitch,
    velocity: note.pitch,
    isDrum: note.isDrum,
    // tie
    // splitted
  };
}

function getTargetPosition(ns, i) {
  const endTick = ns[i].endTick;
  i += 1;
  while (ns[i] && ns[i].startTick < endTick) {
    i += 1;
  }
  return i;
}

function getNotationBreaks(ns) {
  const set = new Set();
  for (let i = 0; i < ns.length; i++) {
    set.add(ns[i].startTick);
    set.add(ns[i].endTick);
  }
  const arr = [...set];
  arr.sort((a, b) => {
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  });
  return arr.slice(1);
}

function getChord(ns) {
  let i = 0;
  const result = [];
  while (ns[i]) {
    const j = getTargetPosition(ns, i);
    const target = ns.slice(i, j);
    const notationBreaks = getNotationBreaks(target);
    if (notationBreaks.length == 1) {
      result.push(target);
      i = j;
    } else {
      const endTick = ns[i].endTick;
      const targetBreaks = [];
      for (let k = 0; k < notationBreaks.length; k++) {
        if (notationBreaks[k] <= endTick) targetBreaks.push(notationBreaks[k]);
      }
      const chords = splitChord(target, targetBreaks);
      result.push(...chords);
      const nextTarget = [];
      for (let k = 0; k < target.length; k++) {
        const n = target[k];
        if (endTick < n.endTick) {
          const newNote = cloneNote(n);
          newNote.startTick = endTick;
          newNote.splitted = true;
          nextTarget.push(newNote);
        }
      }
      ns = ns.slice(j);
      ns.unshift(...nextTarget);
      i = 0;
    }
  }
  return result;
}

function splitChord(chord, endTicks) {
  const result = [];
  for (let i = 0; i < endTicks.length; i++) {
    const endTick = endTicks[i];
    if (i == 0) {
      const newChord = [];
      const startTick = chord[0].startTick;
      for (let j = 0; j < chord.length; j++) {
        const n = chord[j];
        if (n.startTick == startTick) {
          const newNote = cloneNote(n);
          newNote.endTick = endTick;
          newNote.splitted = true;
          if (endTick < n.endTick) {
            newNote.tie = true;
          }
          newChord.push(newNote);
        }
      }
      result.push(newChord);
    } else {
      const startTick = endTicks[i - 1];
      const newChord = [];
      for (let j = 0; j < chord.length; j++) {
        const n = chord[j];
        if (n.startTick <= startTick && endTick <= n.endTick) {
          const newNote = cloneNote(n);
          newNote.startTick = startTick;
          newNote.endTick = endTick;
          newNote.splitted = true;
          if (endTick < n.endTick) {
            newNote.tie = true;
          }
          newChord.push(newNote);
        }
      }
      result.push(newChord);
    }
  }
  for (let i = 0; i < result.length; i++) {
    result[i].sort((a, b) => {
      if (a.tie == b.tie) return 0;
      if (a.tie) return -1;
      return 1;
    });
  }
  return result;
}

function segmentToString(ns, ins, instrumentId, tempo) {
  if (ins.length == 0) return "";
  const timeSignatures = cleanupTimeSignatures(ns.timeSignatures);
  let timeSignature = timeSignatures.shift();
  const beat = timeSignature.numerator / timeSignature.denominator;
  const unitLength = (beat < 0.75) ? 2 : 4;
  // ABC note-length notation is tempo-independent (a quarter note is a
  // quarter note regardless of playback tempo), so these are derived only
  // from the MIDI file's ticksPerBeat, not from tempo.qpm. tempo.qpm is
  // used only for the printed Q: tempo marking, not for note durations.
  const unitTime = 60 * unitLength / ns.ticksPerBeat;
  const sectionLength = 4 * ns.ticksPerBeat * beat;
  let abcString = setInstrumentHeader(
    ins,
    instrumentId,
    unitLength,
    timeSignature,
  );
  section = 1;
  sectionEnd = tempo.tick + section * sectionLength;
  timeSignature = timeSignatures.shift();

  const chords = getChord(ins);
  for (let i = 0; i < chords.length; i++) {
    const chord = chords[i];
    // TODO: irregular meter
    // start point shifts with long notes
    // if (timeSignature && chord[0].startTick >= timeSignature.tick) {
    //   abcString += `\\\nM:${timeSignature.numerator}/${timeSignature.denominator}\n`;
    //   beat = timeSignature.numerator / timeSignature.denominator;
    //   sectionLength = 4 * ns.ticksPerBeat * beat;
    //   timeSignature = timeSignatures.shift();
    // }
    const nextChord = chords[i + 1];
    if (i == 0 && chord[0].startTick != tempo.tick) {
      abcString += durationToRestStrings(
        tempo.tick,
        chord[0].startTick,
        tempo,
        unitTime,
        sectionLength,
      );
    }
    if (round(sectionEnd, 1e13) < round(chord[0].endTick, 1e13)) {
      abcString += chordToTieString(
        chord,
        nextChord,
        unitTime,
        sectionLength,
        tempo,
      );
    } else {
      abcString += chordToString(chord, nextChord, unitTime);
    }
    if (nextChord) {
      abcString += durationToRestStrings(
        chord[0].endTick,
        nextChord[0].startTick,
        tempo,
        unitTime,
        sectionLength,
      );
    } else {
      abcString += durationToRestStrings(
        chord[0].endTick,
        tempo.tickTo,
        tempo,
        unitTime,
        sectionLength,
      );
      if (!abcString.endsWith("\n")) {
        abcString += "\n";
      }
    }
  }
  return abcString;
}

function setInstrumentHeader(ins, instrumentId, unitLength, timeSignature) {
  const numerator = timeSignature.numerator;
  const denominator = timeSignature.denominator;
  return `L:1/${4 * unitLength}
M:${numerator}/${denominator}
K:C clef=${guessClef(ins)}
V:${instrumentId + 1}
%%MIDI program ${ins[0].program}
`;
}

let tupletNum = 0;
let tupletCount = 0;
let section;
let sectionEnd;
export default function notesToAbc(ns, options) {
  let abcString = "X:1\n";
  if (options) {
    if (options.title) abcString += `T:${options.title}\n`;
    if (options.composer) abcString += `C:${options.composer}\n`;
  }
  cleanupTicks(ns);
  const tempoSegments = splitTempos(ns.notes, ns.tempos, ns.totalTicks);
  for (let i = 0; i < tempoSegments.length; i++) {
    const [tns, tempo] = tempoSegments[i];
    abcString += `Q:1/4=${Math.round(tempo.qpm)}\n`;
    const instrumentSegments = splitInstruments(tns);
    for (
      let instrumentId = 0;
      instrumentId < instrumentSegments.length;
      instrumentId++
    ) {
      section = 0;
      abcString += segmentToString(
        ns,
        instrumentSegments[instrumentId],
        instrumentId,
        tempo,
      );
    }
  }
  return abcString;
}
