# midi2abc

Convert MIDI to ABC notation.

Real-world, human-performed MIDI files are often not quantized (note timing
drifts by a few ticks throughout), which ABC notation can't represent cleanly.
Notes are automatically snapped to a 32nd-note grid unless the file already
looks properly notated (e.g. it already uses triplets), so such files still
convert without falling back to "duration not representable" garbage. See
`autoQuantizeTicks` in `src/parse-midi-core.js`.

## Demo

- [midi2abc](https://marmooo.github.io/midi2abc/)

## Build

```
bash build.sh
```

## Test

`test.js` (Deno) batch-converts every `.mid`/`.midi` file found (recursively)
under a directory and reports which ones have problems, sorted from simplest to
fix to most complex (by note count, then track count, then file size). It uses
[abcjs](https://github.com/paulrosen/abcjs)'s `parseOnly()` to headlessly
validate the generated ABC (no DOM/browser needed) in addition to catching any
exceptions thrown by the converter itself.

```
deno run -R test.js /path/to/midi/folder --json report.json
```

`midi_test.js` runs the same checks as individual `Deno.test()` cases, so
`deno test` reports a native pass/fail count (e.g. for tracking the conversion
success rate over time / in CI) instead of the custom summary/JSON report
`test.js` prints:

```
deno test -R midi_test.js -- /path/to/midi/folder
```

## License

MIT
