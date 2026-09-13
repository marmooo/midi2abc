import { parseMidi } from "https://cdn.jsdelivr.net/npm/midi-file@1.2.4/+esm";

function toAbsoluteTicks(track) {
  let ticks = 0;
  return track.map((event) => {
    ticks += event.deltaTime;
    return { ...event, ticks };
  });
}

function dedupeByTick(events) {
  const result = [];
  let lastTick = null;
  events.forEach((event) => {
    if (event.tick !== lastTick) {
      result.push(event);
      lastTick = event.tick;
    }
  });
  return result;
}

// Parses a raw MIDI file (ArrayBuffer) with midi-file and converts it into
// the minimal NoteSequence-like shape that midi2abc.js expects:
// { ticksPerBeat,
//   notes: [{instrument, program, startTick, endTick, pitch, velocity, isDrum}],
//   tempos: [{tick, qpm}], timeSignatures: [{tick, numerator, denominator}],
//   totalTicks }
//
// Everything is kept in raw MIDI ticks. ABC note-length notation is
// tempo-independent (a quarter note is a quarter note no matter how fast
// it's played), so there is no need to convert ticks to real-world seconds
// via a tempo map: qpm is only needed for the printed Q: tempo marking.
export function midiToNoteSequence(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const parsed = parseMidi(bytes);
  const ticksPerBeat = parsed.header.ticksPerBeat || 480;
  const tracksAbs = parsed.tracks.map(toAbsoluteTicks);

  let tempos = [];
  let timeSignatures = [];
  tracksAbs.forEach((track) => {
    track.forEach((event) => {
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
    });
  });
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
  tracksAbs.forEach((track) => {
    const programByChannel = new Map();
    const activeNotes = new Map();
    const notes = [];
    track.forEach((event) => {
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
    });
    const trackEndTicks = track.length ? track.at(-1).ticks : 0;
    if (trackEndTicks > totalTicks) totalTicks = trackEndTicks;
    if (notes.length) {
      notes.sort((a, b) => a.startTick - b.startTick);
      instrumentGroups.push(notes);
      const last = notes.at(-1).endTick;
      if (last > totalTicks) totalTicks = last;
    }
  });

  const notes = [];
  instrumentGroups.forEach((group, i) => {
    group.forEach((note) => {
      note.instrument = i;
      notes.push(note);
    });
  });

  return { ticksPerBeat, notes, tempos, timeSignatures, totalTicks };
}

export function cloneNoteSequence(ns) {
  return structuredClone(ns);
}
