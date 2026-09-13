import { parseMidi } from "https://cdn.jsdelivr.net/npm/midi-file@1.2.4/+esm";
import { buildNoteSequence, cloneNoteSequence } from "./parse-midi-core.js";

// Parses a raw MIDI file (ArrayBuffer) with midi-file and converts it into
// the NoteSequence-like shape that midi2abc.js expects. See
// parse-midi-core.js for the actual conversion logic (shared with the Node
// batch-test script in test/test-directory.mjs).
export function midiToNoteSequence(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const parsed = parseMidi(bytes);
  return buildNoteSequence(parsed);
}

export { cloneNoteSequence };
