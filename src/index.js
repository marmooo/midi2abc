import ABCJS from "https://cdn.jsdelivr.net/npm/abcjs@6.7.2/+esm";
import { Modal } from "https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/+esm";
import { MidiLibrary } from "https://marmooo.github.io/free-midi/midi-library.js";
import notesToAbc from "./midi2abc.js";
import { cloneNoteSequence, midiToNoteSequence } from "./parse-midi.js";

const MIDI_DB_MODERN = "https://midi-db.pages.dev";
const MIDI_DB_CLASSICAL = "https://marmooo.github.io/classical-midi-db";
/** Currently selected MIDI DB base URL (modern or classical). */
let currentMidiDb = MIDI_DB_MODERN;
const htmlLang = document.documentElement.lang || "en";

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

function convertFileEvent(event) {
  convertFromBlob(event.target.files[0]);
}

function toInfoQuery(row) {
  const query = new URLSearchParams();
  const fields = ["title", "composer", "maintainer", "web", "license"];
  for (let i = 0; i < fields.length; i++) {
    const value = row[fields[i]];
    if (value) query.set(fields[i], value);
  }
  return query;
}

/**
 * ?c=<siteId>&i=<index>（classical は &db=c）から曲を読み込む。
 * free-midi からの共有リンク専用（旧 ?url= は廃止）。
 */
async function convertFromUrlParams() {
  const query = new URLSearchParams(location.search);
  const collectionId = query.get("c");
  const index = Number.parseInt(query.get("i") ?? "", 10);
  if (!collectionId || !Number.isInteger(index) || index < 0) return;

  try {
    const dbBase = query.get("db") === "c" ? MIDI_DB_CLASSICAL : MIDI_DB_MODERN;
    const lang = ["ja", "en"].includes(htmlLang) ? htmlLang : "en";
    const listUrl = `${dbBase}/json/${
      encodeURIComponent(collectionId)
    }/${lang}.json`;
    const list = await (await fetch(listUrl)).json();
    const row = list[index];
    if (!row?.file) {
      throw new Error(`MIDI not found: ${collectionId}#${index}`);
    }

    const col = midiLibrary.collections?.get(collectionId);
    if (col) {
      if (!row.collection) row.collection = col.name;
      if (!row.composer && col.composer) row.composer = col.composer;
      if (!row.maintainer && col.maintainer) row.maintainer = col.maintainer;
      if (!row.web && col.web) row.web = col.web;
      if (!row.license && col.license) row.license = col.license;
    }

    if (dbBase !== midiLibrary.midiDB) {
      currentMidiDb = dbBase;
      midiLibrary.midiDB = dbBase;
    }

    const midiUrl = `${dbBase}/${row.file}`;
    ns = await urlToNoteSequence(midiUrl);
    nsCache = cloneNoteSequence(ns);
    setToolbar();
    convert(ns, toInfoQuery(row));
  } catch (error) {
    console.error("Failed to load MIDI from query:", error);
  }
}

async function convertFromBlob(file, query) {
  if (!file) return;
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

function toHttpURL(text) {
  try {
    const url = new URL(text);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch { /* not a valid URL */ }
  return null;
}

function createExternalLink(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

// Shows "title" and "composer · maintainer [license]" of the MIDI.
function setMIDIInfo(query) {
  const info = document.getElementById("midiInfo");
  const title = document.getElementById("title");
  const meta = document.getElementById("meta");
  meta.replaceChildren();
  if (!(query instanceof URLSearchParams)) {
    title.textContent = "";
    info.hidden = true;
    return;
  }
  const titleText = query.get("title") ?? "";
  const composer = query.get("composer") ?? "";
  const maintainer = query.get("maintainer") ?? "";
  const web = query.get("web") ?? "";
  const license = query.get("license") ?? "";

  const credits = [];
  if (composer) {
    const span = document.createElement("span");
    span.textContent = composer;
    credits.push(span);
  }
  if (maintainer) {
    const webURL = web ? toHttpURL(web) : null;
    if (webURL) {
      credits.push(createExternalLink(webURL, maintainer));
    } else {
      const span = document.createElement("span");
      span.textContent = maintainer;
      credits.push(span);
    }
  }
  for (let i = 0; i < credits.length; i++) {
    if (i > 0) meta.appendChild(document.createTextNode(" · "));
    meta.appendChild(credits[i]);
  }

  if (license) {
    const licenseURL = toHttpURL(license);
    let badge;
    if (licenseURL) {
      badge = createExternalLink(licenseURL, "License");
      badge.classList.add("text-decoration-none");
    } else {
      badge = document.createElement("span");
      badge.textContent = license;
    }
    badge.classList.add(
      "badge",
      "bg-body-secondary",
      "text-body",
      "border",
      "fw-normal",
    );
    if (credits.length > 0) badge.classList.add("ms-2");
    meta.appendChild(badge);
  }

  title.textContent = titleText;
  info.hidden = titleText === "" && meta.childNodes.length === 0;
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

// ---------------------------------------------------------------------------
// MIDI library（Bootstrap modal 内に MidiLibrary で一覧表示）
// ---------------------------------------------------------------------------

const libraryModal = Modal.getOrCreateInstance(
  document.getElementById("screenLibrary"),
);

const midiLibrary = new MidiLibrary({
  midiDB: currentMidiDb,
  table: "libraryTable",
  pagination: "libraryPagination",
  columns: "libraryColumns",
  collections: "libraryCollections",
  instruments: "libraryInstruments",
  lang: ["ja", "en"].includes(htmlLang) ? htmlLang : "en",
  onSelect: async (row) => {
    const midiUrl = `${midiLibrary.midiDB}/${row.file}`;
    ns = await urlToNoteSequence(midiUrl);
    nsCache = cloneNoteSequence(ns);
    setToolbar();
    convert(ns, toInfoQuery(row));
    libraryModal.hide();
  },
});
midiLibrary.load();

/** Switch MIDI library between modern and classical collections. */
let switchMidiCategoryBusy = false;
async function switchMidiCategory(category) {
  const nextDb = category === "classical" ? MIDI_DB_CLASSICAL : MIDI_DB_MODERN;
  if (midiLibrary.midiDB === nextDb && midiLibrary.fullData) return;
  if (switchMidiCategoryBusy) return;
  switchMidiCategoryBusy = true;
  try {
    currentMidiDb = nextDb;
    midiLibrary.midiDB = nextDb;
    midiLibrary.collections.clear();
    midiLibrary.fullData = null;
    midiLibrary.destroy();
    await midiLibrary.load();
  } catch (err) {
    console.error("Failed to switch MIDI category:", err);
  } finally {
    switchMidiCategoryBusy = false;
  }
}

function initMidiCategoryRadios() {
  const radios = document.querySelectorAll('input[name="midiLibraryCategory"]');
  for (const radio of radios) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      switchMidiCategory(radio.value).catch((err) =>
        console.error("switchMidiCategory failed:", err)
      );
    });
  }
}
initMidiCategoryRadios();

// ?c=&i= があればそれを優先、なければデモ曲
if (new URLSearchParams(location.search).has("c")) {
  convertFromUrlParams();
} else {
  const query = initQuery();
  convertFromUrl("abt.mid", query);
}

document.getElementById("toggleDarkMode").onclick = toggleDarkMode;
document.getElementById("toggleABCPanel").onclick = toggleABCPanel;
document.getElementById("selectFile").onclick = () => {
  document.getElementById("inputFile").click();
};
document.getElementById("inputFile").onchange = convertFileEvent;

// ドラッグ＆ドロップは selectPanel 上のみ（midi2audio と同じ）
const selectPanel = document.getElementById("selectPanel");
let dragN = 0;
selectPanel.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragN++;
  selectPanel.classList.add("drag-active");
});
selectPanel.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dragN--;
  if (dragN <= 0) {
    dragN = 0;
    selectPanel.classList.remove("drag-active");
  }
});
selectPanel.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});
selectPanel.addEventListener("drop", (e) => {
  e.preventDefault();
  dragN = 0;
  selectPanel.classList.remove("drag-active");
  const file = e.dataTransfer.files[0];
  if (file) convertFromBlob(file);
});
