// SelfQuest v3 - No Quests/Log pages + Sick Skip auto-completes Dailies
const STORAGE_KEY = "selfquest_v6_3";

const $ = (id) => document.getElementById(id);
const nowISO = () => new Date().toISOString();

function todayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

function uid(){
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function beep(){
  if(state.settings.sound !== "on") return;
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 740;
    g.gain.value = 0.02;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(()=>{ o.stop(); ctx.close(); }, 80);
  }catch(e){}
}

const defaultState = {
  version: 6.3,
  player: {
    name: "Elias",
    level: 1,
    xp: 0,
    crystals: 0,
    streak: 0,
    lastActiveDay: null,
    todayXp: 0,
    todayKey: todayKey(),
    rank: null,
    onboardingDone: false
  },
  settings: {
    accent: "purple",
    sound: "on"
  },
  character: {
    path: null, // "bodybuilder" or "athletic"
    equipment: { weapon: null, armor: null, ring: null, boots: null },
    inventory: [],
    bonus: { STR:0, DEF:0, SPD:0, HP:0 },
    alloc: { STR:0, DEF:0, SPD:0, VIT:0 },
    spentStatPoints: 0
  },
  skills: {
    points: 0,
    spent: 0,
    unlocked: {
      // base moves always unlocked
      pushups: true,
      squats: true,
      pullups: true
    },
    moveset: ["pushups","squats","pullups"]
  },
  dungeon: {
    active: false,
    stage: 0,
    hp: 0,
    enemy: null,
    lootSecured: 0,
    runLoot: []
  },
  dailyConfig: {
    exercisePool: [
      { key:"pushups", name:"Push-ups" },
      { key:"pullups", name:"Pull-ups" },
      { key:"squats", name:"Squats" },
      { key:"legraises", name:"Leg Raises" },
      { key:"plank", name:"Plank (seconds)" },
      { key:"dips", name:"Dips" },
      { key:"lunges", name:"Lunges" },
      { key:"glutebridge", name:"Glute Bridge" },
      { key:"calfraises", name:"Calf Raises" }
    ],
    selected: ["pushups","pullups","legraises","squats"],
    baseDiff: "normal",
    mode: "strict",
    failCount: 0,
    repMultiplier: 1.0,
    skippedDays: []
  },
  quests: [],
  rewards: [
    { id: "r1", name: "Gaming time (30 min)", desc: "Guilt-free gaming.", price: 25 },
    { id: "r2", name: "Snack reward", desc: "Something tasty.", price: 20 },
    { id: "r3", name: "Movie / Episode", desc: "One episode or half a movie.", price: 35 },
    { id: "r4", name: "Buy something small", desc: "Under 10€.", price: 80 },
  ]
};

let state = loadState();

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return structuredClone(defaultState);
  try{
    const parsed = JSON.parse(raw);
    if(!parsed.version) parsed.version = 3;

    if(parsed.player.rank === undefined) parsed.player.rank = null;
    if(parsed.player.onboardingDone === undefined) parsed.player.onboardingDone = false;
    if(!parsed.character) parsed.character = structuredClone(defaultState.character);
    if(!parsed.character.bonus) parsed.character.bonus = { STR:0, DEF:0, SPD:0, HP:0 };
    if(!parsed.character.alloc) parsed.character.alloc = { STR:0, DEF:0, SPD:0, VIT:0 };
    if(parsed.character.spentStatPoints === undefined) parsed.character.spentStatPoints = 0;
    if(!parsed.skills) parsed.skills = structuredClone(defaultState.skills);
    if(!parsed.dungeon) parsed.dungeon = structuredClone(defaultState.dungeon);

    // moveset default
    if(parsed.skills && Array.isArray(parsed.skills.moveset)){
      const allEmpty = parsed.skills.moveset.every(x=>!x);
      if(allEmpty) parsed.skills.moveset = ["pushups","squats","pullups"];
    }

    if(!parsed.dailyConfig) parsed.dailyConfig = structuredClone(defaultState.dailyConfig);
    if(!parsed.rewards) parsed.rewards = structuredClone(defaultState.rewards);
    if(!parsed.quests) parsed.quests = [];

    return parsed;
  }catch(e){
    return structuredClone(defaultState);
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1400);
}

function setAccent(accent){
  const root = document.documentElement;
  if(accent === "blue"){
    root.style.setProperty("--accent", "#38bdf8");
    root.style.setProperty("--accent2", "#60a5fa");
  }else if(accent === "green"){
    root.style.setProperty("--accent", "#22c55e");
    root.style.setProperty("--accent2", "#86efac");
  }else{
    root.style.setProperty("--accent", "#8b5cf6");
    root.style.setProperty("--accent2", "#a78bfa");
  }
}

function xpForLevel(level){
  return Math.floor(100 + (level-1)*35 + Math.pow(level-1, 1.35)*18);
}

function computeRank(push, pull, plankSec){
  // Hard Solo-Leveling style requirements (honor system).
  // Higher ranks are intentionally hard.

  const p = clamp(push, 0, 300);
  const pu = clamp(pull, 0, 100);
  const pl = clamp(plankSec, 0, 3600);

  // S
  if(p >= 100 && pu >= 30 && pl >= 300) return "S";
  // A
  if(p >= 75 && pu >= 22 && pl >= 240) return "A";
  // B (harder)
  if(p >= 45 && pu >= 15 && pl >= 150) return "B";
  // C
  if(p >= 30 && pu >= 10 && pl >= 90) return "C";
  // D
  if(p >= 15 && pu >= 5 && pl >= 45) return "D";
  return "E";
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}


/* -------------------- Items / Inventory -------------------- */

function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

const RARITIES = [
  { key:"common", name:"Common", mult:1.0 },
  { key:"rare", name:"Rare", mult:1.35 },
  { key:"epic", name:"Epic", mult:1.75 },
  { key:"legendary", name:"Legendary", mult:2.25 }
];

const SLOT_TYPES = ["weapon","armor","ring","boots"];

function baseStatsFromLevel(level){
  // very simple for now; later this will be influenced by path + skills
  const STR = 1 + Math.floor(level/2);
  const DEF = 1 + Math.floor(level/3);
  const SPD = 1 + Math.floor(level/4);
  const HP  = 50 + level*6;
  const bonus = state.character.bonus || { STR:0, DEF:0, SPD:0, HP:0 };
  return { STR: STR+bonus.STR, DEF: DEF+bonus.DEF, SPD: SPD+bonus.SPD, HP: HP+bonus.HP };
}

function getEvolutionName(level){
  const evo = Math.floor((level-1)/10);
  if(evo <= 0) return "Rookie";
  if(evo === 1) return "Awakened";
  if(evo === 2) return "Elite";
  if(evo === 3) return "Ascended";
  return "Mythic";
}

function genItem(){
  const slot = SLOT_TYPES[randInt(0, SLOT_TYPES.length-1)];
  const r = RARITIES[randInt(0, RARITIES.length-1)];

  const names = {
    weapon: ["Iron Knuckles", "Hunter Gloves", "Shadow Gauntlet", "Void Fists"],
    armor: ["Leather Vest", "Hunter Armor", "Shadow Plate", "Void Armor"],
    ring: ["Minor Ring", "Mana Ring", "Shadow Ring", "Void Ring"],
    boots: ["Runner Boots", "Hunter Boots", "Shadow Boots", "Void Boots"]
  }[slot];

  const name = names[randInt(0, names.length-1)];

  const statPool = ["STR","DEF","SPD","HP"];
  const pick = statPool[randInt(0, statPool.length-1)];

  const base = randInt(1,3);
  const bonus = Math.max(1, Math.round(base * r.mult));

  const item = {
    id: uid(),
    slot,
    rarity: r.key,
    name,
    stats: {
      STR: pick==="STR" ? bonus : 0,
      DEF: pick==="DEF" ? bonus : 0,
      SPD: pick==="SPD" ? bonus : 0,
      HP:  pick==="HP"  ? bonus*8 : 0
    },
    createdAt: nowISO()
  };

  return item;
}

function rarityLabel(key){
  if(key==="legendary") return "Legendary";
  if(key==="epic") return "Epic";
  if(key==="rare") return "Rare";
  return "Common";
}

function rarityBadge(key){
  if(key==="legendary") return `<span class="badge boss">Legendary</span>`;
  if(key==="epic") return `<span class="badge warn">Epic</span>`;
  if(key==="rare") return `<span class="badge good">Rare</span>`;
  return `<span class="badge">Common</span>`;
}

function addTestLoot(){
  const it = genItem();
  state.character.inventory.unshift(it);
  saveState();
  toast("Loot obtained!");
}



/* -------------------- Skills / Moves -------------------- */

const MOVE_DEFS = [
  { key:"pushups", name:"Push-ups", type:"move", dmg: 8, desc:"Basic strike. Reliable." },
  { key:"squats", name:"Squats", type:"move", dmg: 10, desc:"Heavy hit. Good base damage." },
  { key:"pullups", name:"Pull-ups", type:"move", dmg: 12, desc:"Harder move. Higher damage." },

  // Unlockable moves
  { key:"diamond_pushups", name:"Diamond Push-ups", type:"move", dmg: 16, cost:1, requires:["pushups"], desc:"Stronger push-up variant. More damage." },
  { key:"pike_pushups", name:"Pike Push-ups", type:"move", dmg: 18, cost:1, requires:["pushups"], desc:"Shoulder-focused. High damage." },
  { key:"jump_squats", name:"Jump Squats", type:"move", dmg: 17, cost:1, requires:["squats"], desc:"Explosive hit. Scales later with SPD." },
  { key:"wide_pullups", name:"Wide Pull-ups", type:"move", dmg: 20, cost:2, requires:["pullups"], desc:"Big damage. Hard." },

  // Passives
  { key:"iron_core", name:"Iron Core", type:"passive", cost:1, requires:["pushups","squats"], desc:"+10 HP permanently." },
  { key:"hunter_grip", name:"Hunter Grip", type:"passive", cost:1, requires:["pullups"], desc:"+1 STR permanently." },
  { key:"agility", name:"Agility", type:"passive", cost:1, requires:["squats"], desc:"+1 SPD permanently." }
];

function moveDef(key){
  return MOVE_DEFS.find(m=>m.key===key) || null;
}

function isUnlocked(key){
  return !!state.skills.unlocked[key];
}

function canUnlock(def){
  if(isUnlocked(def.key)) return false;
  const cost = def.cost || 1;
  const available = state.skills.points - state.skills.spent;
  if(available < cost) return false;

  const req = def.requires || [];
  return req.every(r=>isUnlocked(r));
}

function unlockSkill(key){
  const def = moveDef(key);
  if(!def) return;
  if(!canUnlock(def)) return;

  state.skills.unlocked[key] = true;
  state.skills.spent += (def.cost || 1);

  // Apply passive effects immediately
  if(def.type === "passive"){
    if(def.key === "iron_core"){
      // store as bonus HP in character path placeholder
      if(!state.character.bonus) state.character.bonus = { STR:0, DEF:0, SPD:0, HP:0 };
      state.character.bonus.HP += 10;
    }
    if(def.key === "hunter_grip"){
      if(!state.character.bonus) state.character.bonus = { STR:0, DEF:0, SPD:0, HP:0 };
      state.character.bonus.STR += 1;
    }
    if(def.key === "agility"){
      if(!state.character.bonus) state.character.bonus = { STR:0, DEF:0, SPD:0, HP:0 };
      state.character.bonus.SPD += 1;
    }
  }

  saveState();
  beep();
  toast("Skill unlocked!");
}


/* -------------------- Mandatory Dailies -------------------- */

function repsFor(diff, multiplier){
  const base = { easy: 8, normal: 12, hard: 18 }[diff] || 12;
  return Math.max(3, Math.round(base * multiplier));
}

function makeDailyQuestsForToday(){
  const cfg = state.dailyConfig;
  const pool = cfg.exercisePool;
  const selected = cfg.selected;

  state.quests = state.quests.filter(q => !(q.type === "daily" && q.autoDaily === true));

  const mult = cfg.repMultiplier || 1.0;
  const diff = cfg.baseDiff || "normal";

  selected.slice(0,4).forEach((key)=>{
    const ex = pool.find(p=>p.key===key) || { key, name: key };
    const reps = repsFor(diff, mult);

    let title = "";
    if(key === "plank"){
      const sec = Math.round(30 * mult + (diff==="hard"?30: diff==="easy"?0:15));
      title = `Plank ${sec}s`;
    }else{
      title = `${reps} ${ex.name}`;
    }

    const xp = Math.round(12 * mult + (diff==="hard"?10: diff==="easy"?0:5));
    const cr = Math.max(1, Math.round(2 * mult + (diff==="hard"?2:1)));

    state.quests.unshift({
      id: uid(),
      title,
      type: "daily",
      diff,
      xp,
      cr,
      notes: "Mandatory Daily Quest.",
      doneDay: null,
      createdAt: nowISO(),
      autoDaily: true,
      dailyKey: key
    });
  });

  saveState();
}

function allMandatoryDailiesCompleted(){
  const tk = todayKey();
  const dailies = state.quests.filter(q => q.type==="daily" && q.autoDaily===true);
  if(dailies.length < 4) return false;
  return dailies.every(q => q.doneDay === tk);
}

function didSkipToday(){
  const tk = todayKey();
  return (state.dailyConfig.skippedDays || []).includes(tk);
}

function skipToday(){
  const tk = todayKey();
  if(!state.dailyConfig.skippedDays) state.dailyConfig.skippedDays = [];
  if(state.dailyConfig.skippedDays.includes(tk)){
    toast("Already skipped today.");
    return;
  }

  state.dailyConfig.skippedDays.push(tk);

  // Auto-complete mandatory dailies for today
  state.quests.forEach(q=>{
    if(q.type==="daily" && q.autoDaily===true){
      q.doneDay = tk;
    }
  });

  // Counts as activity -> keeps streak alive
  const p = state.player;
  if(p.lastActiveDay !== tk){
    p.streak += 1;
    p.lastActiveDay = tk;
  }

  saveState();
  beep();
  toast("Sick skip used. Dailies auto-completed.");
}

function ensureNewDay(){
  const tk = todayKey();
  const p = state.player;

  if(!p.todayKey) p.todayKey = tk;

  if(p.todayKey !== tk){
    const prevDay = p.todayKey;
    const skippedPrev = (state.dailyConfig.skippedDays || []).includes(prevDay);

    const prevDailies = state.quests.filter(q => q.type==="daily" && q.autoDaily===true);
    const prevCompleted = prevDailies.length >= 4 && prevDailies.every(q => q.doneDay === prevDay);

    if(state.dailyConfig.mode === "strict" && !skippedPrev && !prevCompleted){
      state.dailyConfig.failCount = (state.dailyConfig.failCount || 0) + 1;
      state.dailyConfig.repMultiplier = Math.min(3.0, (state.dailyConfig.repMultiplier || 1.0) + 0.15);

      p.level = Math.max(1, p.level - 1);
      p.xp = 0;

      toast("Daily failed. Level -1.");
    }

    state.quests.forEach(q=>{
      if(q.type === "daily") q.doneDay = null;
    });

    // streak logic (skip doesn't break)
    const last = p.lastActiveDay;
    const yest = new Date();
    yest.setDate(yest.getDate()-1);
    const yk = yest.toISOString().slice(0,10);

    if(!skippedPrev){
      if(last !== yk) p.streak = 0;
    }

    p.todayXp = 0;
    p.todayKey = tk;

    makeDailyQuestsForToday();
    saveState();
  }else{
    const d = state.quests.filter(q => q.type==="daily" && q.autoDaily===true);
    if(d.length < 4){
      makeDailyQuestsForToday();
    }
  }
}

/* -------------------- Quests / XP -------------------- */

function completeQuest(id){
  ensureNewDay();
  const q = state.quests.find(x=>x.id===id);
  if(!q) return;

  const tk = todayKey();
  if(q.doneDay === tk){
    toast("Already completed today.");
    return;
  }

  q.doneDay = tk;

  const xp = Number(q.xp)||0;
  const cr = Number(q.cr)||0;

  state.player.xp += xp;
  state.player.crystals += cr;
  state.player.todayXp += xp;

  const p = state.player;
  if(p.lastActiveDay !== tk){
    p.streak += 1;
    p.lastActiveDay = tk;
  }

  let leveled = false;
  while(p.xp >= xpForLevel(p.level)){
    p.xp -= xpForLevel(p.level);
    p.level += 1;
    leveled = true;
  }

  saveState();
  beep();

  if(q.type==="daily" && q.autoDaily===true && allMandatoryDailiesCompleted() && !didSkipToday()){
    toast("All mandatory dailies completed! 🔥");
  }else if(leveled){
    toast(`LEVEL UP! You are now Level ${p.level} 🔥`);
  }else{
    toast("Quest completed!");
  }
}

function uncompleteQuest(id){
  const q = state.quests.find(x=>x.id===id);
  if(!q) return;
  const tk = todayKey();
  if(q.doneDay !== tk) return;

  state.player.xp = Math.max(0, state.player.xp - (Number(q.xp)||0));
  state.player.crystals = Math.max(0, state.player.crystals - (Number(q.cr)||0));
  state.player.todayXp = Math.max(0, state.player.todayXp - (Number(q.xp)||0));
  q.doneDay = null;

  saveState();
  toast("Undone.");
}

function deleteQuest(id){
  state.quests = state.quests.filter(x=>x.id!==id);
  saveState();
  toast("Deleted.");
}

function upsertQuest(q){
  if(!q.title.trim()) return false;
  q.xp = clamp(Number(q.xp)||10, 5, 500);
  q.cr = clamp(Number(q.cr)||0, 0, 200);

  const existing = state.quests.find(x=>x.id===q.id);
  if(existing){
    Object.assign(existing, q);
  }else{
    state.quests.unshift(q);
  }
  saveState();
  return true;
}

function buyReward(id){
  const r = state.rewards.find(x=>x.id===id);
  if(!r) return;

  if(state.player.crystals < r.price){
    toast("Not enough Mana Crystals.");
    return;
  }
  state.player.crystals -= r.price;
  saveState();
  beep();
  toast("Reward unlocked!");
}


/* -------------------- Character Render -------------------- */

$("btnCloseEquip").addEventListener("click", closeModals);

let activeEquipSlot = null;

function openEquip(slot){
  activeEquipSlot = slot;
  $("equipTitle").textContent = `Equip: ${slot.toUpperCase()}`;
  $("equipHint").textContent = "Select an item from your inventory.";

  const grid = $("equipPickGrid");
  grid.innerHTML = "";

  const items = state.character.inventory.filter(i=>i.slot===slot);

  if(items.length === 0){
    grid.innerHTML = `<div class="hint">No items for this slot yet.</div>`;
  }else{
    items.forEach(it=>{
      const el = document.createElement("div");
      el.className = "equipPick";
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div>
            <div style="font-weight:900">${escapeHtml(it.name)}</div>
            <div class="tiny">${rarityLabel(it.rarity)} • ${it.slot}</div>
          </div>
          ${rarityBadge(it.rarity)}
        </div>
        <div class="invStats">
          ${it.stats.STR?`<span class="pillStat">+${it.stats.STR} STR</span>`:""}
          ${it.stats.DEF?`<span class="pillStat">+${it.stats.DEF} DEF</span>`:""}
          ${it.stats.SPD?`<span class="pillStat">+${it.stats.SPD} SPD</span>`:""}
          ${it.stats.HP?`<span class="pillStat">+${it.stats.HP} HP</span>`:""}
        </div>
      `;
      el.addEventListener("click", ()=>{
        state.character.equipment[slot] = it.id;
        saveState();
        toast("Equipped!");
        closeModals();
        render();
      });
      grid.appendChild(el);
    });
  }

  openModal(modalEquip);
}

$("btnUnequip").addEventListener("click", ()=>{
  if(!activeEquipSlot) return;
  state.character.equipment[activeEquipSlot] = null;
  saveState();
  toast("Unequipped.");
  closeModals();
  render();
});

function getEquippedItem(slot){
  const id = state.character.equipment[slot];
  if(!id) return null;
  return state.character.inventory.find(i=>i.id===id) || null;
}

function calcTotalStats(){
  const base = baseStatsFromLevel(state.player.level);

  // apply allocated stat points
  const a = state.character.alloc || { STR:0, DEF:0, SPD:0, VIT:0 };
  base.STR += a.STR;
  base.DEF += a.DEF;
  base.SPD += a.SPD;
  base.HP  += a.VIT * 10;

  const eq = state.character.equipment;
  const slots = Object.keys(eq);

  const total = { ...base };
  slots.forEach(s=>{
    const it = getEquippedItem(s);
    if(!it) return;
    total.STR += it.stats.STR || 0;
    total.DEF += it.stats.DEF || 0;
    total.SPD += it.stats.SPD || 0;
    total.HP  += it.stats.HP  || 0;
  });

  return total;
}

function renderCharacter(){
  const evo = getEvolutionName(state.player.level);
  $("evoText").textContent = `Evolution: ${evo}`;

  // simple avatar changes per evo
  const evoStage = Math.floor((state.player.level-1)/10);
  $("charAvatar").textContent = evoStage >= 3 ? "🧙" : evoStage >= 2 ? "🧟" : evoStage >= 1 ? "🦸" : "🧍";

  // stat allocation
  const totalPoints = Math.max(0, state.player.level - 1);
  const spent = state.character.spentStatPoints || 0;
  const available = totalPoints - spent;
  $("statPoints").textContent = available;

  $("buildPath").textContent = state.character.path ? (state.character.path==="bodybuilder" ? "Bodybuilder" : "Athletic") : "Unchosen";

  $("allocSTR").textContent = (state.character.alloc?.STR || 0);
  $("allocDEF").textContent = (state.character.alloc?.DEF || 0);
  $("allocSPD").textContent = (state.character.alloc?.SPD || 0);
  $("allocVIT").textContent = (state.character.alloc?.VIT || 0);

  const t = calcTotalStats();
  $("statSTR").textContent = t.STR;
  $("statDEF").textContent = t.DEF;
  $("statSPD").textContent = t.SPD;
  $("statHP").textContent  = t.HP;

  // equipment labels
  ["weapon","armor","ring","boots"].forEach(slot=>{
    const it = getEquippedItem(slot);
    const el = document.getElementById(`slot_${slot}`);
    if(!el) return;
    el.textContent = it ? it.name : "Empty";
  });

  // inventory grid
  const grid = $("invGrid");
  grid.innerHTML = "";

  const inv = state.character.inventory;
  if(inv.length === 0){
    grid.innerHTML = `<div class="hint">No items yet. (Use Test Loot for now.)</div>`;
  }else{
    inv.slice(0, 40).forEach(it=>{
      const el = document.createElement("div");
      el.className = "invItem";
      el.innerHTML = `
        <div class="invTop">
          <div>
            <div class="invName">${escapeHtml(it.name)}</div>
            <div class="invType">${rarityLabel(it.rarity)} • ${it.slot}</div>
          </div>
          ${rarityBadge(it.rarity)}
        </div>

        <div class="invStats">
          ${it.stats.STR?`<span class="pillStat">+${it.stats.STR} STR</span>`:""}
          ${it.stats.DEF?`<span class="pillStat">+${it.stats.DEF} DEF</span>`:""}
          ${it.stats.SPD?`<span class="pillStat">+${it.stats.SPD} SPD</span>`:""}
          ${it.stats.HP?`<span class="pillStat">+${it.stats.HP} HP</span>`:""}
        </div>

        <div class="invBtns">
          <button class="invBtn">Equip</button>
          <button class="invBtn">Trash</button>
        </div>
      `;

      const [btnEquip, btnTrash] = el.querySelectorAll("button");

      btnEquip.addEventListener("click", ()=>{
        openEquip(it.slot);
      });

      btnTrash.addEventListener("click", ()=>{
        // if equipped, unequip first
        Object.keys(state.character.equipment).forEach(s=>{
          if(state.character.equipment[s] === it.id) state.character.equipment[s] = null;
        });
        state.character.inventory = state.character.inventory.filter(x=>x.id!==it.id);
        saveState();
        toast("Trashed.");
        render();
      });

      grid.appendChild(el);
    });
  }
}

document.querySelectorAll(".equipSlot").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    openEquip(btn.dataset.slot);
  });
});


// Stat allocation buttons
document.querySelectorAll(".allocBtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const stat = btn.dataset.stat;
    const totalPoints = Math.max(0, state.player.level - 1);
    const spent = state.character.spentStatPoints || 0;
    const available = totalPoints - spent;
    if(available <= 0){
      toast("No stat points available.");
      return;
    }

    if(!state.character.alloc) state.character.alloc = { STR:0, DEF:0, SPD:0, VIT:0 };
    state.character.alloc[stat] = (state.character.alloc[stat] || 0) + 1;
    state.character.spentStatPoints = spent + 1;

    saveState();
    toast("+1 " + stat);
    render();
  });
});

$("btnChooseBodybuilder").addEventListener("click", ()=>{
  state.character.path = "bodybuilder";
  saveState();
  toast("Path: Bodybuilder");
  render();
});

$("btnChooseAthletic").addEventListener("click", ()=>{
  state.character.path = "athletic";
  saveState();
  toast("Path: Athletic");
  render();
});


$("btnAddTestLoot").addEventListener("click", ()=>{
  addTestLoot();
  render();
});



/* -------------------- Skills Render -------------------- */

$("btnCloseMovePick").addEventListener("click", closeModals);

let activeMoveSlot = null;

function openMovePick(slotIndex){
  activeMoveSlot = slotIndex;
  $("movePickTitle").textContent = `Select Move (Slot ${slotIndex+1})`;

  const grid = $("movePickGrid");
  grid.innerHTML = "";

  const unlockedMoves = MOVE_DEFS.filter(d=>d.type==="move" && isUnlocked(d.key));

  if(unlockedMoves.length === 0){
    grid.innerHTML = `<div class="hint">No moves unlocked.</div>`;
  }else{
    unlockedMoves.forEach(m=>{
      const el = document.createElement("div");
      el.className = "equipPick";
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div>
            <div style="font-weight:900">${escapeHtml(m.name)}</div>
            <div class="tiny">Damage: ${m.dmg}</div>
          </div>
          <span class="badge accent">Move</span>
        </div>
        <div class="skillDesc" style="margin-top:8px">${escapeHtml(m.desc)}</div>
      `;
      el.addEventListener("click", ()=>{
        state.skills.moveset[slotIndex] = m.key;
        saveState();
        toast("Moveset updated!");
        closeModals();
        render();
      });
      grid.appendChild(el);
    });
  }

  openModal(modalMovePick);
}

$("btnClearMoveSlot").addEventListener("click", ()=>{
  if(activeMoveSlot === null) return;
  state.skills.moveset[activeMoveSlot] = null;
  saveState();
  toast("Cleared.");
  closeModals();
  render();
});

document.querySelectorAll(".moveSlot").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    openMovePick(Number(btn.dataset.mslot));
  });
});

function renderSkills(){
  // skill points = level - 1 (simple)
  state.skills.points = Math.max(0, state.player.level - 1);

  const available = state.skills.points - state.skills.spent;
  $("skillPoints").textContent = available;

  // moveset labels
  for(let i=0;i<3;i++){
    const key = state.skills.moveset[i];
    const el = document.getElementById(`mslot${i}`);
    if(!el) continue;
    el.textContent = key ? (moveDef(key)?.name || key) : "Empty";
  }

  const list = $("skillList");
  list.innerHTML = "";

  MOVE_DEFS.forEach(def=>{
    if(def.key==="pushups" || def.key==="squats" || def.key==="pullups") return; // base moves hidden

    const unlocked = isUnlocked(def.key);
    const can = canUnlock(def);

    const el = document.createElement("div");
    el.className = "skillCard" + (unlocked ? "" : " locked");

    el.innerHTML = `
      <div class="skillHeader">
        <div>
          <div class="skillName">${escapeHtml(def.name)}</div>
          <div class="skillDesc">${escapeHtml(def.desc)}</div>
        </div>
        <div>
          ${unlocked ? `<span class="badge good">Unlocked</span>` : def.type==="move" ? `<span class="badge accent">Move</span>` : `<span class="badge">Passive</span>`}
        </div>
      </div>

      <div class="skillMeta">
        ${def.type==="move" ? `<span class="badge">DMG ${def.dmg}</span>` : ""}
        <span class="badge">Cost ${def.cost || 1} SP</span>
        ${(def.requires||[]).length ? `<span class="badge">Requires: ${(def.requires||[]).map(r=>moveDef(r)?.name||r).join(", ")}</span>` : ""}
      </div>

      <div style="margin-top:10px;display:flex;gap:10px;justify-content:flex-end">
        ${unlocked ? "" : `<button class="primaryBtn">Unlock</button>`}
      </div>
    `;

    const btn = el.querySelector("button");
    if(btn){
      btn.disabled = !can;
      if(!can){
        btn.style.opacity = "0.55";
      }
      btn.addEventListener("click", ()=>{
        unlockSkill(def.key);
        render();
      });
    }

    list.appendChild(el);
  });
}



/* -------------------- Dungeons -------------------- */

const ENEMIES = [
  { key:"goblin", name:"Goblin", hp: 40, atk: 6 },
  { key:"spider", name:"Giant Spider", hp: 35, atk: 7 },
  { key:"skeleton", name:"Skeleton", hp: 45, atk: 8 },
  { key:"wolf", name:"Dungeon Wolf", hp: 42, atk: 7 }
];

const BOSSES = [
  { key:"goblin_chief", name:"Goblin Chief", hp: 90, atk: 12 },
  { key:"spider_queen", name:"Spider Queen", hp: 85, atk: 13 },
  { key:"bone_knight", name:"Bone Knight", hp: 95, atk: 14 }
];

function scaleEnemy(e){
  // scale lightly with level
  const lvl = state.player.level;
  const mult = 1 + Math.min(1.2, lvl * 0.03);
  return {
    ...e,
    hp: Math.round(e.hp * mult),
    atk: Math.round(e.atk * mult)
  };
}

function getPlayerHP(){
  const t = calcTotalStats();
  return t.HP;
}

function startDungeonRun(){
  const d = state.dungeon;
  d.active = true;
  d.stage = 0;
  d.hp = getPlayerHP();
  d.lootSecured = 0;
  d.runLoot = [];

  spawnNextEnemy();
  saveState();
  toast("Dungeon started!");
}

function spawnNextEnemy(){
  const d = state.dungeon;
  d.stage += 1;

  const isBoss = d.stage === 5;
  let e;
  if(isBoss){
    e = BOSSES[randInt(0, BOSSES.length-1)];
  }else{
    e = ENEMIES[randInt(0, ENEMIES.length-1)];
  }

  e = scaleEnemy(e);

  d.enemy = {
    key: e.key,
    name: e.name + (isBoss ? " (Boss)" : ""),
    maxHp: e.hp,
    hp: e.hp,
    atk: e.atk,
    boss: isBoss
  };

  logDungeon(`Encounter: <strong>${escapeHtml(d.enemy.name)}</strong>`);
}

function endDungeonRun(reason){
  const d = state.dungeon;
  d.active = false;
  d.stage = 0;
  d.enemy = null;

  if(reason === "dead"){
    toast("You got defeated...");
    logDungeon("You were defeated. Loot lost.");
    d.runLoot = [];
    d.lootSecured = 0;
  }
  if(reason === "escape"){
    // secure loot into inventory
    d.runLoot.forEach(it=>{
      state.character.inventory.unshift(it);
    });
    toast("Escaped! Loot secured.");
    logDungeon("Escaped successfully. Loot secured.");
  }
  if(reason === "clear"){
    d.runLoot.forEach(it=>{
      state.character.inventory.unshift(it);
    });
    toast("Dungeon cleared! Loot secured.");
    logDungeon("Dungeon cleared! Loot secured.");
  }

  saveState();
}

function giveLoot(){
  // 40% chance per enemy, 100% on boss
  const d = state.dungeon;
  const chance = d.enemy.boss ? 1.0 : 0.4;
  if(Math.random() <= chance){
    const it = genItem();
    d.runLoot.push(it);
    d.lootSecured = d.runLoot.length;
    logDungeon(`Loot dropped: <strong>${escapeHtml(it.name)}</strong>`);
  }else{
    logDungeon("No loot this fight.");
  }
}

function enemyAttack(){
  const d = state.dungeon;
  if(!d.active || !d.enemy) return;

    const stats = calcTotalStats();
  const reduced = Math.max(1, d.enemy.atk - Math.floor(stats.DEF * 0.6));
  d.hp -= reduced;
  logDungeon(`${escapeHtml(d.enemy.name)} hit you for <strong>${reduced}</strong>.`);

  if(d.hp <= 0){
    d.hp = 0;
    endDungeonRun("dead");
  }
}

function playerUseMove(slotIndex){
  const d = state.dungeon;
  if(!d.active || !d.enemy) return;

  const key = state.skills.moveset[slotIndex];
  if(!key){
    toast("Empty slot.");
    return;
  }
  const def = moveDef(key);
  if(!def){
    toast("Move not found.");
    return;
  }

  // Damage = move dmg + small STR scaling
  const stats = calcTotalStats();
  let dmg = Math.max(1, Math.round(def.dmg + stats.STR*0.8));

  // path bonus
  if(state.character.path === "bodybuilder") dmg = Math.round(dmg * 1.08);
  if(state.character.path === "athletic") dmg = Math.round(dmg * 1.03);

  d.enemy.hp -= dmg;
  logDungeon(`You used <strong>${escapeHtml(def.name)}</strong> for <strong>${dmg}</strong> damage.`);

  if(d.enemy.hp <= 0){
    d.enemy.hp = 0;
    logDungeon(`<strong>${escapeHtml(d.enemy.name)}</strong> defeated!`);

    giveLoot();

    if(d.enemy.boss){
      endDungeonRun("clear");
    }else{
      // next enemy
      spawnNextEnemy();
    }
    saveState();
    render();
    return;
  }

  // enemy counter-attack
  enemyAttack();

  saveState();
  render();
}

function escapeDungeon(){
  const d = state.dungeon;
  if(!d.active) return;
  endDungeonRun("escape");
  render();
}

function logDungeon(html){
  const d = state.dungeon;
  if(!d.log) d.log = [];
  d.log.unshift({ t: nowISO(), html });
  d.log = d.log.slice(0, 20);
}



/* -------------------- Dungeons Render -------------------- */

function renderDungeons(){
  const d = state.dungeon;

  $("dunRank").textContent = state.player.rank || "E";
  $("dunHP").textContent = d.active ? d.hp : getPlayerHP();
  $("lootSecured").textContent = d.lootSecured || 0;

  const enemyName = $("enemyName");
  const enemyFill = $("enemyHpFill");
  const enemyMeta = $("enemyMeta");

  if(!d.active || !d.enemy){
    enemyName.textContent = "No run active";
    enemyFill.style.width = "0%";
    enemyMeta.textContent = "Start a dungeon to fight.";
  }else{
    enemyName.textContent = d.enemy.name;
    const pct = Math.max(0, Math.min(100, Math.round((d.enemy.hp / d.enemy.maxHp) * 100)));
    enemyFill.style.width = pct + "%";
    enemyMeta.textContent = `Stage ${d.stage}/5 • ATK ${d.enemy.atk} • HP ${d.enemy.hp}/${d.enemy.maxHp}`;
  }

  $("btnStartDungeon").disabled = d.active;
  $("btnEscape").disabled = !d.active;

  // move buttons
  for(let i=0;i<3;i++){
    const btn = $("btnMove"+i);
    const key = state.skills.moveset[i];
    const def = key ? moveDef(key) : null;
    btn.disabled = !d.active || !def || !d.enemy;
    btn.textContent = def ? `${def.name} • DMG ${def.dmg}` : `Empty Slot`;
  }

  // log
  const logEl = $("dunLog");
  const log = d.log || [];
  if(log.length === 0){
    logEl.innerHTML = `<span class="tiny">No combat yet.</span>`;
  }else{
    logEl.innerHTML = log.map(x=>`<div style="margin-top:8px">${x.html}</div>`).join("");
  }
}

$("btnStartDungeon").addEventListener("click", ()=>{
  startDungeonRun();
  render();
});

$("btnEscape").addEventListener("click", ()=>{
  escapeDungeon();
});

$("btnMove0").addEventListener("click", ()=>playerUseMove(0));
$("btnMove1").addEventListener("click", ()=>playerUseMove(1));
$("btnMove2").addEventListener("click", ()=>playerUseMove(2));


/* -------------------- UI -------------------- */

let activeTab = "daily";
let activePage = "home";
let editingQuestId = null;

const questList = $("questList");
const emptyState = $("emptyState");

document.querySelectorAll(".navBtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".navBtn").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    activePage = btn.dataset.page;
    render();
  });
});

function renderPages(){
  const profile = document.querySelector(".profile");
  const questPanel = document.querySelector(".questPanel");
  const character = document.querySelector(".character");
  const skills = document.querySelector(".skills");
  const dungeons = document.querySelector(".dungeons");
  const shop = document.querySelector(".shop");

  if(activePage === "home"){
    profile.style.display = "";
    questPanel.style.display = "";
    character.style.display = "none";
    skills.style.display = "none";
    dungeons.style.display = "none";
    shop.style.display = "none";
  }
  if(activePage === "character"){
    profile.style.display = "none";
    questPanel.style.display = "none";
    character.style.display = "";
    skills.style.display = "none";
    dungeons.style.display = "none";
    shop.style.display = "none";
  }
  if(activePage === "skills"){
    profile.style.display = "none";
    questPanel.style.display = "none";
    character.style.display = "none";
    skills.style.display = "";
    dungeons.style.display = "none";
    shop.style.display = "none";
  }
  if(activePage === "dungeons"){
    profile.style.display = "none";
    questPanel.style.display = "none";
    character.style.display = "none";
    skills.style.display = "none";
    dungeons.style.display = "";
    shop.style.display = "none";
  }
  if(activePage === "shop"){
    profile.style.display = "none";
    questPanel.style.display = "none";
    character.style.display = "none";
    skills.style.display = "none";
    dungeons.style.display = "none";
    shop.style.display = "";
  }
}

document.querySelectorAll(".tab").forEach(t=>{
  t.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    t.classList.add("active");
    activeTab = t.dataset.tab;
    renderQuests();
  });
});

const backdrop = $("modalBackdrop");
const modalQuest = $("modalQuest");
const modalSettings = $("modalSettings");
const modalRank = $("modalRankTest");
const modalDailySetup = $("modalDailySetup");
const modalEquip = $("modalEquip");
const modalMovePick = $("modalMovePick");

function openModal(m){
  backdrop.classList.remove("hidden");
  m.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModals(){
  backdrop.classList.add("hidden");
  modalQuest.classList.add("hidden");
  modalSettings.classList.add("hidden");
  modalRank.classList.add("hidden");
  modalDailySetup.classList.add("hidden");
  modalEquip.classList.add("hidden");
  modalMovePick.classList.add("hidden");
  document.body.style.overflow = "";
  editingQuestId = null;
}

backdrop.addEventListener("click", closeModals);
$("btnCloseQuest").addEventListener("click", closeModals);
$("btnCloseSettings").addEventListener("click", closeModals);
$("btnCloseRank").addEventListener("click", closeModals);
$("btnCloseDailySetup").addEventListener("click", closeModals);

// Add quest
$("btnAddQuest").addEventListener("click", ()=>{
  editingQuestId = null;
  $("questModalTitle").textContent = "New Quest";
  $("btnDeleteQuest").classList.add("hidden");
  $("qTitle").value = "";
  $("qType").value = "side";
  $("qDiff").value = "normal";
  $("qXp").value = 25;
  $("qCr").value = 5;
  $("qNotes").value = "";
  openModal(modalQuest);
  setTimeout(()=> $("qTitle").focus(), 50);
});

// Save quest
$("btnSaveQuest").addEventListener("click", ()=>{
  const q = {
    id: editingQuestId || uid(),
    title: $("qTitle").value.trim(),
    type: $("qType").value,
    diff: $("qDiff").value,
    xp: Number($("qXp").value),
    cr: Number($("qCr").value),
    notes: $("qNotes").value.trim(),
    doneDay: null,
    createdAt: nowISO()
  };

  if(editingQuestId){
    const existing = state.quests.find(x=>x.id===editingQuestId);
    if(existing) q.doneDay = existing.doneDay;
    if(existing) q.createdAt = existing.createdAt;
  }

  const ok = upsertQuest(q);
  if(!ok){
    toast("Please enter a title.");
    return;
  }

  toast(editingQuestId ? "Quest updated." : "Quest created.");
  closeModals();
  render();
});

$("btnDeleteQuest").addEventListener("click", ()=>{
  if(!editingQuestId) return;
  deleteQuest(editingQuestId);
  closeModals();
  render();
});

// Settings
$("btnSettings").addEventListener("click", ()=>{
  $("sName").value = state.player.name || "Elias";
  $("sAccent").value = state.settings.accent || "purple";
  $("sSound").value = state.settings.sound || "on";
  openModal(modalSettings);
});

$("btnSaveSettings").addEventListener("click", ()=>{
  state.player.name = ($("sName").value || "Elias").trim().slice(0,20) || "Elias";
  state.settings.accent = $("sAccent").value;
  state.settings.sound = $("sSound").value;
  setAccent(state.settings.accent);
  saveState();
  toast("Saved.");
  closeModals();
  render();
});

$("btnResetAll").addEventListener("click", ()=>{
  const ok = confirm("Reset everything? This cannot be undone.");
  if(!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(defaultState);
  makeDailyQuestsForToday();
  setAccent(state.settings.accent);
  saveState();
  toast("Reset done.");
  render();
});

// Rank test
$("btnSaveRank").addEventListener("click", ()=>{
  const push = Number($("rtPush").value||0);
  const pull = Number($("rtPull").value||0);
  const plank = Number($("rtPlank").value||0);

  const r = computeRank(push, pull, plank);
  state.player.rank = r;
  state.player.onboardingDone = true;

  toast(`Rank assigned: ${r} ⚔️`);

  saveState();
  closeModals();
  render();
});

// Daily setup
$("btnDailySetup").addEventListener("click", ()=>{
  const pool = state.dailyConfig.exercisePool;
  const selected = state.dailyConfig.selected || [];

  function fill(selId, val){
    const sel = $(selId);
    sel.innerHTML = "";
    pool.forEach(p=>{
      const opt = document.createElement("option");
      opt.value = p.key;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
    sel.value = val || pool[0].key;
  }

  fill("d1", selected[0]);
  fill("d2", selected[1]);
  fill("d3", selected[2]);
  fill("d4", selected[3]);

  $("dailyBase").value = state.dailyConfig.baseDiff || "normal";
  $("dailyMode").value = state.dailyConfig.mode || "strict";

  openModal(modalDailySetup);
});

$("btnSkipToday").addEventListener("click", ()=>{
  skipToday();
  closeModals();
  render();
});

$("btnSaveDailySetup").addEventListener("click", ()=>{
  const picks = [$("d1").value, $("d2").value, $("d3").value, $("d4").value];
  const uniq = [...new Set(picks)];
  if(uniq.length < 4){
    toast("Please pick 4 different exercises.");
    return;
  }

  state.dailyConfig.selected = picks;
  state.dailyConfig.baseDiff = $("dailyBase").value;
  state.dailyConfig.mode = $("dailyMode").value;

  makeDailyQuestsForToday();

  saveState();
  toast("Saved.");
  closeModals();
  render();
});

function render(){
  ensureNewDay();
  setAccent(state.settings.accent);

  $("playerName").textContent = state.player.name;
  $("playerLevel").textContent = state.player.level;
  $("rank").textContent = state.player.rank || "E";
  $("streak").textContent = state.player.streak;
  $("crystals").textContent = state.player.crystals;
  $("todayXp").textContent = state.player.todayXp;

  const need = xpForLevel(state.player.level);
  $("xpText").textContent = `${state.player.xp} / ${need} XP`;
  $("xpFill").style.width = `${clamp((state.player.xp/need)*100,0,100)}%`;

  renderQuests();
  renderCharacter();
  renderSkills();
  renderDungeons();
  renderShop();
  renderPages();
}

function diffBadge(diff){
  if(diff === "easy") return `<span class="badge good">Easy</span>`;
  if(diff === "hard") return `<span class="badge warn">Hard</span>`;
  if(diff === "boss") return `<span class="badge boss">Boss</span>`;
  return `<span class="badge">Normal</span>`;
}

function typeBadge(type){
  if(type === "daily") return `<span class="badge accent">Daily</span>`;
  if(type === "main") return `<span class="badge accent">Main</span>`;
  return `<span class="badge accent">Side</span>`;
}

function renderQuests(){
  ensureNewDay();
  const tk = todayKey();
  const qs = state.quests.filter(q=>q.type===activeTab);

  questList.innerHTML = "";

  if(qs.length === 0){
    emptyState.style.display = "";
    return;
  }
  emptyState.style.display = "none";

  qs.forEach(q=>{
    const done = (q.doneDay === tk);
    const el = document.createElement("div");
    el.className = "quest";
    el.innerHTML = `
      <div class="qLeft">
        <div class="check ${done ? "done":""}" title="${done ? "Undo" : "Complete"}">
          ${done ? "✔" : ""}
        </div>
        <div class="qBody" style="min-width:0">
          <div class="qTitle">${escapeHtml(q.title)}</div>
          ${q.notes ? `<div class="qNotes">${escapeHtml(q.notes)}</div>` : ""}
          <div class="qMeta">
            ${typeBadge(q.type)}
            ${q.autoDaily ? `<span class="badge accent">Mandatory</span>` : ""}
            ${diffBadge(q.diff)}
            <span class="badge">+${q.xp} XP</span>
            <span class="badge">+${q.cr} 💎</span>
          </div>
        </div>
      </div>
      <div class="qRight">
        ${q.autoDaily ? "" : `<button class="smallBtn" title="Edit">✏️</button>`}
      </div>
    `;

    const check = el.querySelector(".check");
    check.addEventListener("click", ()=>{
      if(done) uncompleteQuest(q.id);
      else completeQuest(q.id);
      render();
    });

    const editBtn = el.querySelector(".smallBtn");
    if(editBtn){
      editBtn.addEventListener("click", ()=>{
        editingQuestId = q.id;
        $("questModalTitle").textContent = "Edit Quest";
        $("btnDeleteQuest").classList.remove("hidden");
        $("qTitle").value = q.title;
        $("qType").value = q.type;
        $("qDiff").value = q.diff;
        $("qXp").value = q.xp;
        $("qCr").value = q.cr;
        $("qNotes").value = q.notes || "";
        openModal(modalQuest);
        setTimeout(()=> $("qTitle").focus(), 50);
      });
    }

    questList.appendChild(el);
  });
}

function renderShop(){
  const grid = $("shopGrid");
  grid.innerHTML = "";

  state.rewards.forEach(r=>{
    const el = document.createElement("div");
    el.className = "shopItem";
    el.innerHTML = `
      <div class="shopName">${escapeHtml(r.name)}</div>
      <div class="shopDesc">${escapeHtml(r.desc)}</div>
      <div class="shopBottom">
        <div class="price">${r.price} 💎</div>
        <button class="primaryBtn">Buy</button>
      </div>
    `;
    el.querySelector("button").addEventListener("click", ()=> buyReward(r.id));
    grid.appendChild(el);
  });
}

// Onboarding: show Rank Test on first start
setTimeout(()=>{
  if(!state.player.onboardingDone){
    openModal(modalRank);
  }
}, 250);

// PWA service worker
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  });
}

// Init
ensureNewDay();
makeDailyQuestsForToday();
render();
