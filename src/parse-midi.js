import { parseMidi } from "https://cdn.jsdelivr.net/npm/midi-file@1.2.4/+esm";

function toAbsoluteTicks(track) {
  let ticks = 0;
  return track.map((event) => {
    ticks += event.deltaTime;
    return { ...event, ticks };
  });
}

function dedupeByTicks(events) {
  const result = [];
  let lastTicks = null;
  events.forEach((event) => {
    if (event.ticks !== lastTicks) {
      result.push(event);
      lastTicks = event.ticks;
    }
  });
  return result;
}

function buildTempoMap(tempoEvents, ticksPerBeat) {
  const map = [];
  let prevTicks = 0;
  let seconds = 0;
  let currentTempo = 500000; // default 120bpm
  tempoEvents.forEach((t) => {
    seconds += (t.ticks - prevTicks) / ticksPerBeat * currentTempo / 1e6;
    map.push({
      ticks: t.ticks,
      seconds,
      microsecondsPerBeat: t.microsecondsPerBeat,
    });
    prevTicks = t.ticks;
    currentTempo = t.microsecondsPerBeat;
  });
  return map;
}

function ticksToSeconds(ticks, tempoMap, ticksPerBeat) {
  let prevTicks = 0;
  let seconds = 0;
  let currentTempo = 500000;
  for (const entry of tempoMap) {
    if (entry.ticks > ticks) break;
    prevTicks = entry.ticks;
    seconds = entry.seconds;
    currentTempo = entry.microsecondsPerBeat;
  }
  seconds += (ticks - prevTicks) / ticksPerBeat * currentTempo / 1e6;
  return seconds;
}

// Parses a raw MIDI file (ArrayBuffer) with midi-file and converts it into
// the minimal NoteSequence shape that midi2abc.js expects:
// { notes: [{instrument, program, startTime, endTime, pitch, velocity, isDrum}],
//   tempos: [{time, qpm}], timeSignatures: [{time, numerator, denominator}],
//   totalTime }
export function midiToNoteSequence(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const parsed = parseMidi(bytes);
  const ticksPerBeat = parsed.header.ticksPerBeat || 480;
  const tracksAbs = parsed.tracks.map(toAbsoluteTicks);

  let tempoEvents = [];
  let timeSigEvents = [];
  tracksAbs.forEach((track) => {
    track.forEach((event) => {
      if (event.type === "setTempo") {
        tempoEvents.push({
          ticks: event.ticks,
          microsecondsPerBeat: event.microsecondsPerBeat,
        });
      } else if (event.type === "timeSignature") {
        timeSigEvents.push({
          ticks: event.ticks,
          numerator: event.numerator,
          denominator: event.denominator,
        });
      }
    });
  });
  tempoEvents.sort((a, b) => a.ticks - b.ticks);
  timeSigEvents.sort((a, b) => a.ticks - b.ticks);
  tempoEvents = dedupeByTicks(tempoEvents);
  timeSigEvents = dedupeByTicks(timeSigEvents);

  const tempoMap = buildTempoMap(tempoEvents, ticksPerBeat);
  const toSeconds = (ticks) => ticksToSeconds(ticks, tempoMap, ticksPerBeat);

  const tempos = tempoEvents.map((t) => ({
    time: toSeconds(t.ticks),
    qpm: 60e6 / t.microsecondsPerBeat,
  }));
  if (tempos.length === 0 || tempos[0].time > 0) {
    tempos.unshift({ time: 0, qpm: 120 });
  }

  const timeSignatures = timeSigEvents.map((t) => ({
    time: toSeconds(t.ticks),
    numerator: t.numerator,
    denominator: t.denominator,
  }));
  if (timeSignatures.length === 0 || timeSignatures[0].time > 0) {
    timeSignatures.unshift({ time: 0, numerator: 4, denominator: 4 });
  }

  // Group notes by track (each track with note events becomes one
  // "instrument" segment, in the order it first appears).
  const instrumentGroups = [];
  let totalTime = 0;
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
          startTicks: event.ticks,
          velocity: event.velocity,
        });
      } else if (
        event.type === "noteOff" ||
        (event.type === "noteOn" && event.velocity === 0)
      ) {
        const key = `${event.channel}-${event.noteNumber}`;
        const stack = activeNotes.get(key);
        if (stack && stack.length) {
          const { startTicks, velocity } = stack.shift();
          const startTime = toSeconds(startTicks);
          const endTime = toSeconds(event.ticks);
          if (endTime > startTime) {
            notes.push({
              instrument: 0, // reassigned below
              program: programByChannel.get(event.channel) ?? 0,
              startTime,
              endTime,
              pitch: event.noteNumber,
              velocity,
              isDrum: event.channel === 9,
            });
          }
        }
      }
    });
    const trackEndTicks = track.length ? track.at(-1).ticks : 0;
    const trackEndTime = toSeconds(trackEndTicks);
    if (trackEndTime > totalTime) totalTime = trackEndTime;
    if (notes.length) {
      notes.sort((a, b) => a.startTime - b.startTime);
      instrumentGroups.push(notes);
      const last = notes.at(-1).endTime;
      if (last > totalTime) totalTime = last;
    }
  });

  const notes = [];
  instrumentGroups.forEach((group, i) => {
    group.forEach((note) => {
      note.instrument = i;
      notes.push(note);
    });
  });

  return { notes, tempos, timeSignatures, totalTime };
}

export function cloneNoteSequence(ns) {
  return structuredClone(ns);
}
