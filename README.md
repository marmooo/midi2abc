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

```
deno task test /path/to/midi/folder --json report.json
```

## License

MIT
