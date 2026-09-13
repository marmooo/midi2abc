// Environment-agnostic core: takes the object returned by midi-file's
// parseMidi() and builds the minimal NoteSequence-like shape that
// midi2abc.js expects. Has no dependency on where parseMidi() itself came
// from, so both the browser (jsdelivr import, see parse-midi.js) and the
// Node batch-test script (npm import) can share this exact logic.
//
// { ticksPerBeat,
//   notes: [{instrument, program, startTick, endTick, pitch, velocity, isDrum}],
//   tempos: [{tick, qpm}], timeSignatures: [{tick, numerator, denominator}],
//   totalTicks }
//
// Everything is kept in raw MIDI ticks. ABC note-length notation is
// tempo-independent (a quarter note is a quarter note no matter how fast
// it's played), so there is no need to convert ticks to real-world seconds
// via a tempo map: qpm is only needed for the printed Q: tempo marking.

function toAbsoluteTicks(track) {
  let ticks = 0;
  const result = [];
  for (let i = 0; i < track.length; i++) {
    ticks += track[i].deltaTime;
    result.push({ ...track[i], ticks });
  }
  return result;
}

function dedupeByTick(events) {
  const result = [];
  let lastTick = null;
  for (let i = 0; i < events.length; i++) {
    if (events[i].tick !== lastTick) {
      result.push(events[i]);
      lastTick = events[i].tick;
    }
  }
  return result;
}

export function buildNoteSequence(parsed) {
  const ticksPerBeat = parsed.header.ticksPerBeat || 480;
  const tracksAbs = [];
  for (let i = 0; i < parsed.tracks.length; i++) {
    tracksAbs.push(toAbsoluteTicks(parsed.tracks[i]));
  }

  let tempos = [];
  let timeSignatures = [];
  for (let t = 0; t < tracksAbs.length; t++) {
    const track = tracksAbs[t];
    for (let i = 0; i < track.length; i++) {
      const event = track[i];
      if (event.type === "setTempo") {
        tempos.push({
          tick: event.ticks,
          qpm: 60e6 / event.microsecondsPerBeat,
        });
      } else if (event.type === "timeSignature") {
        timeSignatures.push({
          tick: event.ticks,
          numerator: event.numerator,
          denominator: event.denominator,
        });
      }
    }
  }
  tempos.sort((a, b) => a.tick - b.tick);
  timeSignatures.sort((a, b) => a.tick - b.tick);
  tempos = dedupeByTick(tempos);
  timeSignatures = dedupeByTick(timeSignatures);
  if (tempos.length === 0 || tempos[0].tick > 0) {
    tempos.unshift({ tick: 0, qpm: 120 });
  }
  if (timeSignatures.length === 0 || timeSignatures[0].tick > 0) {
    timeSignatures.unshift({ tick: 0, numerator: 4, denominator: 4 });
  }

  // Group notes by track (each track with note events becomes one
  // "instrument" segment, in the order it first appears).
  const instrumentGroups = [];
  let totalTicks = 0;
  for (let t = 0; t < tracksAbs.length; t++) {
    const track = tracksAbs[t];
    const programByChannel = new Map();
    const activeNotes = new Map();
    const notes = [];
    for (let i = 0; i < track.length; i++) {
      const event = track[i];
      if (event.type === "programChange") {
        programByChannel.set(event.channel, event.programNumber);
      } else if (event.type === "noteOn" && event.velocity > 0) {
        const key = `${event.channel}-${event.noteNumber}`;
        if (!activeNotes.has(key)) activeNotes.set(key, []);
        activeNotes.get(key).push({
          startTick: event.ticks,
          velocity: event.velocity,
        });
      } else if (
        event.type === "noteOff" ||
        (event.type === "noteOn" && event.velocity === 0)
      ) {
        const key = `${event.channel}-${event.noteNumber}`;
        const stack = activeNotes.get(key);
        if (stack && stack.length) {
          const { startTick, velocity } = stack.shift();
          const endTick = event.ticks;
          if (endTick > startTick) {
            notes.push({
              instrument: 0, // reassigned below
              program: programByChannel.get(event.channel) ?? 0,
              startTick,
              endTick,
              pitch: event.noteNumber,
              velocity,
              isDrum: event.channel === 9,
            });
          }
        }
      }
    }
    const trackEndTicks = track.length ? track[track.length - 1].ticks : 0;
    if (trackEndTicks > totalTicks) totalTicks = trackEndTicks;
    if (notes.length) {
      notes.sort((a, b) => a.startTick - b.startTick);
      instrumentGroups.push(notes);
      const last = notes[notes.length - 1].endTick;
      if (last > totalTicks) totalTicks = last;
    }
  }

  const notes = [];
  for (let i = 0; i < instrumentGroups.length; i++) {
    const group = instrumentGroups[i];
    for (let j = 0; j < group.length; j++) {
      group[j].instrument = i;
      notes.push(group[j]);
    }
  }

  return { ticksPerBeat, notes, tempos, timeSignatures, totalTicks };
}

export function cloneNoteSequence(ns) {
  return structuredClone(ns);
}

// Real-world (human-performed / non-quantized) MIDI files often have note
// start/end ticks that don't land on any clean rhythmic grid (a note ending
// a couple of ticks after the next one starts, timing drifting by a handful
// of ticks throughout). ABC (like any standard notation) can only represent
// rational, grid-aligned durations, so feeding such raw ticks straight into
// midi2abc.js causes cascading "duration not representable" approximation
// errors. Snapping every note's start/end to the nearest multiple of
// ticksPerBeat/division (32nd notes by default) fixes this: it's the same
// kind of quantization any notation software applies when importing a
// performance recording. Chords/legato that were only a few ticks off from
// lining up will usually snap into exact alignment as a side effect.
function insertionSort(arr, compare) {
  for (let i = 1; i < arr.length; i++) {
    const current = arr[i];
    let j = i - 1;
    while (j >= 0 && compare(arr[j], current) > 0) {
      arr[j + 1] = arr[j];
      j -= 1;
    }
    arr[j + 1] = current;
  }
  return arr;
}

export function quantizeTicks(ns, division = 8) {
  const grid = ns.ticksPerBeat / division;
  for (let i = 0; i < ns.notes.length; i++) {
    const note = ns.notes[i];
    note.startTick = Math.round(note.startTick / grid) * grid;
    note.endTick = Math.round(note.endTick / grid) * grid;
    if (note.endTick <= note.startTick) {
      note.endTick = note.startTick + grid;
    }
  }
  // Rounding can change the relative order of notes within an instrument,
  // so re-sort (stably, by instrument then startTick) to keep the
  // contiguous-per-instrument grouping that splitInstruments() relies on.
  insertionSort(ns.notes, (a, b) => {
    if (a.instrument !== b.instrument) return a.instrument - b.instrument;
    return a.startTick - b.startTick;
  });
  let totalTicks = 0;
  for (let i = 0; i < ns.notes.length; i++) {
    if (ns.notes[i].endTick > totalTicks) totalTicks = ns.notes[i].endTick;
  }
  if (totalTicks > ns.totalTicks) ns.totalTicks = totalTicks;
  return ns;
}

function alignmentRatio(ns, division) {
  if (ns.notes.length === 0) return 1;
  const grid = ns.ticksPerBeat / division;
  let onGrid = 0;
  for (let i = 0; i < ns.notes.length; i++) {
    if (ns.notes[i].startTick % grid === 0) onGrid++;
  }
  return onGrid / ns.notes.length;
}

// Only quantizes if the file doesn't already look grid-aligned. A properly
// notated/quantized file (even one using triplets, which are legitimately
// off this power-of-2 grid) will already have the vast majority of notes
// landing exactly on grid ticks; blindly quantizing it would snap those
// triplets onto the wrong, nearby grid position and corrupt them. A
// human-performed, non-quantized file has no such alignment (note starts
// land more or less uniformly at any tick offset), so snapping every note
// to the nearest grid line is the right call there.
export function autoQuantizeTicks(ns, division = 8, threshold = 0.9) {
  if (alignmentRatio(ns, division) < threshold) {
    quantizeTicks(ns, division);
  }
  return ns;
}
