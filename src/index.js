import ABCJS from "https://cdn.jsdelivr.net/npm/abcjs@6.7.0/+esm";
import notesToAbc from "./midi2abc.js";
import { cloneNoteSequence, midiToNoteSequence } from "./parse-midi.js";

function toggleDarkMode() {
  const html = document.documentElement;
  const newTheme = html.getAttribute("data-bs-theme") === "dark"
    ? "light"
    : "dark";
  html.setAttribute("data-bs-theme", newTheme);
  localStorage.setItem("darkMode", newTheme);
}

function toggleABCPanel() {
  document.getElementById("abcRow").classList.toggle("d-none");
  document.getElementById("abcColumn").classList.toggle("d-none");
  document.getElementById("abc").parentNode.parentNode.classList.toggle("row");
  const textarea = document.getElementById("abc");
  resizeABC(textarea);
}

function dropFileEvent(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  const dt = new DataTransfer();
  dt.items.add(file);
  const input = document.getElementById("inputFile");
  input.files = dt.files;
  convertFromBlob(file);
}

function convertFileEvent(event) {
  convertFromBlob(event.target.files[0]);
}

function convertUrlEvent(event) {
  convertFromUrl(event.target.value);
}

async function convertFromUrlParams() {
  const query = new URLSearchParams(location.search);
  ns = await urlToNoteSequence(query.get("url"));
  nsCache = cloneNoteSequence(ns);
  setToolbar();
  convert(ns, query);
}

async function convertFromBlob(file, query) {
  const buffer = await file.arrayBuffer();
  ns = midiToNoteSequence(buffer);
  nsCache = cloneNoteSequence(ns);
  setToolbar();
  convert(ns, query);
}

async function convertFromUrl(midiUrl, query) {
  ns = await urlToNoteSequence(midiUrl);
  nsCache = cloneNoteSequence(ns);
  setToolbar();
  convert(ns, query);
}

async function urlToNoteSequence(midiUrl) {
  const response = await fetch(midiUrl);
  const buffer = await response.arrayBuffer();
  return midiToNoteSequence(buffer);
}

function setMIDIInfo(query) {
  if (query instanceof URLSearchParams) {
    const title = query.get("title");
    const composer = query.get("composer");
    const maintainer = query.get("maintainer");
    const web = query.get("web");
    const license = query.get("license");
    document.getElementById("midiTitle").textContent = title;
    document.getElementById("composer").textContent = composer;
    if (web) {
      const a = document.createElement("a");
      a.href = web;
      a.textContent = maintainer;
      document.getElementById("maintainer").replaceChildren(a);
    } else {
      document.getElementById("maintainer").textContent = maintainer;
    }
    try {
      new URL(license);
    } catch {
      document.getElementById("license").textContent = license;
    }
  } else {
    document.getElementById("midiTitle").textContent = "";
    document.getElementById("composer").textContent = "";
    document.getElementById("maintainer").textContent = "";
    document.getElementById("license").textContent = "";
  }
}

function convert(ns, query) {
  // const options = {};
  // if (title) options.title = query.get("title");
  // if (composer) options.composer = query.get("composer");
  // const abcString = notesToAbc(ns, options);
  setMIDIInfo(query);
  const abcString = notesToAbc(ns);
  const textarea = document.getElementById("abc");
  textarea.value = abcString;
  resizeABC(textarea);
  initScore(abcString);
}

class CursorControl {
  constructor(root) {
    this.root = root;
    this.cursor = this.initCursor(root);
  }

  initCursor(root) {
    const cursor = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line",
    );
    cursor.setAttribute("class", "abcjs-cursor");
    cursor.setAttributeNS(null, "x1", 0);
    cursor.setAttributeNS(null, "y1", 0);
    cursor.setAttributeNS(null, "x2", 0);
    cursor.setAttributeNS(null, "y2", 0);
    root.appendChild(cursor);
    return cursor;
  }

  removeSelection() {
    const lastSelection = this.root.querySelectorAll(".abcjs-highlight");
    for (let k = 0; k < lastSelection.length; k++) {
      lastSelection[k].classList.remove("abcjs-highlight");
    }
  }

  onStart() {
  }

  onEvent(ev) {
    // This is called every time a note or a rest is reached and contains the coordinates of it.
    if (ev.measureStart && ev.left === null) {
      return; // this was the second part of a tie across a measure line. Just ignore it.
    }
    this.removeSelection();
    for (let i = 0; i < ev.elements.length; i++) {
      const note = ev.elements[i];
      for (let j = 0; j < note.length; j++) {
        note[j].classList.add("abcjs-highlight");
      }
    }
    this.cursor.setAttribute("x1", ev.left - 2);
    this.cursor.setAttribute("x2", ev.left - 2);
    this.cursor.setAttribute("y1", ev.top);
    this.cursor.setAttribute("y2", ev.top + ev.height);
  }

  onFinished() {
    this.removeSelection();
    this.cursor.setAttribute("x1", 0);
    this.cursor.setAttribute("x2", 0);
    this.cursor.setAttribute("y1", 0);
    this.cursor.setAttribute("y2", 0);
  }
}

function initScore(abcString) {
  if (synthControl) synthControl.pause();
  const score = document.getElementById("score");
  const player = document.getElementById("player");
  const visualOptions = { responsive: "resize" };
  const visualObj = ABCJS.renderAbc("score", abcString, visualOptions);
  if (visualObj[0].warnings) {
    document.getElementById("abcWarning").innerHTML = visualObj[0].warnings
      .join("<br>");
  } else {
    document.getElementById("abcWarning").innerHTML = "No errors";
    const cursorControl = new CursorControl(score.querySelector("svg"));
    if (ABCJS.synth.supportsAudio()) {
      const controlOptions = {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true,
        displayClock: true,
      };
      synthControl = new ABCJS.synth.SynthController();
      synthControl.load("#player", cursorControl, controlOptions);
      const midiBuffer = new ABCJS.synth.CreateSynth();
      midiBuffer.init({
        visualObj: visualObj[0],
        options: {},
      }).then(() => {
        synthControl.setTune(visualObj[0], true).then(() => {
          const inlineAudio = document.querySelector(".abcjs-inline-audio");
          inlineAudio.classList.remove("disabled");
        });
      });
    } else {
      player.innerHTML = `
  <div class="alert alert-warning">Audio is not supported on this browser.</div>
  `;
    }
  }
}

function initABCEditor() {
  const editorOptions = {
    paper_id: "score",
    warnings_id: "abcWarning",
    abcjsParams: { responsive: "resize" },
    // TODO: cursor does not works
    // synth: {
    //   el: "#player",
    //   cursorControl: cursorControl,
    //   options: controlOptions,
    // }
  };
  const textarea = document.getElementById("abc");
  textarea.value = "";
  textarea.setAttribute("autocorrect", "off");
  new ABCJS.Editor("abc", editorOptions);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);
}

function getCheckboxString(name, label) {
  const safeName = escapeHtml(name);
  const safeLabel = escapeHtml(label);
  return `
<div class="form-check form-check-inline">
  <label class="form-check-label">
    <input class="form-check-input" name="${safeName}" value="${safeLabel}" type="checkbox" checked>
    ${safeLabel}
  </label>
</div>`;
}

function setInstrumentsCheckbox() {
  const set = new Set();
  for (let i = 0; i < ns.notes.length; i++) {
    set.add(ns.notes[i].instrument);
  }
  const instrumentIds = [...set];
  const map = new Map();
  let str = "";
  for (let i = 0; i < instrumentIds.length; i++) {
    str += getCheckboxString("instrument", instrumentIds[i]);
    map.set(instrumentIds[i], true);
  }
  const doc = new DOMParser().parseFromString(str, "text/html");
  const node = document.getElementById("filterInstruments");
  node.replaceChildren(...doc.body.childNodes);
  const inputs = node.querySelectorAll("input");
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    input.addEventListener("change", (event) => {
      const instrumentId = parseInt(input.value);
      if (event.currentTarget.checked) {
        map.set(instrumentId, true);
      } else {
        map.set(instrumentId, false);
      }
      ns = cloneNoteSequence(nsCache);
      const filteredNotes = [];
      for (let i = 0; i < ns.notes.length; i++) {
        if (map.get(ns.notes[i].instrument)) filteredNotes.push(ns.notes[i]);
      }
      ns.notes = filteredNotes;
      convert(ns);
    });
  }
}

function setProgramsCheckbox() {
  const set = new Set();
  for (let i = 0; i < ns.notes.length; i++) {
    set.add(ns.notes[i].program);
  }
  const programIds = [...set];
  const map = new Map();
  let str = "";
  for (let i = 0; i < programIds.length; i++) {
    str += getCheckboxString("program", programIds[i]);
    map.set(programIds[i], true);
  }
  const doc = new DOMParser().parseFromString(str, "text/html");
  const node = document.getElementById("filterPrograms");
  node.replaceChildren(...doc.body.childNodes);
  const inputs = node.querySelectorAll("input");
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    input.addEventListener("change", (event) => {
      const programId = parseInt(input.value);
      if (event.currentTarget.checked) {
        map.set(programId, true);
      } else {
        map.set(programId, false);
      }
      ns = cloneNoteSequence(nsCache);
      const filteredNotes = [];
      for (let i = 0; i < ns.notes.length; i++) {
        if (map.get(ns.notes[i].program)) filteredNotes.push(ns.notes[i]);
      }
      ns.notes = filteredNotes;
      convert(ns);
    });
  }
}

function setToolbar() {
  setProgramsCheckbox();
  setInstrumentsCheckbox();
}

function resizeABC(textarea) {
  textarea.style.height = textarea.scrollHeight + 4 + "px";
}

function initQuery() {
  const query = new URLSearchParams();
  query.set("title", "When the Swallows Homeward Fly (Agathe)");
  query.set("composer", "Franz Wilhelm Abt");
  query.set("maintainer", "Stan Sanderson");
  query.set("license", "Public Domain");
  return query;
}

initABCEditor();
let ns;
let nsCache;
let synthControl;
if (location.search) {
  convertFromUrlParams();
} else {
  const query = initQuery();
  convertFromUrl("abt.mid", query);
}

document.getElementById("toggleDarkMode").onclick = toggleDarkMode;
document.getElementById("toggleABCPanel").onclick = toggleABCPanel;
document.ondragover = (e) => {
  e.preventDefault();
};
document.ondrop = dropFileEvent;
document.getElementById("inputFile").onchange = convertFileEvent;
document.getElementById("inputUrl").onchange = convertUrlEvent;
