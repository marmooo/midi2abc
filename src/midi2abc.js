function noteToString(note, tempo, unitLength) {
  const keyString = noteToKeyString(note);
  const duration = (note.endTime - note.startTime) * tempo.qpm * unitLength;
  const keyLength = calcKeyLength(duration);
  if (keyLength == null) {
    console.error(note);
    return "";
  }
  if (keyLength[0] == "(") { // tuplet
    return keyLength + keyString;
  } else {
    return keyString + keyLength;
  }
}

function chordNoteToString(chordNote, tempo, unitLength) {
  if (chordNote.length == 1) {
    return noteToString(chordNote[0], tempo, unitLength);
  } else {
    const str = chordNote.map((note) => {
      return noteToKeyString(note, tempo);
    }).join("");
    const n = chordNote[0];
    const duration = (n.endTime - n.startTime) * tempo.qpm * unitLength;
    const keyLength = calcKeyLength(duration);
    if (keyLength == null) {
      console.error(chordNote);
      return "";
    }
    if (keyLength[0] == "(") {
      return `${keyLength}[${str}]`;
    } else {
      return `[${str}]${keyLength}`;
    }
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

function cleanupTempos(tempos) {
  const cleanedTempos = new Map();
  tempos.forEach((tempo) => {
    cleanedTempos.set(tempo.time, tempo.qpm);
  });
  const result = [];
  for (const [time, qpm] of cleanedTempos) {
    const tempo = { time: time, qpm: qpm };
    result.push(tempo);
  }
  return result;
}

function splitTempos(notes, tempos) {
  let tFrom = 0;
  const result = [];
  const cleanedTempos = cleanupTempos(tempos);
  if (cleanedTempos.length == 1) {
    return [[notes, cleanedTempos[0]]];
  }
  cleanedTempos.slice(1).forEach((tempo, i) => {
    const tTo = tempo.time;
    const filtered = notes
      .filter((n) => n.startTime < tTo)
      .filter((n) => tFrom <= n.startTime);
    result.push([filtered, cleanedTempos[i]]);
    tFrom = tTo;
  });
  const filtered = notes.filter((n) => tFrom <= n.startTime);
  result.push([filtered, cleanedTempos.at(-1)]);
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

function noteSequenceToChordSequence(ns) {
  let t = Infinity;
  const result = [];
  ns.forEach((n) => {
    if (t == n.startTime) {
      result.at(-1).push(n);
    } else {
      t = n.startTime;
      result.push([n]);
    }
  });
  return result;
}

function calcKeyLength(duration) {
  const base = 60;
  duration = Math.round(duration * 1e6) / 1e6;
  if (duration == base) return "";
  if (duration <= 0) {
    console.error(`duration is negative: ${duration}`);
    return null;
  }
  let n = 2;
  if (duration > base) {
    // normal note
    while (duration / n > base) n *= 2;
    if (duration / n == base) return `${n}`;
    // dotted note
    n /= 2;
    for (let s = 2; s <= 8; s *= 2) {
      const t = 2 * s - 1;
      const l = n * t / s;
      if (duration / l == base) {
        if (l == Math.round(l)) {
          return `${l}`;
        } else {
          return `${n * t}/${s}`;
        }
      }
    }
    // TODO: tuplet
    n *= 4;
    for (let i = 2; i <= 9; i++) {
      for (let j = 1; j <= i - 1; j++) {
        if (duration * n * j / i == base) {
          return `(${j}:${i}`;
        }
      }
    }
    return `${n}`;
  } else {
    // normal note
    while (duration * n < base) n *= 2;
    if (duration * n == base) return `/${n}`;
    // dotted note
    n *= 2;
    for (let s = 2; s <= 8; s *= 2) {
      const t = 2 * s - 1;
      if (duration * n * s / t == base) {
        return `${t}/${s * n}`;
      }
    }
    // TODO: tuplet
    n /= 4;
    for (let i = 2; i <= 9; i++) {
      for (let j = 1; j <= i - 1; j++) {
        if (duration * n * i / j == base) {
          return `(${i}:${j}`;
        }
      }
    }
    return `/${n}`;
  }
}

function normalizeKey(chord, nextChord) {
  if (!nextChord) return chord;
  chord.forEach((c) => {
    const n = nextChord[0];
    if (c.endTime > n.startTime) c.endTime = n.startTime;
  });
  return chord;
}

function durationToRestString(startTime, endTime, tempo, unitLength) {
  if (startTime < endTime) {
    const duration = (endTime - startTime) * tempo.qpm * unitLength;
    const keyLength = calcKeyLength(duration);
    if (keyLength == null) return "";
    return "z" + calcKeyLength(duration);
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
    return "F3";
  }
}

function cleanupTime(ns) {
  let min = Infinity;
  ns.forEach((n) => {
    const startTime = n.startTime;
    if (startTime < min) min = startTime;
  });
  if (min != 0) {
    ns.forEach((n) => n.startTime -= min);
  }
  return ns;
}

function round(x, epsilon) {
  return Math.round(x * epsilon) / epsilon;
}

function chordNoteToTieString(c, ns, unitLength, sectionLength) {
  let abcString = "";
  const endTime = c[0].endTime;
  c.forEach((n) => n.endTime = sectionEnd);
  abcString += chordNoteToString(c, ns.tempos[0], unitLength);
  if (round(sectionEnd, 1e13) == round(endTime, 1e13)) {
    abcString += "|";
    if (section % 4 == 0) abcString += "\n";
    section += 1;
    sectionEnd = section * sectionLength;
    return abcString;
  } else {
    abcString += "-|";
    const count = Math.floor((c[0].endTime - c[0].startTime) / sectionLength);
    if (section % 4 == 0) abcString += "\n";
    for (let i = 1; i < count; i++) {
      const nextSection = section + 1;
      const nextSectionEnd = nextSection * sectionLength;
      c.forEach((n) => {
        n.startTime = sectionEnd;
        n.endTime = nextSectionEnd;
      });
      abcString += chordNoteToString(c, ns.tempos[0], unitLength);
      if (round(nextSectionEnd, 1e13) == round(endTime, 1e13)) {
        abcString += "|";
        if (nextSection % 4 == 0) abcString += "\n";
        section = nextSection;
        sectionEnd = nextSectionEnd;
        return abcString;
      } else {
        abcString += "-|";
        if (nextSection % 4 == 0) abcString += "\n";
        section = nextSection;
        sectionEnd = nextSectionEnd;
      }
    }
    c.forEach((n) => {
      n.startTime = sectionEnd;
      n.endTime = endTime;
    });
    abcString += chordNoteToString(c, ns.tempos[0], unitLength);
    section += 1;
    sectionEnd = section * sectionLength;
    return abcString;
  }
}

// function durationToRestStrings(startTime, endTime, tempo, unitLength, sectionLength) {
//   let abcString = "";
//   if (round(sectionEnd, 1e13) <= round(endTime, 1e13)) {
//     if (round(startTime, 1e13) < round(sectionEnd, 1e13)) {
//       abcString += durationToRestString(startTime, endTime, tempo, unitLength);
//       abcString += "|";
//       if (section % 4 == 0) abcString += "\n";
//       section += 1;
//       sectionEnd = section * sectionLength;
//     } else {
//       if (round(sectionEnd, 1e13) == round(startTime, 1e13)) {
//         abcString += "|";
//         if (section % 4 == 0) abcString += "\n";
//         section += 1;
//         sectionEnd = section * sectionLength;
//         abcString += durationToRestString(startTime, endTime, tempo, unitLength);
//       }
//     }
//   } else if (round(startTime, 1e13) < round(endTime, 1e13)) {
//     abcString += durationToRestString(startTime, endTime, tempo, unitLength);
//   }
//   return abcString;
// }

function durationToRestStrings(
  startTime,
  endTime,
  tempo,
  unitLength,
  sectionLength,
) {
  let abcString = "";
  if (round(sectionEnd, 1e13) <= round(endTime, 1e13)) {
    let prevSectionEnd = sectionEnd;
    if (round(startTime, 1e13) < round(sectionEnd, 1e13)) {
      abcString += durationToRestString(
        startTime,
        sectionEnd,
        tempo,
        unitLength,
      );
      abcString += "|";
      if (section % 4 == 0) abcString += "\n";
      section += 1;
      sectionEnd = section * sectionLength;
      const count = Math.floor((endTime - prevSectionEnd) / sectionLength);
      for (let i = 0; i < count; i++) {
        abcString += durationToRestString(
          prevSectionEnd,
          sectionEnd,
          tempo,
          unitLength,
        );
        abcString += "|";
        if (section % 4 == 0) abcString += "\n";
        section += 1;
        prevSectionEnd = sectionEnd;
        sectionEnd = section * sectionLength;
      }
      abcString += durationToRestString(
        prevSectionEnd,
        endTime,
        tempo,
        unitLength,
      );
    } else {
      if (round(sectionEnd, 1e13) == round(startTime, 1e13)) {
        abcString += "|";
        if (section % 4 == 0) abcString += "\n";
        section += 1;
        sectionEnd = section * sectionLength;
      }
      if (round(endTime, 1e13) < round(sectionEnd, 13)) {
        abcString += durationToRestString(
          startTime,
          endTime,
          tempo,
          unitLength,
        );
      } else {
        abcString += durationToRestString(
          startTime,
          sectionEnd,
          tempo,
          unitLength,
        );
        abcString += "|";
        if (section % 4 == 0) abcString += "\n";
        section += 1;
        prevSectionEnd = sectionEnd;
        sectionEnd = section * sectionLength;
        const count = Math.floor((sectionEnd - prevSectionEnd) / sectionLength);
        for (let i = 0; i < count; i++) {
          abcString += durationToRestString(
            prevSectionEnd,
            sectionEnd,
            tempo,
            unitLength,
          );
          abcString += "|";
          if (section % 4 == 0) abcString += "\n";
          section += 1;
          prevSectionEnd = sectionEnd;
          sectionEnd = section * sectionLength;
        }
        abcString += durationToRestString(
          prevSectionEnd,
          endTime,
          tempo,
          unitLength,
        );
      }
    }
  } else if (round(startTime, 1e13) < round(endTime, 1e13)) {
    abcString += durationToRestString(startTime, endTime, tempo, unitLength);
  }
  return abcString;
}

function segmentToString(ns, ins, instrumentId, tempo) {
  const beat = ns.timeSignatures[0].numerator /
    ns.timeSignatures[0].denominator;
  const unitLength = 2 ** Math.floor(1 / beat);
  const sectionLength = 240 / tempo.qpm * beat;
  let abcString = setInstrumentHeader(ns, ins, instrumentId, unitLength);
  section = 1;
  sectionEnd = section * sectionLength;
  const cs = noteSequenceToChordSequence(ins);
  cs.forEach((c, i) => {
    const nextC = cs[i + 1];
    normalizeKey(c, nextC);
    if (i == 0 && c[0].startTime != 0) {
      abcString += durationToRestStrings(
        0,
        c[0].startTime,
        tempo,
        unitLength,
        sectionLength,
      );
    }
    if (round(sectionEnd, 1e13) < round(c[0].endTime, 1e13)) {
      abcString += chordNoteToTieString(c, ns, unitLength, sectionLength);
      if (nextC) {
        abcString += durationToRestStrings(
          c[0].endTime,
          nextC[0].startTime,
          tempo,
          unitLength,
          sectionLength,
        );
      }
    } else {
      abcString += chordNoteToString(c, tempo, unitLength);
      if (nextC) {
        abcString += durationToRestStrings(
          c[0].endTime,
          nextC[0].startTime,
          tempo,
          unitLength,
          sectionLength,
        );
      }
    }
  });
  abcString += "\n";
  return abcString;
}

function setInstrumentHeader(ns, ins, instrumentId, unitLength) {
  const sigs = ns.timeSignatures;
  const id = (instrumentId <= sigs.length - 1) ? instrumentId : sigs.length - 1;
  const sig = sigs[id];
  const numerator = sig.numerator;
  const denominator = sig.denominator;
  return `L:1/${4 * unitLength}
M:${numerator}/${denominator}
K:C clef=${guessClef(ins)}
V:${instrumentId + 1}
%%MIDI program ${ins[0].program}
`;
}

let section;
let sectionEnd;
export default function tone2abc(ns, options) {
  let abcString = "X:1\n";
  if (options) {
    if (options.title) abcString += `T:${options.title}\n`;
    if (options.composer) abcString += `C:${options.composer}\n`;
  }
  cleanupTime(ns.notes);
  // ns.tempos[1].time = 30;
  // ns.tempos[1].qpm = 120;
  // TODO: change tempos
  // TODO: modulation
  splitTempos(ns.notes, ns.tempos).forEach(([tns, tempo]) => {
    abcString += `Q:1/4=${Math.round(tempo.qpm)}\n`;
    splitInstruments(tns).forEach((ins, instrumentId) => {
      section = 0;
      abcString += segmentToString(ns, ins, instrumentId, tempo);
    });
  });
  return abcString;
}
