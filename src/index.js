import tone2abc from "./midi2abc.js";

function loadConfig() {
  if (localStorage.getItem("darkMode") == 1) {
    document.documentElement.dataset.theme = "dark";
  }
}

function toggleDarkMode() {
  if (localStorage.getItem("darkMode") == 1) {
    localStorage.setItem("darkMode", 0);
    delete document.documentElement.dataset.theme;
  } else {
    localStorage.setItem("darkMode", 1);
    document.documentElement.dataset.theme = "dark";
  }
}

function toggleABCPanel() {
  document.getElementById("abcRow").classList.toggle("d-none");
  document.getElementById("abcColumn").classList.toggle("d-none");
  document.getElementById("abc").parentNode.classList.toggle("col-xl");
  const editor = document.getElementById("abc");
  resizeABC(editor);
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

function resizeABC(editor) {
  editor.style.height = editor.scrollHeight + 4 + "px";
}

async function convertFromBlob(file) {
  const ns = await core.blobToNoteSequence(file);
  const abcString = tone2abc(ns, { title: file.name });
  const editor = document.getElementById("abc");
  editor.value = abcString;
  resizeABC(editor);
  initScore(abcString);
}

async function convertFromUrl(midiUrl) {
  const ns = await core.urlToNoteSequence(midiUrl);
  const abcString = tone2abc(ns, { title: midiUrl.split("/").at(-1) });
  const editor = document.getElementById("abc");
  editor.value = abcString;
  resizeABC(editor);
  initScore(abcString);
}

loadConfig();
let synthControl;
convertFromUrl("cooleys.mid");

document.getElementById("toggleDarkMode").onclick = toggleDarkMode;
document.getElementById("toggleABCPanel").onclick = toggleABCPanel;
document.ondragover = (e) => {
  e.preventDefault();
};
document.ondrop = dropFileEvent;
document.getElementById("inputFile").onchange = convertFileEvent;
document.getElementById("inputUrl").onchange = convertUrlEvent;
