// Same conversion checks as test.js, but registered as individual
// Deno.test() cases so `deno test` reports a native pass/fail count and
// per-file results, instead of the custom summary/JSON report that
// test.js prints (test.js is still the better tool for triaging *which*
// file to fix next; this one is for tracking the overall success rate,
// e.g. in CI).
//
// Usage:
//   deno test -R midi_test.js -- /path/to/midi/folder
//
// IMPORTANT: the `--` before the directory is required. Without it,
// `deno test` swallows the path as its own file/pattern argument instead
// of forwarding it to the script, and Deno.args ends up empty.

import { parseMidi } from "midi-file";
import abcjs from "abcjs";
import { autoQuantizeTicks, buildNoteSequence } from "./src/parse-midi-core.js";
import notesToAbc from "./src/midi2abc.js";

function isMidiFile(name) {
  const lower = name.toLowerCase();
  return lower.endsWith(".mid") || lower.endsWith(".midi");
}

function joinPath(dir, name) {
  if (dir.endsWith("/")) return dir + name;
  return dir + "/" + name;
}

async function findMidiFiles(rootDir) {
  const result = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    const iter = Deno.readDir(dir)[Symbol.asyncIterator]();
    while (true) {
      const { value: entry, done } = await iter.next();
      if (done) break;
      const fullPath = joinPath(dir, entry.name);
      if (entry.isDirectory) {
        stack.push(fullPath);
      } else if (entry.isFile && isMidiFile(entry.name)) {
        result.push(fullPath);
      }
    }
  }
  return result;
}

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, "");
}

const dir = Deno.args[0];

if (!dir) {
  Deno.test("midi conversion (no directory given)", () => {
    throw new Error(
      "No directory given. Positional args after the test file(s) need " +
        "`--` or deno test swallows them as its own file/pattern args: " +
        "`deno test -R midi_test.js -- /path/to/midi/folder`.",
    );
  });
} else {
  const files = await findMidiFiles(dir);
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    Deno.test(filePath, async () => {
      const bytes = await Deno.readFile(filePath);
      const parsed = parseMidi(bytes);
      const ns = buildNoteSequence(parsed);
      autoQuantizeTicks(ns, 8); // same default as the browser app
      const abcString = notesToAbc(ns, { title: filePath });

      // A MIDI file legitimately producing 0 notes (e.g. metadata-only or
      // control-only tracks) is not a conversion failure, so it shouldn't
      // fail the test. Log it for visibility instead.
      if (ns.notes.length === 0) {
        console.warn(`converted with 0 notes: ${filePath}`);
        return;
      }

      const tunes = abcjs.parseOnly(abcString);
      const warnings = [];
      for (let j = 0; j < tunes.length; j++) {
        if (tunes[j].warnings) {
          for (let k = 0; k < tunes[j].warnings.length; k++) {
            warnings.push(stripHtml(tunes[j].warnings[k]));
          }
        }
      }
      if (warnings.length > 0) {
        throw new Error(warnings.join(" / "));
      }
    });
  }
}
