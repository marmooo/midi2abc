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
