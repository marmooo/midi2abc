import tone2abc from"./midi2abc.js";function loadConfig(){localStorage.getItem("darkMode")==1&&(document.documentElement.dataset.theme="dark")}function toggleDarkMode(){localStorage.getItem("darkMode")==1?(localStorage.setItem("darkMode",0),delete document.documentElement.dataset.theme):(localStorage.setItem("darkMode",1),document.documentElement.dataset.theme="dark")}function toggleABCPanel(){document.getElementById("abcRow").classList.toggle("d-none"),document.getElementById("abcColumn").classList.toggle("d-none"),document.getElementById("abc").parentNode.parentNode.classList.toggle("row");const a=document.getElementById("abc");resizeABC(a)}function dropFileEvent(a){a.preventDefault();const b=a.dataTransfer.files[0],c=new DataTransfer;c.items.add(b);const d=document.getElementById("inputFile");d.files=c.files,convertFromBlob(b)}function convertFileEvent(a){convertFromBlob(a.target.files[0])}function convertUrlEvent(a){convertFromUrl(a.target.value)}async function convertFromUrlParams(){const a=new URLSearchParams(location.search);ns=await core.urlToNoteSequence(a.get("url")),nsCache=core.sequences.clone(ns),setToolbar(),convert(ns,a.get("title"),a.get("composer"))}async function convertFromBlob(a){ns=await core.blobToNoteSequence(a),nsCache=core.sequences.clone(ns),setToolbar();const b=a.name;convert(ns,b)}async function convertFromUrl(a){ns=await core.urlToNoteSequence(a),nsCache=core.sequences.clone(ns),setToolbar();const b=a.split("/").at(-1);convert(ns,b)}class CursorControl{constructor(a){this.root=a,this.cursor=this.initCursor(a)}initCursor(b){const a=document.createElementNS("http://www.w3.org/2000/svg","line");return a.setAttribute("class","abcjs-cursor"),a.setAttributeNS(null,"x1",0),a.setAttributeNS(null,"y1",0),a.setAttributeNS(null,"x2",0),a.setAttributeNS(null,"y2",0),b.appendChild(a),a}removeSelection(){const a=this.root.querySelectorAll(".abcjs-highlight");for(let b=0;b<a.length;b++)a[b].classList.remove("abcjs-highlight")}onStart(){}onEvent(a){if(a.measureStart&&a.left===null)return;this.removeSelection();for(let b=0;b<a.elements.length;b++){const c=a.elements[b];for(let a=0;a<c.length;a++)c[a].classList.add("abcjs-highlight")}this.cursor.setAttribute("x1",a.left-2),this.cursor.setAttribute("x2",a.left-2),this.cursor.setAttribute("y1",a.top),this.cursor.setAttribute("y2",a.top+a.height)}onFinished(){this.removeSelection(),this.cursor.setAttribute("x1",0),this.cursor.setAttribute("x2",0),this.cursor.setAttribute("y1",0),this.cursor.setAttribute("y2",0)}}function initScore(b){synthControl&&synthControl.pause();const c=document.getElementById("score"),d=document.getElementById("player"),e={responsive:"resize"},a=ABCJS.renderAbc("score",b,e),f=new CursorControl(c.querySelector("svg"));if(ABCJS.synth.supportsAudio()){const b={displayLoop:!0,displayRestart:!0,displayPlay:!0,displayProgress:!0,displayWarp:!0,displayClock:!0};synthControl=new ABCJS.synth.SynthController,synthControl.load("#player",f,b);const c=new ABCJS.synth.CreateSynth;c.init({visualObj:a[0],options:{}}).then(()=>{synthControl.setTune(a[0],!0).then(()=>{const a=document.querySelector(".abcjs-inline-audio");a.classList.remove("disabled")})})}else d.innerHTML=`
<div class="alert alert-warning">Audio is not supported on this browser.</div>
`}function initABCEditor(){const b={paper_id:"score",warnings_id:"abcWarning",abcjsParams:{responsive:"resize"}},a=document.getElementById("abc");a.value="",a.setAttribute("autocorrect","off"),new ABCJS.Editor("abc",b)}function getCheckboxString(b,a){return`
<div class="form-check form-check-inline">
  <label class="form-check-label">
    <input class="form-check-input" name="${b}" value="${a}" type="checkbox" checked>
    ${a}
  </label>
</div>`}function setInstrumentsCheckbox(){const b=new Set;ns.notes.forEach(a=>{b.add(a.instrument)});const a=new Map;let c="";b.forEach(b=>{c+=getCheckboxString("instrument",b),a.set(b,!0)});const e=(new DOMParser).parseFromString(c,"text/html"),d=document.getElementById("filterInstruments");d.replaceChildren(...e.body.childNodes),[...d.querySelectorAll("input")].forEach(b=>{b.addEventListener("change",d=>{const c=parseInt(b.value);d.currentTarget.checked?a.set(c,!0):a.set(c,!1),ns=core.sequences.clone(nsCache),ns.notes=ns.notes.filter(b=>a.get(b.instrument)),convert(ns)})})}function setProgramsCheckbox(){const b=new Set;ns.notes.forEach(a=>{b.add(a.program)});const a=new Map;let c="";b.forEach(b=>{c+=getCheckboxString("program",b),a.set(b,!0)});const e=(new DOMParser).parseFromString(c,"text/html"),d=document.getElementById("filterPrograms");d.replaceChildren(...e.body.childNodes),[...d.querySelectorAll("input")].forEach(b=>{b.addEventListener("change",d=>{const c=parseInt(b.value);d.currentTarget.checked?a.set(c,!0):a.set(c,!1),ns=core.sequences.clone(nsCache),ns.notes=ns.notes.filter(b=>a.get(b.program)),convert(ns)})})}function setToolbar(){setProgramsCheckbox(),setInstrumentsCheckbox()}function resizeABC(a){a.style.height=a.scrollHeight+4+"px"}function convert(d,b,c){const a={};b&&(a.title=b),c&&(a.composer=c);const e=tone2abc(d,a);document.getElementById("abc").value=e,updateScore()}function updateScore(){const a=document.getElementById("abc");resizeABC(a),initScore(a.value)}loadConfig(),initABCEditor();let ns,nsCache,synthControl;location.search?convertFromUrlParams():convertFromUrl("abt.mid"),document.getElementById("toggleDarkMode").onclick=toggleDarkMode,document.getElementById("toggleABCPanel").onclick=toggleABCPanel,document.ondragover=a=>{a.preventDefault()},document.ondrop=dropFileEvent,document.getElementById("abc").onchange=updateScore,document.getElementById("inputFile").onchange=convertFileEvent,document.getElementById("inputUrl").onchange=convertUrlEvent