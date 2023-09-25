import tone2abc from "./midi2abc.js";

function loadConfig() {
  if (localStorage.getItem("darkMode") == 1) {
    document.documentElement.setAttribute("data-bs-theme", "dark");
  }
}

function toggleDarkMode() {
  if (localStorage.getItem("darkMode") == 1) {
    localStorage.setItem("darkMode", 0);
    document.documentElement.setAttribute("data-bs-theme", "light");
  } else {
    localStorage.setItem("darkMode", 1);
    document.documentElement.setAttribute("data-bs-theme", "dark");
  }
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
  ns = await core.urlToNoteSequence(query.get("url"));
  nsCache = core.sequences.clone(ns);
  setToolbar();
  convert(ns, query);
}

async function convertFromBlob(file, query) {
  ns = await core.blobToNoteSequence(file);
  nsCache = core.sequences.clone(ns);
  setToolbar();
  convert(ns, query);
}

async function convertFromUrl(midiUrl, query) {
  ns = await core.urlToNoteSequence(midiUrl);
  nsCache = core.sequences.clone(ns);
  setToolbar();
  convert(ns, query);
}

function setMIDIInfo(query) {
  if (!(query instanceof URLSearchParams)) return;
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
}

function convert(ns, query) {
  // const options = {};
  // if (title) options.title = query.get("title");
  // if (composer) options.composer = query.get("composer");
  // const abcString = tone2abc(ns, options);
  setMIDIInfo(query);
  const abcString = tone2abc(ns);
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

function getCheckboxString(name, label) {
  return `
<div class="form-check form-check-inline">
  <label class="form-check-label">
    <input class="form-check-input" name="${name}" value="${label}" type="checkbox" checked>
    ${label}
  </label>
</div>`;
}

function setInstrumentsCheckbox() {
  const set = new Set();
  ns.notes.forEach((note) => {
    set.add(note.instrument);
  });
  const map = new Map();
  let str = "";
  set.forEach((instrumentId) => {
    str += getCheckboxString("instrument", instrumentId);
    map.set(instrumentId, true);
  });
  const doc = new DOMParser().parseFromString(str, "text/html");
  const node = document.getElementById("filterInstruments");
  node.replaceChildren(...doc.body.childNodes);
  [...node.querySelectorAll("input")].forEach((input) => {
    input.addEventListener("change", (event) => {
      const instrumentId = parseInt(input.value);
      if (event.currentTarget.checked) {
        map.set(instrumentId, true);
      } else {
        map.set(instrumentId, false);
      }
      ns = core.sequences.clone(nsCache);
      ns.notes = ns.notes.filter((note) => map.get(note.instrument));
      convert(ns);
    });
  });
}

function setProgramsCheckbox() {
  const set = new Set();
  ns.notes.forEach((note) => {
    set.add(note.program);
  });
  const map = new Map();
  let str = "";
  set.forEach((programId) => {
    str += getCheckboxString("program", programId);
    map.set(programId, true);
  });
  const doc = new DOMParser().parseFromString(str, "text/html");
  const node = document.getElementById("filterPrograms");
  node.replaceChildren(...doc.body.childNodes);
  [...node.querySelectorAll("input")].forEach((input) => {
    input.addEventListener("change", (event) => {
      const programId = parseInt(input.value);
      if (event.currentTarget.checked) {
        map.set(programId, true);
      } else {
        map.set(programId, false);
      }
      ns = core.sequences.clone(nsCache);
      ns.notes = ns.notes.filter((note) => map.get(note.program));
      convert(ns);
    });
  });
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

loadConfig();
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
