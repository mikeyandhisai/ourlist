import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, collection,
  addDoc, deleteDoc, updateDoc,
  onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── CATEGORIES ──
const CATEGORIES = [
  { id: "movies",     label: "Movies & Shows",  emoji: "🎬", color: "#E8425A", light: "#FFEEF1" },
  { id: "restaurants",label: "Eats & Drinks",   emoji: "🍜", color: "#F07D1A", light: "#FFF4E8" },
  { id: "places",     label: "Places to Go",    emoji: "🗺️", color: "#2AA87E", light: "#E8FAF3" },
  { id: "books",      label: "Books to Read",   emoji: "📚", color: "#4B7FCC", light: "#EBF2FF" },
  { id: "activities", label: "Things to Do",    emoji: "🎉", color: "#9055C9", light: "#F4EEFF" },
];

const STICKY = ["#FFF9B0","#FFD5DC","#D8F5E8","#D5E8FF","#F5D5FF","#FFE5C4","#D5EFFF","#FFF0D5"];

let currentUser = null;
let pairId = null;
let activeCat = "movies";
let filter = "todo";
let items = [];
let unsubscribe = null;
let picked = null;
let spinning = false;

// ── RENDER ──
function render() {
  const app = document.getElementById("app");
  if (!currentUser) { app.innerHTML = renderAuth(); attachAuthEvents(); return; }
  if (!pairId)      { app.innerHTML = renderPair(); attachPairEvents(); return; }
  app.innerHTML = renderMain();
  attachMainEvents();
}

// ── AUTH SCREEN ──
function renderAuth() {
  return `
  <div style="background:white;border-radius:24px;padding:40px 36px;box-shadow:0 8px 40px rgba(0,0,0,0.10);max-width:420px;width:90%;text-align:center;">
    <div style="font-size:52px;margin-bottom:10px;">✨</div>
    <h1 style="font-family:'Fredoka One',cursive;font-size:36px;color:#E8425A;margin-bottom:4px;">OurList</h1>
    <p style="color:#AAA;font-weight:700;margin-bottom:28px;">Your shared bucket list 🫶</p>
    <div style="display:flex;gap:0;margin-bottom:24px;border-radius:12px;overflow:hidden;border:2px solid #EEE;">
      <button id="tab-login" onclick="switchTab('login')" style="flex:1;padding:10px;border:none;background:#E8425A;color:white;font-family:Nunito,sans-serif;font-weight:800;font-size:14px;cursor:pointer;">Log In</button>
      <button id="tab-signup" onclick="switchTab('signup')" style="flex:1;padding:10px;border:none;background:white;color:#AAA;font-family:Nunito,sans-serif;font-weight:800;font-size:14px;cursor:pointer;">Sign Up</button>
    </div>
    <input id="auth-email" type="email" placeholder="Email" style="${inputStyle()}margin-bottom:10px;"/>
    <input id="auth-pass" type="password" placeholder="Password" style="${inputStyle()}margin-bottom:16px;"/>
    <button id="auth-btn" style="${btnStyle("#E8425A")}width:100%;margin-bottom:12px;">Log In</button>
    <p id="auth-msg" style="color:#E8425A;font-size:13px;font-weight:700;min-height:20px;"></p>
  </div>`;
}

window.switchTab = (tab) => {
  const btn = document.getElementById("auth-btn");
  const tl = document.getElementById("tab-login");
  const ts = document.getElementById("tab-signup");
  if (tab === "login") {
    btn.textContent = "Log In"; btn.dataset.mode = "login";
    tl.style.background="#E8425A"; tl.style.color="white";
    ts.style.background="white"; ts.style.color="#AAA";
  } else {
    btn.textContent = "Create Account"; btn.dataset.mode = "signup";
    ts.style.background="#E8425A"; ts.style.color="white";
    tl.style.background="white"; tl.style.color="#AAA";
  }
};

function attachAuthEvents() {
  document.getElementById("auth-btn").dataset.mode = "login";
  document.getElementById("auth-btn").onclick = async () => {
    const email = document.getElementById("auth-email").value.trim();
    const pass  = document.getElementById("auth-pass").value;
    const mode  = document.getElementById("auth-btn").dataset.mode;
    const msg   = document.getElementById("auth-msg");
    try {
      if (mode === "signup") await createUserWithEmailAndPassword(auth, email, pass);
      else await signInWithEmailAndPassword(auth, email, pass);
    } catch(e) {
      msg.textContent = friendlyError(e.code);
    }
  };
  document.getElementById("auth-pass").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("auth-btn").click();
  });
}

// ── PAIR SCREEN ──
function renderPair() {
  return `
  <div style="background:white;border-radius:24px;padding:40px 36px;box-shadow:0 8px 40px rgba(0,0,0,0.10);max-width:440px;width:90%;text-align:center;">
    <div style="font-size:48px;margin-bottom:8px;">🫶</div>
    <h2 style="font-family:'Fredoka One',cursive;font-size:28px;color:#E8425A;margin-bottom:6px;">Connect with your partner</h2>
    <p style="color:#BBB;font-weight:700;font-size:13px;margin-bottom:28px;">Logged in as: ${currentUser.email}</p>

    <div style="background:#FFF8F0;border-radius:16px;padding:20px;margin-bottom:16px;">
      <p style="font-weight:800;color:#777;font-size:13px;margin-bottom:12px;">CREATE A NEW SHARED LIST</p>
      <button id="create-pair-btn" style="${btnStyle("#E8425A")}width:100%;">✨ Create & Get Invite Code</button>
    </div>

    <div style="background:#F0F8FF;border-radius:16px;padding:20px;">
      <p style="font-weight:800;color:#777;font-size:13px;margin-bottom:12px;">JOIN WITH AN INVITE CODE</p>
      <input id="pair-code-input" placeholder="Paste invite code here..." style="${inputStyle()}margin-bottom:10px;"/>
      <button id="join-pair-btn" style="${btnStyle("#4B7FCC")}width:100%;">🔗 Join Shared List</button>
    </div>

    <p id="pair-msg" style="color:#E8425A;font-weight:700;font-size:13px;margin-top:14px;min-height:20px;"></p>
    <button onclick="signOut(auth)" style="margin-top:10px;background:none;border:none;color:#CCC;font-family:Nunito,sans-serif;font-size:12px;cursor:pointer;">Sign out</button>
  </div>`;
}

function attachPairEvents() {
  document.getElementById("create-pair-btn").onclick = async () => {
    const ref = doc(collection(db, "pairs"));
    await setDoc(ref, { members: [currentUser.uid], createdAt: Date.now() });
    await setDoc(doc(db, "users", currentUser.uid), { pairId: ref.id });
    pairId = ref.id;
    document.getElementById("pair-msg").innerHTML =
      `✅ Created! Share this code with your partner: <strong style="font-size:16px;color:#E8425A;">${ref.id}</strong><br/><small>They paste it in the "Join" box.</small>`;
    setTimeout(() => { subscribeItems(); render(); }, 1800);
  };

  document.getElementById("join-pair-btn").onclick = async () => {
    const code = document.getElementById("pair-code-input").value.trim();
    if (!code) return;
    const pairRef = doc(db, "pairs", code);
    const snap = await getDoc(pairRef);
    if (!snap.exists()) {
      document.getElementById("pair-msg").textContent = "❌ Code not found. Double-check it!";
      return;
    }
    await updateDoc(pairRef, { members: [...(snap.data().members || []), currentUser.uid] });
    await setDoc(doc(db, "users", currentUser.uid), { pairId: code });
    pairId = code;
    subscribeItems();
    render();
  };
}

// ── MAIN APP ──
function renderMain() {
  const cat = CATEGORIES.find(c => c.id === activeCat);
  const todo = items.filter(i => !i.done).length;
  const done = items.filter(i => i.done).length;
  const displayed = items.filter(i =>
    filter === "all" ? true : filter === "done" ? i.done : !i.done
  );

  const catBtns = CATEGORIES.map(c => {
    const cnt = ""; // We'd need per-cat counts; simplified here
    const active = c.id === activeCat;
    return `<button class="cat-btn" data-cat="${c.id}" style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:12px;border:none;cursor:pointer;text-align:left;font-family:Nunito,sans-serif;font-size:13px;font-weight:${active?800:600};color:${active?c.color:"#888"};background:${active?c.light:"transparent"};border-left:4px solid ${active?c.color:"transparent"};transition:all 0.2s;width:100%;">
      <span style="font-size:17px">${c.emoji}</span><span style="flex:1">${c.label}</span>
    </button>`;
  }).join("");

  const cards = displayed.map((item, idx) => `
    <div class="card-item" style="background:${item.done?"#F7F5F2":STICKY[item.colorIdx%STICKY.length]};border-radius:16px;padding:14px 16px;box-shadow:0 3px 12px rgba(0,0,0,0.08);transition:all 0.3s;opacity:${item.done?0.72:1};">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <button data-toggle="${item.id}" style="width:24px;height:24px;border-radius:7px;border:2.5px solid ${item.done?cat.color:cat.color+"88"};background:${item.done?cat.color:"white"};cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:white;font-weight:900;font-size:13px;">${item.done?"✓":""}</button>
        <div style="flex:1;min-width:0;">
          <p style="margin:0;font-weight:700;font-size:14px;text-decoration:${item.done?"line-through":"none"};color:${item.done?"#BBB":"#333"};word-break:break-word;">${item.text}</p>
          ${item.note ? `<p style="margin:5px 0 0;font-size:11px;color:${item.done?"#CCC":"#999"};font-weight:600;font-style:italic;">${item.note}</p>` : ""}
          ${item.done ? `<p style="margin-top:10px;font-size:11px;color:${cat.color}99;font-weight:800;">✅ Done!</p>` : ""}
        </div>
        <button data-delete="${item.id}" style="background:none;border:none;cursor:pointer;color:#CCC;font-size:18px;padding:0 0 0 6px;font-weight:700;">×</button>
      </div>
    </div>`).join("");

  return `
  <div style="font-family:'Nunito',sans-serif;min-height:100vh;background:#FFF8F0;display:flex;flex-direction:column;">
    <header style="background:linear-gradient(135deg,${cat.color},${cat.color}CC);padding:14px 24px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 16px rgba(0,0,0,0.12);position:sticky;top:0;z-index:100;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:30px;">✨</span>
        <div>
          <h1 style="font-family:'Fredoka One',cursive;font-size:26px;color:white;margin:0;">OurList</h1>
          <p style="font-size:12px;color:rgba(255,255,255,0.88);font-weight:700;margin:0;">Your shared bucket list 🫶</p>
        </div>
      </div>
      <button id="logout-btn" style="background:rgba(255,255,255,0.2);border:none;border-radius:20px;padding:6px 16px;color:white;font-family:Nunito,sans-serif;font-weight:800;font-size:12px;cursor:pointer;">Sign Out</button>
    </header>

    <div style="display:flex;flex:1;">
      <aside style="width:190px;background:white;border-right:2px dashed #F0E4D4;padding:20px 10px;display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
        <p style="font-size:10px;font-weight:900;color:#C4B0A0;letter-spacing:2.5px;text-transform:uppercase;margin:0 0 10px 8px;">Lists</p>
        ${catBtns}
        <div style="margin-top:auto;padding:14px 8px 0;border-top:2px dashed #F0E4D4;">
          <p style="font-size:11px;color:#C4B0A0;font-weight:700;text-align:center;line-height:1.5;">🔄 Live sync with your partner</p>
        </div>
      </aside>

      <main style="flex:1;padding:24px;overflow:auto;">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;">
          <span style="font-size:40px;">${cat.emoji}</span>
          <div>
            <h2 style="font-family:'Fredoka One',cursive;font-size:28px;color:${cat.color};margin:0;">${cat.label}</h2>
            <p style="margin:0;font-size:13px;color:#AAA;font-weight:700;">${todo} to do · ${done} done</p>
          </div>
        </div>

        <!-- Picker -->
        <div style="background:white;border-radius:18px;padding:18px 20px;margin-bottom:20px;box-shadow:0 2px 14px rgba(0,0,0,0.06);">
          <p style="margin:0 0 12px;font-weight:800;font-size:13px;color:#777;">🎲 Feeling indecisive? Pick one!</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <button id="pick-todo" style="${btnStyle(cat.color)}">🎰 Pick from To-Do</button>
            <button id="pick-done" style="background:#F0EDE8;color:#666;border:none;border-radius:12px;padding:9px 18px;font-weight:800;font-size:13px;cursor:pointer;font-family:Nunito,sans-serif;">🔁 Pick Done (again!)</button>
            ${picked ? `<div id="pick-result" style="flex:1;min-width:180px;background:${cat.light};border-radius:12px;padding:10px 16px;border:2px solid ${cat.color};font-weight:800;font-size:14px;color:${cat.color};">🎯 ${picked}</div>` : ""}
          </div>
        </div>

        <!-- Add -->
        <div style="background:white;border-radius:18px;padding:18px 20px;margin-bottom:20px;box-shadow:0 2px 14px rgba(0,0,0,0.06);">
          <p style="margin:0 0 12px;font-weight:800;font-size:13px;color:#777;">➕ Add something new</p>
          <div style="display:flex;gap:10px;margin-bottom:10px;">
            <input id="add-input" placeholder="What do you want to add?" style="${inputStyle()}flex:1;"/>
            <button id="add-btn" style="${btnStyle(cat.color)}">Add! ✦</button>
          </div>
          <input id="note-input" placeholder="📝 Optional note (e.g. 'on Netflix', 'great for date night')" style="${inputStyle()}width:100%;"/>
        </div>

        <!-- Filters -->
        <div style="display:flex;gap:8px;margin-bottom:22px;flex-wrap:wrap;">
          ${[["todo",`⏳ To Do (${todo})`],["done",`✅ Done (${done})`],["all",`📋 All (${items.length})`]].map(([f,label]) =>
            `<button class="filter-btn" data-filter="${f}" style="padding:7px 16px;border-radius:20px;border:2px solid ${filter===f?cat.color:"#EEE"};background:${filter===f?cat.color:"white"};color:${filter===f?"white":"#888"};font-weight:800;font-size:13px;cursor:pointer;font-family:Nunito,sans-serif;">${label}</button>`
          ).join("")}
        </div>

        <!-- Grid -->
        ${displayed.length === 0 ? `
          <div style="text-align:center;padding:60px 0;color:#CCC;">
            <div style="font-size:52px;margin-bottom:14px;">${filter==="done"?"🏆":"🌱"}</div>
            <p style="font-weight:800;font-size:15px;">${filter==="done"?"Nothing done yet — get going! 🚀":"All clear! Add something above."}</p>
          </div>` : `
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px;">${cards}</div>`}
      </main>
    </div>
  </div>`;
}

function attachMainEvents() {
  const cat = CATEGORIES.find(c => c.id === activeCat);

  document.getElementById("logout-btn").onclick = () => { signOut(auth); pairId = null; };

  document.querySelectorAll(".cat-btn").forEach(btn => {
    btn.onclick = () => { activeCat = btn.dataset.cat; picked = null; filter = "todo"; subscribeItems(); render(); };
  });

  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.onclick = () => { filter = btn.dataset.filter; render(); };
  });

  const addBtn = document.getElementById("add-btn");
  if (addBtn) addBtn.onclick = addItem;
  const addInput = document.getElementById("add-input");
  if (addInput) addInput.addEventListener("keydown", e => { if (e.key === "Enter") addItem(); });

  document.getElementById("pick-todo").onclick = () => pickRandom(false);
  document.getElementById("pick-done").onclick = () => pickRandom(true);

  document.querySelectorAll("[data-toggle]").forEach(btn => {
    btn.onclick = () => toggleDone(btn.dataset.toggle);
  });
  document.querySelectorAll("[data-delete]").forEach(btn => {
    btn.onclick = () => removeItem(btn.dataset.delete);
  });
}

// ── FIRESTORE ACTIONS ──
async function addItem() {
  const text = document.getElementById("add-input").value.trim();
  const note = document.getElementById("note-input").value.trim();
  if (!text) return;
  await addDoc(collection(db, "pairs", pairId, "items"), {
    text, note, done: false,
    category: activeCat,
    colorIdx: items.length,
    addedBy: currentUser.email,
    addedAt: Date.now()
  });
  document.getElementById("add-input").value = "";
  document.getElementById("note-input").value = "";
}

async function toggleDone(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  await updateDoc(doc(db, "pairs", pairId, "items", id), { done: !item.done });
}

async function removeItem(id) {
  await deleteDoc(doc(db, "pairs", pairId, "items", id));
}

function pickRandom(fromDone) {
  const pool = items.filter(i => i.done === fromDone);
  if (!pool.length) { picked = fromDone ? "Nothing done yet!" : "Add items first!"; render(); return; }
  let t = 0;
  spinning = true;
  const spin = () => {
    picked = pool[Math.floor(Math.random() * pool.length)].text;
    render(); t++;
    if (t < 14) setTimeout(spin, 60 + t * 14);
    else spinning = false;
  };
  spin();
}

// ── REAL-TIME SYNC ──
function subscribeItems() {
  if (unsubscribe) unsubscribe();
  const q = query(
    collection(db, "pairs", pairId, "items"),
    where("category", "==", activeCat)
  );
  unsubscribe = onSnapshot(q, snap => {
    items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                     .sort((a, b) => a.addedAt - b.addedAt);
    render();
  });
}

// ── AUTH STATE LISTENER ──
onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    const snap = await getDoc(doc(db, "users", user.uid));
    pairId = snap.exists() ? snap.data().pairId : null;
    if (pairId) subscribeItems();
  } else {
    pairId = null;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }
  render();
});

// ── HELPERS ──
function inputStyle() {
  return "padding:10px 16px;border-radius:12px;border:2px solid #EEE;font-family:Nunito,sans-serif;font-size:14px;font-weight:700;outline:none;color:#333;background:#FAFAFA;display:block;";
}
function btnStyle(color) {
  return `background:${color};color:white;border:none;border-radius:12px;padding:9px 18px;font-weight:900;font-size:14px;cursor:pointer;font-family:Nunito,sans-serif;white-space:nowrap;`;
}
function friendlyError(code) {
  const map = {
    "auth/invalid-email": "That email doesn't look right.",
    "auth/user-not-found": "No account with that email.",
    "auth/wrong-password": "Wrong password.",
    "auth/email-already-in-use": "That email is already registered. Try logging in!",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-credential": "Email or password is incorrect.",
  };
  return map[code] || "Something went wrong. Try again.";
}
