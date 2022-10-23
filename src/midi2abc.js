function noteToString(note, unitTime) {
  const keyString = noteToKeyString(note);
  const duration = (note.endTime - note.startTime) * unitTime;
  const [len1, len2] = calcKeyLength(duration);
  if (len2 == null) return "";
  const tie = (note.tie) ? "-" : "";
  return len1 + keyString + len2 + tie;
}

function chordNoteToString(chordNote, unitTime) {
  if (chordNote.length == 1) {
    return noteToString(chordNote[0], unitTime);
  } else {
    const str = chordNote.map((note) => {
      const tie = (note.tie) ? "-" : "";
      return noteToKeyString(note, unitTime) + tie;
    }).join("");
    const n = chordNote[0];
    const duration = (n.endTime - n.startTime) * unitTime;
    const [len1, len2] = calcKeyLength(duration);
    if (len2 == null) return "";
    return len1 + `[${str}]` + len2;
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

function calcKeyLength(duration) {
  const base = 60;
  duration = Math.round(duration * 1e6) / 1e6;
  if (duration == base) return ["", ""];
  if (duration <= 0) {
    console.error(`duration is negative: ${duration}`);
    return [null, null];
  }
  if (duration * 8 < base) {
    // abc.js does not support duration less than z/8.
    console.log(`duration (less than z/8) are ignored: ${duration}`);
    return [null, null];
  }
  let n = 2;
  if (duration > base) {
    // normal note
    while (duration / n > base) n *= 2;
    if (duration / n == base) return ["", `${n}`];
    // dotted note
    n /= 2;
    for (let p = 2; p <= 128; p *= 2) {
      const q = 2 * p - 1;
      const k = n * q / p;
      if (round(duration / k, 1e6) == base) {
        if (k == Math.round(k)) {
          return ["", `${k}`];
        } else {
          return ["", `${n * q}/${p}`];
        }
      }
    }
    n *= 2;
    for (let i = 3; i <= 9; i++) {
      for (let j = 1; j <= i - 1; j++) {
        if (duration / n * i / j == base) {
          if (n == 1) return [`(${i}:${j}`, ""];
          return [`(${i}:${j}`, `${n}`];
        }
      }
    }
    console.error(duration, n);
    return ["", `${n}`];
  } else {
    // normal note
    while (duration * n < base) n *= 2;
    if (duration * n == base) return ["", `/${n}`];
    // dotted note
    for (let p = 2; p <= 128; p *= 2) {
      const q = 2 * p - 1;
      const k = n * q / p;
      if (round(duration / k, 1e6) == base) {
        if (k == Math.round(k)) {
          return ["", `${k}`];
        } else {
          return ["", `${q}/${p * n}`];
        }
      }
    }
    // tuplet
    n /= 2;
    for (let i = 3; i <= 9; i++) {
      for (let j = 1; j <= i - 1; j++) {
        if (duration / n * i / j == base) {
          if (n == 1) return [`(${i}:${j}`, ""];
          return [`(${i}:${j}`, `/${n}`];
        }
      }
    }
    console.error(duration, n);
    return ["", `/${n}`];
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

function durationToRestString(startTime, endTime, unitTime) {
  if (startTime < endTime) {
    const duration = (endTime - startTime) * unitTime;
    let abc = "";
    splitRestDurtion(duration).forEach((d) => {
      const [len1, len2] = calcKeyLength(d);
      if (len2 == null) return "";
      abc += len1 + "z" + len2;
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

function cleanupTime(ns) {
  let min = Infinity;
  ns.notes.forEach((n) => {
    const startTime = n.startTime;
    if (startTime < min) min = startTime;
  });
  if (min != 0) {
    ns.notes.forEach((n) => {
      n.startTime -= min;
      n.endTime -= min;
    });
    ns.tempos.forEach((tempo) => {
      if (0 < tempo.time) tempo.time -= min;
    });
    ns.totalTime -= min;
  }
  return ns;
}

function round(x, epsilon) {
  return Math.round(x * epsilon) / epsilon;
}

function chordNoteToTieString(c, unitTime, sectionLength, tempo) {
  let abcString = "";
  const endTime = c[0].endTime;
  c.forEach((n) => n.endTime = sectionEnd);
  abcString += chordNoteToString(c, unitTime);
  if (round(sectionEnd, 1e13) == round(endTime, 1e13)) {
    abcString += "|";
    if (section % 4 == 0) abcString += "\n";
    section += 1;
    sectionEnd = tempo.time + section * sectionLength;
    return abcString;
  } else {
    abcString += "-|";
    const count = Math.floor((endTime - c[0].startTime) / sectionLength);
    if (section % 4 == 0) abcString += "\n";
    for (let i = 1; i < count; i++) {
      const nextSection = section + 1;
      const nextSectionEnd = tempo.time + nextSection * sectionLength;
      c.forEach((n) => {
        n.startTime = sectionEnd;
        n.endTime = nextSectionEnd;
      });
      abcString += chordNoteToString(c, unitTime);
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
    abcString += chordNoteToString(c, unitTime);
    section += 1;
    sectionEnd = tempo.time + section * sectionLength;
    return abcString;
  }
}

function durationToRestStrings(
  startTime,
  endTime,
  tempo,
  unitTime,
  sectionLength,
) {
  let abcString = "";
  if (round(sectionEnd, 1e13) <= round(endTime, 1e13)) {
    let prevSectionEnd = sectionEnd;
    if (round(startTime, 1e13) < round(sectionEnd, 1e13)) {
      abcString += durationToRestString(startTime, sectionEnd, unitTime);
      abcString += "|";
      if (section % 4 == 0) abcString += "\n";
      section += 1;
      sectionEnd = tempo.time + section * sectionLength;
      const count = Math.floor((endTime - prevSectionEnd) / sectionLength);
      for (let i = 0; i < count; i++) {
        abcString += durationToRestString(prevSectionEnd, sectionEnd, unitTime);
        abcString += "|";
        if (section % 4 == 0) abcString += "\n";
        section += 1;
        prevSectionEnd = sectionEnd;
        sectionEnd = tempo.time + section * sectionLength;
      }
      abcString += durationToRestString(prevSectionEnd, endTime, unitTime);
    } else {
      if (round(sectionEnd, 1e13) == round(startTime, 1e13)) {
        abcString += "|";
        if (section % 4 == 0) abcString += "\n";
        section += 1;
        sectionEnd = tempo.time + section * sectionLength;
      }
      if (round(endTime, 1e13) < round(sectionEnd, 1e13)) {
        abcString += durationToRestString(startTime, endTime, unitTime);
      } else {
        abcString += durationToRestString(startTime, sectionEnd, unitTime);
        abcString += "|";
        if (section % 4 == 0) abcString += "\n";
        section += 1;
        prevSectionEnd = sectionEnd;
        sectionEnd = section * sectionLength;
        const count = Math.floor((endTime - prevSectionEnd) / sectionLength);
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
          sectionEnd = tempo.time + section * sectionLength;
        }
        abcString += durationToRestString(prevSectionEnd, endTime, unitTime);
      }
    }
  } else if (round(startTime, 1e13) < round(endTime, 1e13)) {
    abcString += durationToRestString(startTime, endTime, unitTime);
  }
  return abcString;
}

function cloneNote(note) {
  return {
    instrument: note.instrument,
    program: note.program,
    startTime: note.startTime,
    endTime: note.endTime,
    pitch: note.pitch,
    velocity: note.pitch,
    isDrum: note.isDrum,
  };
}

function getTargetPosition(ns, i) {
  const endTime = ns[i].endTime;
  i += 1;
  while (ns[i] && ns[i].startTime < endTime) {
    i += 1;
  }
  return i;
}

function getNotationBreaks(ns) {
  const set = new Set();
  ns.forEach((n) => {
    set.add(n.startTime);
    set.add(n.endTime);
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
      const endTime = ns[i].endTime;
      const targetBreaks = notationBreaks.filter((t) => t <= endTime);
      const chords = splitChord(target, targetBreaks);
      result.push(...chords);
      const nextTarget = target
        .filter((n) => endTime < n.endTime)
        .map((n) => {
          const newNote = cloneNote(n);
          newNote.startTime = endTime;
          return newNote;
        });
      ns = ns.slice(j);
      ns.unshift(...nextTarget);
      i = 0;
    }
  }
  return result;
}

function splitChord(chordNote, endTimes) {
  const result = [];
  endTimes.forEach((endTime, i) => {
    if (i == 0) {
      const newChord = [];
      const startTime = chordNote[0].startTime;
      chordNote.forEach((n) => {
        if (n.startTime <= startTime) {
          const newNote = cloneNote(n);
          newNote.endTime = endTime;
          if (endTime < n.endTime) {
            newNote.tie = true;
          }
          newChord.push(newNote);
        }
      });
      result.push(newChord);
    } else {
      const startTime = endTimes[i - 1];
      const newChord = [];
      chordNote.forEach((n) => {
        if (n.startTime <= startTime && endTime <= n.endTime) {
          const newNote = cloneNote(n);
          newNote.startTime = startTime;
          newNote.endTime = endTime;
          if (endTime < n.endTime) {
            newNote.tie = true;
          }
          newChord.push(newNote);
        }
      });
      result.push(newChord);
    }
  });
  return result;
}

function segmentToString(ns, ins, instrumentId, tempo) {
  const beat = ns.timeSignatures[0].numerator /
    ns.timeSignatures[0].denominator;
  const unitLength = 2 ** Math.floor(1 / beat);
  const unitTime = tempo.qpm * unitLength;
  const sectionLength = 240 / tempo.qpm * beat;
  let abcString = setInstrumentHeader(ns, ins, instrumentId, unitLength);
  section = 1;
  sectionEnd = tempo.time + section * sectionLength;

  const cs = getChord(ins);
  cs.forEach((c, i) => {
    const nextC = cs[i + 1];
    if (i == 0 && c[0].startTime != tempo.time) {
      abcString += durationToRestStrings(
        tempo.time,
        c[0].startTime,
        tempo,
        unitTime,
        sectionLength,
      );
    }
    if (round(sectionEnd, 1e13) < round(c[0].endTime, 1e13)) {
      abcString += chordNoteToTieString(c, unitTime, sectionLength, tempo);
    } else {
      abcString += chordNoteToString(c, unitTime);
    }
    if (nextC) {
      abcString += durationToRestStrings(
        c[0].endTime,
        nextC[0].startTime,
        tempo,
        unitTime,
        sectionLength,
      );
    } else {
      abcString += durationToRestStrings(
        c[0].endTime,
        ns.totalTime,
        tempo,
        unitTime,
        sectionLength,
      );
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
  console.log(ns, ns.tempos.length);
  let abcString = "X:1\n";
  if (options) {
    if (options.title) abcString += `T:${options.title}\n`;
    if (options.composer) abcString += `C:${options.composer}\n`;
  }
  cleanupTime(ns);
  console.log(splitTempos(ns.notes, ns.tempos).length);
  splitTempos(ns.notes, ns.tempos).forEach(([tns, tempo]) => {
    abcString += `Q:1/4=${Math.round(tempo.qpm)}\n`;
    splitInstruments(tns).forEach((ins, instrumentId) => {
      section = 0;
      abcString += segmentToString(ns, ins, instrumentId, tempo);
    });
  });
  return abcString;
}
