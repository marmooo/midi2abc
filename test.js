// Batch-converts every .mid/.midi file under a directory and reports which
// ones have problems, sorted from "simplest to fix" to "most complex", so
// you can work through them in order.
//
// Usage:
//   deno run -RWN test.js \
//     /path/to/midi/folder [--json report.json]
//
// What counts as a problem:
//   - error:   parseMidi/buildNoteSequence/notesToAbc throws
//   - empty:   conversion succeeds but produces zero notes (the parser
//              likely failed to recognize the file's structure)
//   - warning: notesToAbc succeeds, but abcjs.parseOnly() reports parse
//              warnings on the generated ABC string (the output itself is
//              probably wrong even though nothing crashed)
//   - ok:      no error, at least one note, and abcjs has no warnings
//
// "Simplest to fix" is approximated by note count (fewer notes = smaller,
// easier-to-read ABC output and fewer places for a bug to hide), with
// track count and file size as tie-breakers.

import { parseMidi } from "npm:midi-file@1.2.4";
import abcjs from "npm:abcjs@6.7.0";
import { buildNoteSequence } from "./src/parse-midi-core.js";
import notesToAbc from "./src/midi2abc.js";

function joinPath(dir, name) {
  if (dir.endsWith("/")) return dir + name;
  return dir + "/" + name;
}

function basename(filePath) {
  const parts = filePath.split("/");
  return parts[parts.length - 1];
}

function parseArgs(args) {
  let dir = null;
  let jsonPath = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") {
      i += 1;
      jsonPath = args[i];
    } else if (!dir) {
      dir = args[i];
    }
  }
  return { dir, jsonPath };
}

function isMidiFile(name) {
  const lower = name.toLowerCase();
  return lower.endsWith(".mid") || lower.endsWith(".midi");
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

function countInstruments(notes) {
  const set = new Set();
  for (let i = 0; i < notes.length; i++) {
    set.add(notes[i].instrument);
  }
  return set.size;
}

async function testFile(filePath) {
  const stat = await Deno.stat(filePath);
  const report = {
    file: filePath,
    sizeBytes: stat.size,
    noteCount: null,
    trackCount: null,
    status: "ok",
    message: "",
  };

  let ns;
  let abcString;
  try {
    const bytes = await Deno.readFile(filePath);
    const parsed = parseMidi(bytes);
    ns = buildNoteSequence(parsed);
    abcString = notesToAbc(ns, { title: basename(filePath) });
  } catch (err) {
    report.status = "error";
    report.message = err && err.message ? err.message : String(err);
    return report;
  }

  report.noteCount = ns.notes.length;
  report.trackCount = countInstruments(ns.notes);

  if (ns.notes.length === 0) {
    report.status = "empty";
    report.message = "converted with 0 notes";
    return report;
  }

  try {
    const tunes = abcjs.parseOnly(abcString);
    const warnings = [];
    for (let i = 0; i < tunes.length; i++) {
      if (tunes[i].warnings) {
        for (let j = 0; j < tunes[i].warnings.length; j++) {
          warnings.push(stripHtml(tunes[i].warnings[j]));
        }
      }
    }
    if (warnings.length > 0) {
      report.status = "warning";
      report.message = warnings.join(" / ");
    }
  } catch (err) {
    report.status = "error";
    report.message = "abcjs.parseOnly threw: " +
      (err && err.message ? err.message : String(err));
  }

  return report;
}

function compareProblems(a, b) {
  const aNotes = a.noteCount === null ? Infinity : a.noteCount;
  const bNotes = b.noteCount === null ? Infinity : b.noteCount;
  if (aNotes !== bNotes) return aNotes - bNotes;
  const aTracks = a.trackCount === null ? Infinity : a.trackCount;
  const bTracks = b.trackCount === null ? Infinity : b.trackCount;
  if (aTracks !== bTracks) return aTracks - bTracks;
  return a.sizeBytes - b.sizeBytes;
}

// Simplest to fix first: fewer notes, then fewer tracks, then smaller file.
// Files that threw before we could even count notes/tracks (noteCount ===
// null) sort last, since we know the least about how simple they are.
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

async function main() {
  const { dir, jsonPath } = parseArgs(Deno.args);
  if (!dir) {
    console.error(
      "Usage: deno run --allow-read --allow-write --allow-net test_directory.js <directory> [--json report.json]",
    );
    Deno.exit(1);
  }

  const files = await findMidiFiles(dir);
  console.log(`Found ${files.length} MIDI file(s) under ${dir}\n`);

  const reports = [];
  for (let i = 0; i < files.length; i++) {
    reports.push(await testFile(files[i]));
  }

  let okCount = 0;
  let errorCount = 0;
  let emptyCount = 0;
  let warningCount = 0;
  for (let i = 0; i < reports.length; i++) {
    if (reports[i].status === "ok") okCount += 1;
    else if (reports[i].status === "error") errorCount += 1;
    else if (reports[i].status === "empty") emptyCount += 1;
    else if (reports[i].status === "warning") warningCount += 1;
  }

  console.log("Summary:");
  console.log(`  ok:      ${okCount}`);
  console.log(`  warning: ${warningCount}`);
  console.log(`  empty:   ${emptyCount}`);
  console.log(`  error:   ${errorCount}`);
  console.log("");

  let problems = [];
  for (let i = 0; i < reports.length; i++) {
    if (reports[i].status !== "ok") problems.push(reports[i]);
  }
  problems = insertionSort(problems, compareProblems);

  console.log(`Problem files (${problems.length}), simplest first:\n`);
  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    console.log(
      `[${p.status}] ${p.file}\n` +
        `  notes=${p.noteCount} tracks=${p.trackCount} size=${p.sizeBytes}B\n` +
        `  ${p.message}\n`,
    );
  }

  if (jsonPath) {
    await Deno.writeTextFile(
      jsonPath,
      JSON.stringify({ reports, problems }, null, 2),
    );
    console.log(`Full report written to ${jsonPath}`);
  }
}

await main();
