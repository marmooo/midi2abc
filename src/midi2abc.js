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
      chord.forEach((note) => {
        note.startTick = t;
      });
      const abc2 = chordToString(chord, nextChord, unitTime);
      chord.forEach((note) => {
        note.startTick = startTick;
        note.endTick = t;
      });
      if (abc2 == "") {
        chord.forEach((note) => note.tie = false);
      } else {
        chord.forEach((note) => note.tie = true);
      }
      const abc1 = chordToString(chord, null, unitTime);
      chord.forEach((note) => {
        note.endTick = endTick;
      });
      duration = round(duration, 1e6);
      console.log(
        `illegal duration is rounded: ${duration}, ${error}, ${abcString}`,
      );
      return abc1 + abc2;
    } else if (nextChord) {
      const diff = error / unitTime;
      if (chord[0].endTick == nextChord[0].startTick) {
        nextChord.forEach((n) => n.startTick -= diff);
      }
      chord.forEach((n) => n.endTick -= diff);
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
    const str = chord.map((note) => {
      const tie = (note.tie) ? "-" : "";
      return noteToKeyString(note) + tie;
    }).join("");
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
  timeSignatures.forEach((timeSignature) => {
    map.set(timeSignature.tick, timeSignature);
  });
  const result = [];
  for (const [_time, timeSignature] of map) {
    result.push(timeSignature);
  }
  return result;
}

function cleanupTempos(tempos, totalTicks) {
  const map = new Map();
  tempos.forEach((tempo) => {
    map.set(tempo.tick, tempo.qpm);
  });
  const result = [];
  for (const [tick, qpm] of map) {
    const tempo = { tick: tick, qpm: qpm, tickTo: totalTicks };
    result.push(tempo);
  }
  if (result.length != 1) {
    result.slice(0, -1).forEach((tempo, i) => {
      tempo.tickTo = result[i + 1].tick;
    });
    result.at(-1).tickTo = totalTicks;
  }
  return result;
}

function splitTempos(notes, tempos, totalTicks) {
  const result = [];
  const cleanedTempos = cleanupTempos(tempos, totalTicks);
  if (cleanedTempos.length == 1) {
    return [[notes, cleanedTempos[0]]];
  }
  cleanedTempos.forEach((tempo, i) => {
    const tFrom = tempo.tick;
    const tTo = tempo.tickTo;
    const filtered = notes
      .filter((n) => n.startTick < tTo)
      .filter((n) => tFrom <= n.startTick);
    result.push([filtered, cleanedTempos[i]]);
  });
  return result;
}

function splitInstruments(notes) {
  let instrument = 0;
  let pos = 0;
  const result = [];
  notes.forEach((n, i) => {
    if (n.instrument != instrument) {
      result.push(notes.slice(pos, i));
      instrument += 1;
      pos = i;
    }
  });
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
      for (const i of [3, 5, 7]) {
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
      for (const i of [3, 5, 7]) {
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
    splitRestDurtion(duration).forEach((d) => {
      const keyLength = approximateKeyLength(d);
      const [len1, len2] = calcKeyLength(keyLength);
      if (len2 == null) return "";
      const tupletString = getTupletString(len1, keyLength);
      abc += tupletString + "z" + len2;
    });
    return abc;
  } else {
    return "";
  }
}

function guessClef(ins) {
  const total = ins.reduce((sum, n) => {
    return sum + n.pitch;
  }, 0);
  const pitch = total / ins.length;
  if (pitch > 64) {
    return "G2";
  } else {
    return "F4";
  }
}

function cleanupTicks(ns) {
  let min = Infinity;
  ns.notes.forEach((n) => {
    const startTick = n.startTick;
    if (startTick < min) min = startTick;
  });
  if (min != 0) {
    ns.notes.forEach((n) => {
      n.startTick -= min;
      n.endTick -= min;
    });
    ns.tempos.forEach((tempo) => {
      if (0 < tempo.tick) tempo.tick -= min;
    });
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
  chord.forEach((note) => note.endTick = sectionEnd);
  if (round(sectionEnd, 1e13) == round(endTick, 1e13)) {
    chord.forEach((note) => note.tie = false);
    abcString += chordToString(chord, nextChord, unitTime);
    abcString += "|";
    if (section % 4 == 0) abcString += "\n";
    section += 1;
    sectionEnd = tempo.tick + section * sectionLength;
    return abcString;
  } else {
    chord.forEach((note) => note.tie = true);
    abcString += chordToString(chord, nextChord, unitTime);
    abcString += "|";
    const count = Math.floor((endTick - chord[0].startTick) / sectionLength);
    if (section % 4 == 0) abcString += "\n";
    for (let i = 1; i < count; i++) {
      const nextSection = section + 1;
      const nextSectionEnd = tempo.tick + nextSection * sectionLength;
      chord.forEach((note) => {
        note.startTick = sectionEnd;
        note.endTick = nextSectionEnd;
      });
      if (round(nextSectionEnd, 1e13) == round(endTick, 1e13)) {
        chord.forEach((note) => note.tie = false);
        abcString += chordToString(chord, nextChord, unitTime);
        abcString += "|";
        if (nextSection % 4 == 0) abcString += "\n";
        section = nextSection;
        sectionEnd = nextSectionEnd;
        return abcString;
      } else {
        chord.forEach((note) => note.tie = true);
        abcString += chordToString(chord, nextChord, unitTime);
        abcString += "|";
        if (nextSection % 4 == 0) abcString += "\n";
        section = nextSection;
        sectionEnd = nextSectionEnd;
      }
    }
    chord.forEach((note) => {
      note.startTick = sectionEnd;
      note.endTick = endTick;
      note.tie = false;
    });
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
  ns.forEach((n) => {
    set.add(n.startTick);
    set.add(n.endTick);
  });
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
      const targetBreaks = notationBreaks.filter((t) => t <= endTick);
      const chords = splitChord(target, targetBreaks);
      result.push(...chords);
      const nextTarget = target
        .filter((n) => endTick < n.endTick)
        .map((n) => {
          const newNote = cloneNote(n);
          newNote.startTick = endTick;
          newNote.splitted = true;
          return newNote;
        });
      ns = ns.slice(j);
      ns.unshift(...nextTarget);
      i = 0;
    }
  }
  return result;
}

function splitChord(chord, endTicks) {
  const result = [];
  endTicks.forEach((endTick, i) => {
    if (i == 0) {
      const newChord = [];
      const startTick = chord[0].startTick;
      chord.forEach((n) => {
        if (n.startTick == startTick) {
          const newNote = cloneNote(n);
          newNote.endTick = endTick;
          newNote.splitted = true;
          if (endTick < n.endTick) {
            newNote.tie = true;
          }
          newChord.push(newNote);
        }
      });
      result.push(newChord);
    } else {
      const startTick = endTicks[i - 1];
      const newChord = [];
      chord.forEach((n) => {
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
      });
      result.push(newChord);
    }
  });
  result.forEach((chord) => {
    chord.sort((a, b) => {
      if (a.tie == b.tie) return 0;
      if (a.tie) return -1;
      return 1;
    });
  });
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
  chords.forEach((chord, i) => {
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
  });
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
  splitTempos(ns.notes, ns.tempos, ns.totalTicks).forEach(([tns, tempo]) => {
    abcString += `Q:1/4=${Math.round(tempo.qpm)}\n`;
    splitInstruments(tns).forEach((ins, instrumentId) => {
      section = 0;
      abcString += segmentToString(ns, ins, instrumentId, tempo);
    });
  });
  return abcString;
}
