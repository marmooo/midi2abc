import { parseMidi } from "https://cdn.jsdelivr.net/npm/midi-file@1.2.4/+esm";
import {
  autoQuantizeTicks,
  buildNoteSequence,
  cloneNoteSequence,
} from "./parse-midi-core.js";

// Parses a raw MIDI file (ArrayBuffer) with midi-file and converts it into
// the NoteSequence-like shape that midi2abc.js expects. See
// parse-midi-core.js for the actual conversion logic (shared with the Deno
// batch-test script in test/test_directory.js).
//
// Real-world, human-performed MIDI files are often not quantized, which
// midi2abc.js cannot represent cleanly in ABC notation, so notes are
// auto-quantized to a 32nd-note grid unless the file already looks
// properly notated (see autoQuantizeTicks in parse-midi-core.js). Pass
// { quantizeDivision: 0 } to always keep the raw tick positions.
export function midiToNoteSequence(arrayBuffer, options = {}) {
  const bytes = new Uint8Array(arrayBuffer);
  const parsed = parseMidi(bytes);
  const ns = buildNoteSequence(parsed);
  const division = options.quantizeDivision ?? 8;
  if (division) autoQuantizeTicks(ns, division);
  return ns;
}

export { cloneNoteSequence };
