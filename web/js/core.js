/* core.js
 * Owner: Ashita (shared: open a PR and ask before changing)
 * Utilities, constants, shared state (posts, claims, students), cross-tab/device sync, the view router.
 */
"use strict";
/* ============================================================
   Platewise: predict, then rescue.
   All data shown is SAMPLE DATA generated to mirror patterns seen at USF.
   ============================================================ */

// ---------- small utils ----------
const $ = (s, el=document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clamp = (x,a,b) => Math.max(a, Math.min(b, x));
const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
const uid = p => p + Math.random().toString(36).slice(2,8);
function makeRng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
const store = {get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}, set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const now = () => Date.now() + (state?.offsetMs || 0);
const fmtTime = ts => new Date(ts).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
const fmtHour = h => { const d=new Date(); d.setHours(h,0,0,0); return d.toLocaleTimeString([], {hour:"numeric"}); };
const mmss = ms => { ms=Math.max(0,ms); const m=Math.floor(ms/60000), s=Math.floor(ms%60000/1000); return m+":"+String(s).padStart(2,"0"); };
const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAY_NAMES = {Mon:"Monday",Tue:"Tuesday",Wed:"Wednesday",Thu:"Thursday",Fri:"Friday",Sat:"Saturday",Sun:"Sunday"};
const TYPES = ["General meeting","Workshop","Social","Cultural night","Speaker panel","Floor event"];
const ALLERGENS = ["gluten","dairy","nuts","soy","eggs"];
const COST_PER_SERVING = 4; // est. USD
const BUFFER = 1.15;
const PICKUP_SPOTS = {MSC:"MSC 2nd floor, table outside room 2707",LIB:"Library 1st floor, by the Starbucks",ENB:"ENB lobby, table by room 109",BSN:"Muma atrium, front table",ISA:"ISA 1st floor lobby",CPR:"Cooper Hall 1st floor lounge",VIL:"Village LLC lounge, Juniper Hall",REC:"Rec Center front desk"};
const FOOD_UNITS = {
  "pizza":{per:3/8,unit:"pizzas",note:"3 slices a person"},
  "bagels & cookies":{per:1,unit:"bagels",note:"plus the same number of cookies"},
  "wings":{per:6,unit:"wings",note:"6 a person"},
  "donuts":{per:1.5,unit:"donuts"},
  "cookies & coffee":{per:2,unit:"cookies",note:"2 a person"},
  "sandwich platters":{per:0.1,unit:"platters",note:"1 platter feeds about 10"},
  "Chick-fil-A nuggets":{per:1,unit:"8-count trays"},
};
const NAMES = ["Priya","Marcus","Sofia","Dev","Aaliyah","Chris","Mei","Andre","Hannah","Omar","Leah","Tyler","Nadia","Ethan","Grace","Rohan"];
function eboard(club){ let h=0; for(const c of club) h=(h*31+c.charCodeAt(0))>>>0; return [0,1,2,3].map(i=>NAMES[(h+i*5)%NAMES.length]); }
function units(servings, food){ const u=FOOD_UNITS[food]; if(!u) return {n:Math.ceil(servings), unit:"servings", note:""}; return {n:Math.max(1,Math.ceil(servings*u.per)), unit:u.unit, note:u.note||""}; }
function semesterWeek(dateStr){ const d=new Date(dateStr+"T12:00:00"); const y=d.getFullYear(); const start = d.getMonth()>=7 ? new Date(y,7,24) : new Date(y,0,12); return clamp(Math.floor((d-start)/604800000)+1,1,16); }
function semesterName(dateStr){ const d=new Date(dateStr+"T12:00:00"); return (d.getMonth()>=7?"Fall ":"Spring ")+d.getFullYear(); }
function dow(dateStr){ return DAYS[(new Date(dateStr+"T12:00:00").getDay()+6)%7]; }
function todayStr(){ const d=new Date(now()); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function haversine(a,b){ const R=6371000, toR=x=>x*Math.PI/180; const dLat=toR(b.lat-a.lat), dLon=toR(b.lon-a.lon); const h=Math.sin(dLat/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }

// ============================================================
// SHARED STATE (posts, claims, students). Synced across tabs and devices.
// ============================================================
const POLICY = { holdSec:60, pickupMin:15, freeCancelSec:60, consecutiveLimit:2, totalLimit:3, maxPortions:2 };
let state, ui;
const ME = "s_jordan";
function freshState(){
  return { v:1, updatedAt:0, offsetMs:0, learned:[], planned:[], posts:[], claims:[],
    students:{ [ME]:{name:"Jordan Lee", strikes:[], consecutive:0, suspended:false}, s_taylor:{name:"Taylor Kim",strikes:[],consecutive:0,suspended:false}, s_sam:{name:"Sam Ortiz",strikes:[],consecutive:0,suspended:false} },
    rotation:{} };
}
function seed(club){
  // one event that already happened today, waiting for results
  const t=new Date(now()); const h=Math.max(9, t.getHours()-1);
  const c = META.clubs.find(c=>c.club===club) || META.clubs[0];
  if(!state.planned.some(p=>p.club===club && p.status==="planned")){
    const ev = {id:uid("e"), club, event_type: club==="Village STEM LLC"?"Floor event":"General meeting", date:todayStr(), start_hour:h, location:c.home, rsvps: club==="ACM"?70:36, food_item:c.food_item, caterer:c.caterer, allergens:c.allergens.slice(), status:"planned"};
    const p = predictEvent(ev); ev.pred = Math.round(p.people); ev.recServings = p.servings; ev.ordered = ev.rsvps; // ordered for all RSVPs before Platewise
    state.planned.push(ev);
  }
  // a live post from another club so the student feed isn't empty
  if(!state.posts.some(p=>p.status==="live")){
    const t0=now();
    state.posts.push({id:"p_seed_"+todayStr(), club:"Pre-Med Society", eventName:"Speaker panel", food:"Chick-fil-A nuggets", caterer:"Chick-fil-A (MSC)", allergens:["gluten","soy"], location:"ISA", spot:PICKUP_SPOTS.ISA, total:14, outSince:t0-35*60000, windowEnd:t0+18*60000, createdAt:t0-4*60000, onDuty:"Hannah", status:"live"});
  }
}
let room=null, bc=null;
function save(){ state.updatedAt=Date.now(); store.set("pw_state", state); try{bc&&bc.postMessage(state)}catch(e){} roomSync(); }
// Cross-device sync over the artifact room: messages max out at 4 KiB, so send only the live rescue slice.
function slim(){ const posts=state.posts.filter(p=>p.status==="live").concat(state.posts.filter(p=>p.status!=="live").slice(-2)); const ids=new Set(posts.map(p=>p.id));
  return {updatedAt:state.updatedAt, offsetMs:state.offsetMs, posts, claims:state.claims.filter(c=>ids.has(c.postId)), students:state.students}; }
function roomSync(){ if(!room) return; try{ let d=slim(); if(JSON.stringify(d).length>3900){ d.posts=d.posts.filter(p=>p.status==="live"); } room.emit("sync", d).catch(()=>{}); }catch(e){} }
function applySlim(d){
  if(!d || !d.updatedAt || d.updatedAt<=state.updatedAt) return;
  const byId=(arr,inc)=>{ const m=new Map(arr.map(x=>[x.id,x])); (inc||[]).forEach(x=>m.set(x.id,x)); return [...m.values()]; };
  state.posts=byId(state.posts,d.posts); state.claims=byId(state.claims,d.claims); if(d.students) state.students=d.students; state.offsetMs=d.offsetMs||0; state.updatedAt=d.updatedAt;
  store.set("pw_state",state); onStateChange(); }
function applyRemote(s){ if(!s || !s.updatedAt || s.updatedAt<=state.updatedAt) return; state=s; store.set("pw_state",state); onStateChange(); }
function portionsLeft(p){ return p.total - state.claims.filter(c=>c.postId===p.id && ["held","onway","picked"].includes(c.status)).reduce((s,c)=>s+c.portions,0); }
function addStrike(sid, reason){
  const st=state.students[sid]; if(!st) return;
  st.strikes.push({at:now(), reason}); st.consecutive++;
  if(st.consecutive>=POLICY.consecutiveLimit || st.strikes.length>=POLICY.totalLimit) st.suspended=true;
}
// Time-driven transitions, idempotent so every open view can run them.
function process(){
  let changed=false; const t=now();
  for(const c of state.claims){
    if(c.status==="held" && t>c.holdUntil){ c.status="expired"; changed=true; if(c.student===ME) toast("Hold expired","Those portions went back to the pool. No strike."); }
    if(c.status==="onway" && t>c.pickupBy){ c.status="noshow"; addStrike(c.student,"No-show"); changed=true; if(c.student===ME) toast("Missed pickup","That counts as a no-show strike. Portions were released."); }
  }
  for(const p of state.posts){
    if(p.status==="live" && (t>p.windowEnd || t>p.outSince+2*3600000)){ p.status="closed"; changed=true;
      state.claims.filter(c=>c.postId===p.id && c.status==="held").forEach(c=>c.status="expired"); }
    if(p.status==="live" && portionsLeft(p)<=0 && !state.claims.some(c=>c.postId===p.id && ["held","onway"].includes(c.status))){ p.status="closed"; changed=true; }
  }
  if(changed){ save(); onStateChange(); }
}

// ============================================================
// UI
// ============================================================
function toast(title, body, kind){
  const el=document.createElement("div"); el.className="toast"+(kind?" "+kind:""); el.innerHTML=`<b>${esc(title)}</b><span>${esc(body||"")}</span>`;
  $("#toasts").appendChild(el); setTimeout(()=>el.remove(), 5200);
}
function setView(v){ ui.view=v; store.set("pw_ui", ui); render(); }

function render(){
  const loggedIn = ui.club || ui.student;
  $("#login").hidden = !!loggedIn; $("#stage").hidden = !loggedIn; $("#foot").hidden = !loggedIn; $("#viewSeg").hidden = !(ui.club && ui.student);
  if(!loggedIn){ renderLogin(); return; }
  let v = ui.view; if(!ui.club) v="student"; if(!ui.student) v="club";
  document.querySelectorAll("#viewSeg button").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.view===v)));
  const stage=$("#stage"); stage.className = "stage" + (v==="club"?" one":v==="student"?" student-only":"");
  $("#clubPane").hidden = v==="student"; $("#studentPane").hidden = v==="club";
  if(v!=="student") renderClub();
  if(v!=="club") renderStudent();
}
function onStateChange(){ if(!(ui.club||ui.student)) return; if(ui.club && !$("#clubPane").hidden) renderClubDynamic(); if(ui.student && !$("#studentPane").hidden) renderStudent(); }

