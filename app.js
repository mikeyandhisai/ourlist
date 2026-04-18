import { auth, db } from “./firebase-config.js”;
import {
createUserWithEmailAndPassword,
signInWithEmailAndPassword,
onAuthStateChanged,
signOut
} from “https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js”;
import {
doc, setDoc, getDoc, collection,
addDoc, deleteDoc, updateDoc,
onSnapshot, query, where
} from “https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js”;

const CATEGORIES = [
{ id: “movies”,      label: “Movies & Shows”, emoji: “🎬”, color: “#E8425A”, light: “#FFEEF1” },
{ id: “restaurants”, label: “Eats & Drinks”,  emoji: “🍜”, color: “#F07D1A”, light: “#FFF4E8” },
{ id: “places”,      label: “Places to Go”,   emoji: “🗺️”, color: “#2AA87E”, light: “#E8FAF3” },
{ id: “books”,       label: “Books to Read”,  emoji: “📚”, color: “#4B7FCC”, light: “#EBF2FF” },
{ id: “activities”,  label: “Things to Do”,   emoji: “🎉”, color: “#9055C9”, light: “#F4EEFF” },
];

const STICKY = [”#FFF9B0”,”#FFD5DC”,”#D8F5E8”,”#D5E8FF”,”#F5D5FF”,”#FFE5C4”,”#D5EFFF”,”#FFF0D5”];

// ── Inject global styles once ──
(function injectStyles() {
const s = document.createElement(“style”);
s.textContent = `
* { box-sizing: border-box; }
body { margin: 0; padding: 0; }
@keyframes pop { 0%{transform:scale(1)} 50%{transform:scale(1.15)} 100%{transform:scale(1)} }
@keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@keyframes spin-text { 0%,100%{opacity:0.3} 50%{opacity:1} }
@keyframes wheelSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(1800deg)} }
.card-item { animation: fadeIn 0.3s ease; transition: transform 0.2s, box-shadow 0.2s; }
.card-item:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.14) !important; }
button { font-family: ‘Nunito’, sans-serif; }
input  { font-family: ‘Nunito’, sans-serif; }

```
/* ── Mobile-first layout ── */
#main-layout { display: flex; flex-direction: column; min-height: 100vh; }

/* Bottom nav on mobile */
#bottom-nav {
  display: flex;
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: white;
  border-top: 2px solid #F0E4D4;
  z-index: 200;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
#bottom-nav button {
  flex: 1;
  min-width: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 4px 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 10px;
  font-weight: 800;
  gap: 2px;
  transition: background 0.2s;
}
#bottom-nav button span.nav-emoji { font-size: 20px; }
#bottom-nav button.active { background: #FFF8F0; }

/* Desktop sidebar (hidden on mobile) */
#sidebar {
  display: none;
  width: 190px;
  background: white;
  border-right: 2px dashed #F0E4D4;
  padding: 20px 10px;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

#main-content { flex: 1; padding: 16px 14px 100px; overflow-y: auto; }

/* Wheel canvas sizing */
#wheel-canvas { max-width: 260px; width: 100%; height: auto; touch-action: none; }

@media (min-width: 700px) {
  #bottom-nav { display: none; }
  #sidebar { display: flex; }
  #main-layout { flex-direction: row; }
  #main-content { padding: 24px 24px 24px; }
}
```

`;
document.head.appendChild(s);
const lnk = document.createElement(“link”);
lnk.href = “https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800;900&display=swap”;
lnk.rel = “stylesheet”;
document.head.appendChild(lnk);
})();

// ── State ──
let currentUser = null, pairId = null;
let activeCat = “movies”, filter = “todo”;
let items = [], unsubscribe = null;
let pickedText = null, wheelSpinning = false;
let wheelAnimId = null, wheelAngle = 0;

// ── Root render ──
function render() {
const app = document.getElementById(“app”);
if (!currentUser)    { app.innerHTML = renderAuth(); attachAuthEvents(); return; }
if (!pairId)         { app.innerHTML = renderPair(); attachPairEvents(); return; }
app.innerHTML = renderMain();
attachMainEvents();
drawWheel();
}

// ════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════
function renderAuth() {
return `

  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:#FFF8F0;">
    <div style="background:white;border-radius:24px;padding:32px 28px;box-shadow:0 8px 40px rgba(0,0,0,0.10);max-width:400px;width:100%;text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;">✨</div>
      <h1 style="font-family:'Fredoka One',cursive;font-size:34px;color:#E8425A;margin:0 0 4px;">OurList</h1>
      <p style="color:#AAA;font-weight:700;margin:0 0 24px;">Your shared bucket list 🫶</p>
      <div style="display:flex;border-radius:12px;overflow:hidden;border:2px solid #EEE;margin-bottom:20px;">
        <button id="tab-login"  onclick="window._switchTab('login')"  style="flex:1;padding:10px;border:none;background:#E8425A;color:white;font-weight:800;font-size:14px;cursor:pointer;">Log In</button>
        <button id="tab-signup" onclick="window._switchTab('signup')" style="flex:1;padding:10px;border:none;background:white;color:#AAA;font-weight:800;font-size:14px;cursor:pointer;">Sign Up</button>
      </div>
      <input id="auth-email" type="email" placeholder="Email" style="${inp()}margin-bottom:10px;width:100%;"/>
      <input id="auth-pass" type="password" placeholder="Password (min 6 chars)" style="${inp()}margin-bottom:16px;width:100%;"/>
      <button id="auth-btn" data-mode="login" style="${btn("#E8425A")}width:100%;padding:12px;font-size:15px;margin-bottom:12px;">Log In</button>
      <p id="auth-msg" style="color:#E8425A;font-size:13px;font-weight:700;min-height:18px;"></p>
    </div>
  </div>`;
}

window._switchTab = (tab) => {
const isLogin = tab === “login”;
document.getElementById(“auth-btn”).textContent = isLogin ? “Log In” : “Create Account”;
document.getElementById(“auth-btn”).dataset.mode = tab;
document.getElementById(“tab-login”).style.cssText  = `flex:1;padding:10px;border:none;background:${isLogin?"#E8425A":"white"};color:${isLogin?"white":"#AAA"};font-weight:800;font-size:14px;cursor:pointer;`;
document.getElementById(“tab-signup”).style.cssText = `flex:1;padding:10px;border:none;background:${!isLogin?"#E8425A":"white"};color:${!isLogin?"white":"#AAA"};font-weight:800;font-size:14px;cursor:pointer;`;
};

function attachAuthEvents() {
const doAuth = async () => {
const email = document.getElementById(“auth-email”).value.trim();
const pass  = document.getElementById(“auth-pass”).value;
const mode  = document.getElementById(“auth-btn”).dataset.mode;
const msg   = document.getElementById(“auth-msg”);
msg.textContent = “”;
try {
if (mode === “signup”) await createUserWithEmailAndPassword(auth, email, pass);
else await signInWithEmailAndPassword(auth, email, pass);
} catch(e) { msg.textContent = friendlyError(e.code); }
};
document.getElementById(“auth-btn”).onclick = doAuth;
document.getElementById(“auth-pass”).addEventListener(“keydown”, e => { if (e.key===“Enter”) doAuth(); });
}

// ════════════════════════════════════════════
// PAIR
// ════════════════════════════════════════════
function renderPair() {
return `

  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:#FFF8F0;">
    <div style="background:white;border-radius:24px;padding:32px 28px;box-shadow:0 8px 40px rgba(0,0,0,0.10);max-width:440px;width:100%;text-align:center;">
      <div style="font-size:44px;margin-bottom:8px;">🫶</div>
      <h2 style="font-family:'Fredoka One',cursive;font-size:26px;color:#E8425A;margin:0 0 6px;">Connect with your partner</h2>
      <p style="color:#BBB;font-weight:700;font-size:13px;margin:0 0 24px;">${currentUser.email}</p>

```
  <div style="background:#FFF8F0;border-radius:16px;padding:18px;margin-bottom:14px;text-align:left;">
    <p style="font-weight:900;color:#AAA;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">CREATE A NEW SHARED LIST</p>
    <button id="create-pair-btn" style="${btn("#E8425A")}width:100%;padding:12px;">✨ Create & Get Invite Code</button>
    <div id="pair-created-box" style="display:none;margin-top:14px;background:white;border-radius:12px;padding:14px;border:2px solid #E8425A;text-align:center;">
      <p style="margin:0 0 6px;font-weight:700;font-size:13px;color:#888;">Share this code with your partner:</p>
      <div id="pair-code-display" style="font-family:'Fredoka One',cursive;font-size:52px;letter-spacing:10px;color:#E8425A;margin:8px 0;"></div>
      <p style="margin:0;font-size:12px;color:#BBB;font-weight:700;">They paste it in the "Join" box below</p>
    </div>
  </div>

  <div style="background:#F0F8FF;border-radius:16px;padding:18px;text-align:left;">
    <p style="font-weight:900;color:#AAA;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">JOIN WITH AN INVITE CODE</p>
    <input id="pair-code-input" placeholder="Enter 4-digit code" type="number" maxlength="4"
      style="${inp()}width:100%;margin-bottom:10px;font-size:24px;text-align:center;letter-spacing:8px;font-family:'Fredoka One',cursive;"/>
    <button id="join-pair-btn" style="${btn("#4B7FCC")}width:100%;padding:12px;">🔗 Join Shared List</button>
  </div>

  <p id="pair-msg" style="color:#E8425A;font-weight:700;font-size:13px;margin-top:14px;min-height:18px;"></p>
  <button onclick="window._doSignOut()" style="margin-top:8px;background:none;border:none;color:#CCC;font-size:12px;cursor:pointer;font-weight:700;">Sign out</button>
</div>
```

  </div>`;
}

function attachPairEvents() {
document.getElementById(“create-pair-btn”).onclick = async () => {
// Generate a 4-digit numeric code
const code = String(Math.floor(1000 + Math.random() * 9000));
const ref = doc(db, “pairs”, code);
const existing = await getDoc(ref);
// If code collides, just regenerate (very rare)
const finalCode = existing.exists() ? String(Math.floor(1000 + Math.random() * 9000)) : code;
await setDoc(doc(db, “pairs”, finalCode), { members: [currentUser.uid], createdAt: Date.now() });
await setDoc(doc(db, “users”, currentUser.uid), { pairId: finalCode });

```
document.getElementById("pair-code-display").textContent = finalCode;
document.getElementById("pair-created-box").style.display = "block";
document.getElementById("create-pair-btn").style.display = "none";

// Auto-enter after 3000 seconds (as you set)
setTimeout(async () => {
  pairId = finalCode;
  subscribeItems();
  render();
}, 3000 * 1000);
```

};

document.getElementById(“join-pair-btn”).onclick = async () => {
const code = document.getElementById(“pair-code-input”).value.trim();
if (code.length !== 4) {
document.getElementById(“pair-msg”).textContent = “❌ Please enter the full 4-digit code.”;
return;
}
const pairRef = doc(db, “pairs”, code);
const snap = await getDoc(pairRef);
if (!snap.exists()) {
document.getElementById(“pair-msg”).textContent = “❌ Code not found. Double-check with your partner!”;
return;
}
const members = snap.data().members || [];
if (!members.includes(currentUser.uid)) {
await updateDoc(pairRef, { members: […members, currentUser.uid] });
}
await setDoc(doc(db, “users”, currentUser.uid), { pairId: code });
pairId = code;
subscribeItems();
render();
};
}

// ════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════
function renderMain() {
const cat  = CATEGORIES.find(c => c.id === activeCat);
const todo = items.filter(i => !i.done).length;
const done = items.filter(i =>  i.done).length;
const displayed = items.filter(i =>
filter===“all” ? true : filter===“done” ? i.done : !i.done
);

// Bottom nav (mobile)
const bottomNav = CATEGORIES.map(c => ` <button class="${c.id===activeCat?"active":""}" data-cat="${c.id}" style="color:${c.id===activeCat?c.color:"#AAA"};"> <span class="nav-emoji">${c.emoji}</span> <span>${c.label.split(" ")[0]}</span> </button>`).join(””);

// Sidebar (desktop)
const sidebarBtns = CATEGORIES.map(c => ` <button class="cat-btn" data-cat="${c.id}" style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:12px;border:none;cursor:pointer; text-align:left;font-size:13px;font-weight:${c.id===activeCat?800:600}; color:${c.id===activeCat?c.color:"#888"}; background:${c.id===activeCat?c.light:"transparent"}; border-left:4px solid ${c.id===activeCat?c.color:"transparent"}; transition:all 0.2s;width:100%;"> <span style="font-size:17px;">${c.emoji}</span> <span style="flex:1;">${c.label}</span> </button>`).join(””);

// Cards
const cards = displayed.map(item => ` <div class="card-item" style="background:${item.done?"#F7F5F2":STICKY[item.colorIdx%STICKY.length]}; border-radius:16px;padding:14px 16px; box-shadow:0 3px 12px rgba(0,0,0,0.08); opacity:${item.done?0.72:1};"> <div style="display:flex;align-items:flex-start;gap:10px;"> <button data-toggle="${item.id}" style="width:24px;height:24px;min-width:24px;border-radius:7px; border:2.5px solid ${item.done?cat.color:cat.color+"88"}; background:${item.done?cat.color:"white"}; cursor:pointer;display:flex;align-items:center;justify-content:center; color:white;font-weight:900;font-size:13px; animation:${item.done?"pop 0.3s ease":"none"};"> ${item.done?"✓":""} </button> <div style="flex:1;min-width:0;"> <p style="margin:0;font-weight:700;font-size:14px; text-decoration:${item.done?"line-through":"none"}; color:${item.done?"#BBB":"#333"}; line-height:1.45;word-break:break-word;">${item.text}</p> ${item.note?`<p style=“margin:5px 0 0;font-size:11px;color:${item.done?”#CCC”:”#999”};font-weight:600;font-style:italic;”>${item.note}</p>`:""} ${item.done?`<p style="margin:8px 0 0;font-size:11px;color:${cat.color}99;font-weight:800;">✅ Done!</p>`:""} <p style="margin:6px 0 0;font-size:10px;color:#CCC;font-weight:600;">Added by ${item.addedBy||"you"}</p> </div> <button data-delete="${item.id}" style="background:none;border:none;cursor:pointer;color:#DDD;font-size:20px; padding:0 0 0 6px;font-weight:700;line-height:1;flex-shrink:0;transition:color 0.2s;" onmouseenter="this.style.color='#E8425A'" onmouseleave="this.style.color='#DDD'" title="Delete item">×</button> </div> </div>`).join(””);

return `

  <div id="main-layout" style="background:#FFF8F0;">

```
<!-- Header -->
<header style="background:linear-gradient(135deg,${cat.color},${cat.color}CC);
               padding:12px 16px;display:flex;align-items:center;justify-content:space-between;
               box-shadow:0 4px 16px rgba(0,0,0,0.12);position:sticky;top:0;z-index:150;">
  <div style="display:flex;align-items:center;gap:10px;">
    <span style="font-size:26px;">✨</span>
    <div>
      <h1 style="font-family:'Fredoka One',cursive;font-size:22px;color:white;margin:0;line-height:1;">OurList</h1>
      <p style="font-size:11px;color:rgba(255,255,255,0.85);font-weight:700;margin:0;">Your shared bucket list 🫶</p>
    </div>
  </div>
  <button id="logout-btn"
    style="background:rgba(255,255,255,0.2);border:none;border-radius:20px;
           padding:6px 14px;color:white;font-weight:800;font-size:12px;cursor:pointer;">
    Sign Out
  </button>
</header>

<!-- Desktop sidebar -->
<aside id="sidebar">
  <p style="font-size:10px;font-weight:900;color:#C4B0A0;letter-spacing:2.5px;text-transform:uppercase;margin:0 0 10px 8px;">Lists</p>
  ${sidebarBtns}
  <div style="margin-top:auto;padding:14px 8px 0;border-top:2px dashed #F0E4D4;">
    <p style="font-size:11px;color:#C4B0A0;font-weight:700;text-align:center;line-height:1.5;">🔄 Live sync with your partner</p>
  </div>
</aside>

<!-- Main content -->
<main id="main-content">

  <!-- Cat heading -->
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
    <span style="font-size:36px;">${cat.emoji}</span>
    <div>
      <h2 style="font-family:'Fredoka One',cursive;font-size:24px;color:${cat.color};margin:0;">${cat.label}</h2>
      <p style="margin:0;font-size:13px;color:#AAA;font-weight:700;">${todo} to do · ${done} done</p>
    </div>
  </div>

  <!-- ── SPIN WHEEL PICKER ── -->
  <div style="background:white;border-radius:18px;padding:16px;margin-bottom:18px;box-shadow:0 2px 14px rgba(0,0,0,0.06);">
    <p style="margin:0 0 12px;font-weight:900;font-size:13px;color:#777;">🎡 Spin the wheel — let fate decide!</p>
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
      <div style="position:relative;display:inline-block;">
        <canvas id="wheel-canvas" width="260" height="260"></canvas>
        <!-- Pointer -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                    width:0;height:0;
                    border-left:10px solid transparent;
                    border-right:10px solid transparent;
                    border-bottom:22px solid #333;
                    margin-top:-130px;">
        </div>
        <!-- Center dot -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                    width:18px;height:18px;border-radius:50%;background:white;
                    border:3px solid #333;z-index:10;">
        </div>
      </div>
      <button id="spin-btn"
        style="${btn(cat.color)}padding:12px 28px;font-size:15px;border-radius:16px;
               box-shadow:0 4px 12px ${cat.color}55;">
        🎰 Spin!
      </button>
      <div id="spin-result" style="display:none;background:${cat.light};border:2px solid ${cat.color};
           border-radius:14px;padding:12px 20px;text-align:center;
           font-weight:900;font-size:15px;color:${cat.color};max-width:260px;width:100%;">
      </div>
    </div>
  </div>

  <!-- Add -->
  <div style="background:white;border-radius:18px;padding:16px;margin-bottom:18px;box-shadow:0 2px 14px rgba(0,0,0,0.06);">
    <p style="margin:0 0 12px;font-weight:900;font-size:13px;color:#777;">➕ Add something new</p>
    <div style="display:flex;gap:8px;margin-bottom:8px;">
      <input id="add-input" placeholder="What do you want to add?" style="${inp()}flex:1;"/>
      <button id="add-btn" style="${btn(cat.color)}">Add ✦</button>
    </div>
    <input id="note-input" placeholder="📝 Optional note (e.g. 'on Netflix')" style="${inp()}width:100%;"/>
  </div>

  <!-- Filters -->
  <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;">
    ${[["todo",`⏳ To Do (${todo})`],["done",`✅ Done (${done})`],["all",`📋 All (${items.length})`]].map(([f,label])=>`
      <button class="filter-btn" data-filter="${f}"
        style="padding:7px 14px;border-radius:20px;
               border:2px solid ${filter===f?cat.color:"#EEE"};
               background:${filter===f?cat.color:"white"};
               color:${filter===f?"white":"#888"};
               font-weight:800;font-size:13px;cursor:pointer;">${label}</button>`).join("")}
  </div>

  <!-- Cards grid -->
  ${displayed.length===0?`
    <div style="text-align:center;padding:50px 0;color:#CCC;">
      <div style="font-size:48px;margin-bottom:12px;">${filter==="done"?"🏆":"🌱"}</div>
      <p style="font-weight:800;font-size:15px;">
        ${filter==="done"?"Nothing done yet — get going! 🚀":"Add something above to get started."}
      </p>
    </div>`:
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">${cards}</div>`}
</main>

<!-- Mobile bottom nav -->
<nav id="bottom-nav">${bottomNav}</nav>
```

  </div>`;
}

function attachMainEvents() {
const cat = CATEGORIES.find(c => c.id === activeCat);

document.getElementById(“logout-btn”).onclick = () => { window._doSignOut(); };
document.getElementById(“spin-btn”).onclick = () => spinWheel();
document.getElementById(“add-btn”).onclick = addItem;
document.getElementById(“add-input”).addEventListener(“keydown”, e => { if(e.key===“Enter”) addItem(); });

document.querySelectorAll(”.cat-btn, #bottom-nav button”).forEach(b => {
b.onclick = () => { activeCat = b.dataset.cat; filter=“todo”; pickedText=null; subscribeItems(); render(); };
});
document.querySelectorAll(”.filter-btn”).forEach(b => {
b.onclick = () => { filter = b.dataset.filter; render(); };
});
document.querySelectorAll(”[data-toggle]”).forEach(b => {
b.onclick = () => toggleDone(b.dataset.toggle);
});
document.querySelectorAll(”[data-delete]”).forEach(b => {
b.onclick = () => {
if (confirm(`Delete "${items.find(i=>i.id===b.dataset.delete)?.text}"?`)) removeItem(b.dataset.delete);
};
});
}

// ════════════════════════════════════════════
// SPIN WHEEL
// ════════════════════════════════════════════
function drawWheel(angle = 0) {
const canvas = document.getElementById(“wheel-canvas”);
if (!canvas) return;
const ctx = canvas.getContext(“2d”);
const pool = items.filter(i => !i.done);
const cx = canvas.width / 2, cy = canvas.height / 2, r = cx - 10;

ctx.clearRect(0, 0, canvas.width, canvas.height);

if (pool.length === 0) {
// Empty state
ctx.beginPath();
ctx.arc(cx, cy, r, 0, 2*Math.PI);
ctx.fillStyle = “#F5F5F5”;
ctx.fill();
ctx.strokeStyle = “#DDD”;
ctx.lineWidth = 3;
ctx.stroke();
ctx.fillStyle = “#CCC”;
ctx.font = “bold 13px Nunito, sans-serif”;
ctx.textAlign = “center”;
ctx.textBaseline = “middle”;
ctx.fillText(“Add to-do items”, cx, cy-10);
ctx.fillText(“to spin the wheel!”, cx, cy+10);
return;
}

const slice = (2 * Math.PI) / pool.length;
const cat = CATEGORIES.find(c => c.id === activeCat);
const baseColor = cat?.color || “#E8425A”;

// Generate shades for segments
const colors = pool.map((_, i) => {
const ratio = i / pool.length;
return shiftColor(baseColor, ratio);
});

pool.forEach((item, i) => {
const start = angle + i * slice - Math.PI/2;
const end   = start + slice;

```
// Segment
ctx.beginPath();
ctx.moveTo(cx, cy);
ctx.arc(cx, cy, r, start, end);
ctx.closePath();
ctx.fillStyle = colors[i];
ctx.fill();
ctx.strokeStyle = "white";
ctx.lineWidth = 2;
ctx.stroke();

// Label
ctx.save();
ctx.translate(cx, cy);
ctx.rotate(start + slice/2);
ctx.textAlign = "right";
ctx.fillStyle = "white";
ctx.font = `bold ${pool.length > 8 ? 10 : 12}px Nunito, sans-serif`;
ctx.shadowColor = "rgba(0,0,0,0.3)";
ctx.shadowBlur = 3;
const label = item.text.length > 14 ? item.text.slice(0,13)+"…" : item.text;
ctx.fillText(label, r - 12, 4);
ctx.restore();
```

});
}

function shiftColor(hex, ratio) {
// Lightens/darkens hex by ratio (0–1)
let r = parseInt(hex.slice(1,3),16);
let g = parseInt(hex.slice(3,5),16);
let b = parseInt(hex.slice(5,7),16);
const factor = 0.55 + ratio * 0.45;
r = Math.min(255, Math.round(r + (255-r)*(1-factor)));
g = Math.min(255, Math.round(g + (255-g)*(1-factor)));
b = Math.min(255, Math.round(b + (255-b)*(1-factor)));
return `rgb(${r},${g},${b})`;
}

function spinWheel() {
const pool = items.filter(i => !i.done);
if (pool.length === 0) {
const res = document.getElementById(“spin-result”);
res.style.display = “block”;
res.textContent = “Add some to-do items first! 🌱”;
return;
}
if (wheelSpinning) return;
wheelSpinning = true;

document.getElementById(“spin-result”).style.display = “none”;
document.getElementById(“spin-btn”).disabled = true;

const slice = (2 * Math.PI) / pool.length;
const targetIdx = Math.floor(Math.random() * pool.length);
// Spin at least 5 full rotations + land on target
const extraSpins = 5 + Math.random() * 3;
const targetAngle = extraSpins * 2 * Math.PI
+ (2*Math.PI - targetIdx * slice - slice/2);

const duration = 4000; // ms
const start = performance.now();
const startAngle = wheelAngle;

function frame(now) {
const elapsed = now - start;
const progress = Math.min(elapsed / duration, 1);
// Ease out cubic
const eased = 1 - Math.pow(1 - progress, 3);
wheelAngle = startAngle + targetAngle * eased;
drawWheel(wheelAngle);

```
if (progress < 1) {
  wheelAnimId = requestAnimationFrame(frame);
} else {
  wheelSpinning = false;
  document.getElementById("spin-btn").disabled = false;
  const winner = pool[targetIdx];
  const res = document.getElementById("spin-result");
  res.style.display = "block";
  res.innerHTML = `🎯 <strong>${winner.text}</strong>${winner.note?`<br/><span style="font-size:12px;font-weight:600;opacity:0.8;">${winner.note}</span>`:""}`;
}
```

}
wheelAnimId = requestAnimationFrame(frame);
}

// ════════════════════════════════════════════
// FIRESTORE
// ════════════════════════════════════════════
async function addItem() {
const txt  = document.getElementById(“add-input”).value.trim();
const note = document.getElementById(“note-input”).value.trim();
if (!txt) return;
await addDoc(collection(db, “pairs”, pairId, “items”), {
text: txt, note, done: false,
category: activeCat,
colorIdx: items.length,
addedBy: currentUser.email,
addedAt: Date.now()
});
document.getElementById(“add-input”).value = “”;
document.getElementById(“note-input”).value = “”;
}

async function toggleDone(id) {
const item = items.find(i => i.id === id);
if (!item) return;
await updateDoc(doc(db, “pairs”, pairId, “items”, id), { done: !item.done });
}

async function removeItem(id) {
await deleteDoc(doc(db, “pairs”, pairId, “items”, id));
}

function subscribeItems() {
if (unsubscribe) unsubscribe();
const q = query(
collection(db, “pairs”, pairId, “items”),
where(“category”, “==”, activeCat)
);
unsubscribe = onSnapshot(q, snap => {
items = snap.docs
.map(d => ({ id: d.id, …d.data() }))
.sort((a, b) => a.addedAt - b.addedAt);
render();
drawWheel(wheelAngle);
});
}

// ════════════════════════════════════════════
// AUTH STATE
// ════════════════════════════════════════════
window._doSignOut = async () => {
if (unsubscribe) { unsubscribe(); unsubscribe = null; }
pairId = null; items = [];
await signOut(auth);
};

onAuthStateChanged(auth, async user => {
currentUser = user;
if (user) {
const snap = await getDoc(doc(db, “users”, user.uid));
pairId = snap.exists() ? snap.data().pairId : null;
if (pairId) subscribeItems();
} else {
pairId = null;
if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}
render();
});

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════
function inp() {
return `padding:10px 14px;border-radius:12px;border:2px solid #EEE;font-size:14px;font-weight:700;outline:none;color:#333;background:#FAFAFA;display:block;`;
}
function btn(color) {
return `background:${color};color:white;border:none;border-radius:12px;padding:9px 18px;font-weight:900;font-size:14px;cursor:pointer;white-space:nowrap;`;
}
function friendlyError(code) {
return ({
“auth/invalid-email”:        “That email doesn’t look right.”,
“auth/user-not-found”:       “No account with that email.”,
“auth/wrong-password”:       “Wrong password.”,
“auth/email-already-in-use”: “That email is already registered. Try logging in!”,
“auth/weak-password”:        “Password must be at least 6 characters.”,
“auth/invalid-credential”:   “Email or password is incorrect.”,
})[code] || “Something went wrong. Try again.”;
}
