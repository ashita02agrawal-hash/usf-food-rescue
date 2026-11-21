/* student.js
 * Owner: Student-app teammate (Rithva)
 * Student app: home feed, reserve and confirm, pickup timer, impact, profile and no-show policy.
 */
"use strict";

let bbSplash = true;
const BB_LB_PER_SERVING = 0.5;
const BB_CLUB_LOGOS = {
  "ACM": "icons/acm.jpg",
  "Finance Association": "icons/finance.png",
  "Robotics Club": "icons/robotics.jpg",
  "Vietnamese Student Association": "icons/vsa.jpg",
  "Entrepreneurship Club": "icons/entrepreneurship.png",
  "Chess Club": "icons/chess.jpg",
  "Campus Rec Outdoors": "icons/campusrec.png",
  "Society of Women Engineers": "icons/swe.webp",
  "Indian Student Association": "icons/isa.webp",
};
const BB_ICON = {
  bell: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  back: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`,
  check: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>`,
  home: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>`,
  impact: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.5-6"/></svg>`,
  board: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>`,
  profile: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
};

function bbClubLogo(club) {
  const src = BB_CLUB_LOGOS[club];
  const initials = esc(String(club || "").split(" ").map(w => w[0]).join("").slice(0, 3));
  if (!src) return `<span class="bb-initials" aria-hidden="true">${initials}</span>`;
  return `<img src="${esc(src)}" alt="${esc(club)} logo" class="bb-club-logo" onerror="this.outerHTML='<span class=&quot;bb-initials&quot;>${initials}</span>'">`;
}
// Building name for a post. Clubs can type any building, so fall back to what they typed.
const bbPlace = code => LOCS[code]?.name || code || "On campus";
// Walking distance in meters, or null when we don't have coordinates for that building.
const bbDist = (from, to) => (LOCS[from] && LOCS[to]) ? haversine(LOCS[from], LOCS[to]) : null;
const bbPicked = who => state.claims.filter(c => c.status === "picked" && (!who || c.student === who)).reduce((s, c) => s + c.portions, 0);
const bbGo = (sv, extra) => { ui.sv = sv; Object.assign(ui, extra || {}); store.set("pw_ui", ui); renderStudent(); };
function pickupCloseAt(p){ return Math.min(p.windowEnd, p.outSince + 2*3600000); }

function renderStudent(){
  const pane = $("#studentPane");
  if(bbSplash){
    pane.innerHTML = `<div class="bb bb-splash"><img src="img/usf-logo.png" alt="" class="bb-splash-logo"><div class="bb-logo">Platewise</div><p>Predict. Rescue. Waste less.</p></div>`;
    setTimeout(() => { bbSplash = false; renderStudent(); }, 1100);
    return;
  }
  const st = state.students[ME], near = ui.near || "LIB", avoid = ui.avoid || [];
  const myActive = state.claims.find(c => c.student === ME && ["held","onway"].includes(c.status));

  const all = state.posts.filter(p => p.status === "live")
    .map(p => ({p, d: bbDist(near, p.location), left: portionsLeft(p)}))
    .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity));
  const nearby = all.filter(x => x.d !== null && x.d < 900);

  // Alert for posts this student hasn't seen yet.
  const seen = new Set(ui.seen || []);
  const fresh = all.filter(x => !seen.has(x.p.id));
  if(fresh.length && ui.seenInit) fresh.forEach(x => notify(x.p, avoid));
  ui.seen = [...new Set([...(ui.seen || []), ...all.map(x => x.p.id)])]; ui.seenInit = true; store.set("pw_ui", ui);

  if(ui.sv === "claim" && !(myActive && myActive.status === "held")) ui.sv = myActive ? "success" : "home";
  if(ui.sv === "success" && !myActive) ui.sv = "home";
  const sv = ui.sv || "home";
  const x = {st, near, avoid, myActive, all, nearby};
  const screens = {home: bbHome, detail: bbDetail, claim: bbClaim, success: bbSuccess, impact: bbImpact, board: bbBoard, profile: bbProfile};
  const body = (screens[sv] || bbHome)(x);
  const tabs = [["home","Home"],["impact","Impact"],["board","Leaders"],["profile","Profile"]];
  const tab = ["detail","claim","success"].includes(sv) ? "home" : sv;

  pane.innerHTML = `<div class="bb"><div class="bb-body">${body}</div>
    <nav class="bb-nav" aria-label="Student navigation">${tabs.map(([k, l]) => `<button data-go="${k}" ${tab === k ? 'aria-current="page"' : ""}>${BB_ICON[k]}<span>${l}</span></button>`).join("")}</nav></div>`;
  bbBind(pane, x);
}

function bbHome({st, near, myActive, all, nearby}){
  const rescued = bbPicked();
  const others = all.filter(x => !nearby.includes(x));
  return `<header class="bb-top"><div><h1>Hi, ${esc(st.name.split(" ")[0])}</h1><p>Let’s save some food today</p></div>
      <button class="bb-bell ${ui.alerts ? "on" : ""}" data-alerts aria-label="${ui.alerts ? "Alerts on" : "Turn on alerts"}">${BB_ICON.bell}</button></header>
    <section class="bb-hero"><p>Together, USF has rescued</p><b class="num">${rescued} serving${rescued === 1 ? "" : "s"}</b><span>about ${Math.round(rescued * BB_LB_PER_SERVING)} lbs kept out of the trash</span></section>
    ${st.suspended ? `<div class="banner bad"><b>Claiming is paused for the rest of the semester.</b> You missed ${st.strikes.length} pickups.</div>` : ""}
    ${myActive ? bbActiveBar(myActive) : ""}
    <div class="bb-sec"><h2>Near you</h2>
      <label class="bb-near"><span>I’m at</span><select id="near" aria-label="Where you are">${Object.entries(LOCS).map(([k, v]) => `<option value="${k}" ${k === near ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label></div>
    ${nearby.length ? nearby.map(bbCard).join("") : `<div class="bb-empty">No leftovers within a short walk right now.</div>`}
    <div class="bb-sec"><h2>Across campus</h2><p>Everything else clubs have posted</p></div>
    ${others.length ? others.map(bbCard).join("") : `<div class="bb-empty">Nothing else posted on campus right now.</div>`}`;
}

function bbCard({p, d, left}){
  const closeAt = pickupCloseAt(p);
  return `<article class="bb-card"><div class="bb-img">${bbClubLogo(p.club)}</div>
    <div class="bb-cbody">
      <div class="bb-title-row">
        <h3>${esc(p.food)}</h3>
        <span class="pill live"><span class="dot"></span>${left} left</span>
      </div>
      <dl class="bb-facts">
        <div><dt>Where</dt><dd>${esc(p.spot || bbPlace(p.location))}</dd></div>
        <div><dt>Distance</dt><dd>${d === null ? esc(bbPlace(p.location)) : walk(d)}</dd></div>
        <div><dt>Closes in</dt><dd><b class="num" data-until="${closeAt}">${mmss(closeAt - now())}</b></dd></div>
        <div><dt>From</dt><dd>${esc(p.club)} · ${esc(p.eventName || "Club event")}</dd></div>
      </dl>
      <button class="bb-btn" data-open="${p.id}">Reserve</button>
    </div></article>`;
}

function bbActiveBar(c){
  const held = c.status === "held";
  return `<button class="bb-active" data-go="${held ? "claim" : "success"}"><span>${held ? "Held for you. Tap to confirm" : `Pick up within ${POLICY.pickupMin} min`}</span><b class="num" data-until="${held ? c.holdUntil : c.pickupBy}">${mmss((held ? c.holdUntil : c.pickupBy) - now())}</b></button>`;
}

function bbDetail(x){
  const {st, myActive} = x;
  const p = state.posts.find(p => p.id === ui.postId);
  if(!p || p.status !== "live"){ ui.sv = "home"; return bbHome(x); }
  const left = portionsLeft(p), closeAt = pickupCloseAt(p);
  const can = !st.suspended && !myActive && left > 0 && closeAt - now() > 3*60000;
  const why = st.suspended ? "Claiming is paused" : myActive ? "Finish your current pickup first" : left <= 0 ? "All claimed" : closeAt - now() <= 3*60000 ? "Closing soon" : "";
  return `<button class="bb-back" data-go="home">${BB_ICON.back}Back</button>
    <div class="bb-card">
      <div class="bb-img">${bbClubLogo(p.club)}</div>
      <div class="bb-cbody">
        <div class="bb-title-row"><h1>${esc(p.food)}</h1><span class="pill live"><span class="dot"></span>${left} left</span></div>
        <dl class="bb-facts">
          <div><dt>Pickup</dt><dd>${esc(p.spot || bbPlace(p.location))}</dd></div>
          <div><dt>Closes in</dt><dd><b class="num" data-until="${closeAt}">${mmss(closeAt - now())}</b></dd></div>
          <div><dt>Hosted by</dt><dd>${esc(p.club)} · ${esc(p.eventName || "Club event")}</dd></div>
          <div><dt>Allergens</dt><dd>${p.allergens.length ? esc(p.allergens.join(", ")) : "None listed"}</dd></div>
        </dl>
        <div class="bb-claims">
          ${[1, 2].filter(n => n <= POLICY.maxPortions).map(n => `<button class="bb-btn ${n > 1 ? "ghost" : ""}" data-claim="${p.id}" data-n="${n}" ${can && left >= n ? "" : "disabled"}>Reserve ${n} serving${n === 1 ? "" : "s"}</button>`).join("")}
        </div>
        <p class="bb-note">${why ? esc(why) + "." : `We hold it for ${POLICY.holdSec} seconds while you confirm, then you have ${POLICY.pickupMin} minutes to pick it up.`}</p>
      </div>
    </div>`;
}

function bbClaim({myActive: c}){
  const p = state.posts.find(p => p.id === c.postId);
  return `<div class="bb-center"><div class="bb-ring"><b class="num" data-until="${c.holdUntil}">${mmss(c.holdUntil - now())}</b><span>to confirm</span></div>
    <h1>Reserved for you</h1><p>${c.portions} × ${esc(p.food)}<br>${esc(p.spot || bbPlace(p.location))}</p>
    <button class="bb-btn" data-confirm="${c.id}">I’m on my way</button>
    <button class="bb-btn ghost" data-cancel="${c.id}">Cancel</button>
    <p class="bb-note">Confirming starts your ${POLICY.pickupMin}-minute pickup timer.</p></div>`;
}

function bbSuccess({myActive: c}){
  const p = state.posts.find(p => p.id === c.postId);
  return `<div class="bb-center"><div class="bb-check">${BB_ICON.check}</div><h1>You’re all set</h1>
    <p>${c.portions} serving${c.portions === 1 ? "" : "s"} of ${esc(p.food)}</p>
    <div class="bb-pick"><span>Pick up within</span><b class="num" data-until="${c.pickupBy}">${mmss(c.pickupBy - now())}</b><p><b>Where:</b> ${esc(p.spot || bbPlace(p.location))}</p><p class="bb-note">If the timer runs out, the food goes back to other students and it counts as a missed pickup.</p></div>
    <button class="bb-btn" data-go="home">Find more food</button>
    <button class="bb-btn ghost" data-cancel="${c.id}">Cancel reservation</button></div>`;
}

function bbImpact(){
  const n = bbPicked(ME);
  return `<header class="bb-top"><div><h1>Your impact</h1><p>Food you kept out of the trash</p></div></header>
    <section class="bb-hero"><p>Waste prevented</p><b class="num">${Math.round(n * BB_LB_PER_SERVING * 10) / 10} lbs</b><span>${n} serving${n === 1 ? "" : "s"} picked up · about $${n * COST_PER_SERVING} of food</span></section>`;
}

function bbBoard(){
  const byClub = {};
  state.claims.filter(c => c.status === "picked").forEach(c => { const p = state.posts.find(p => p.id === c.postId); if(p) byClub[p.club] = (byClub[p.club] || 0) + c.portions; });
  const rows = Object.entries(byClub).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<header class="bb-top"><div><h1>Leaderboard</h1><p>Clubs whose leftovers got rescued</p></div></header>
    ${rows.length ? `<ol class="bb-board">${rows.map(([club, n]) => `<li><span>${esc(club)}</span><b class="num">${n}</b></li>`).join("")}</ol>` : `<div class="bb-empty">The board fills in once students pick up food.</div>`}`;
}

function bbProfile({st, avoid}){
  return `<header class="bb-top"><div><h1>Profile</h1><p>${esc(st.name)}</p></div></header>
    <section class="bb-card bb-pad">
      <div class="bb-title-row"><h3>Missed pickups</h3><span class="strikes">${[...Array(POLICY.totalLimit)].map((_, i) => `<i class="${i < st.strikes.length ? "on" : ""}"></i>`).join("")}</span></div>
      <p class="bb-note">Cancel within ${POLICY.freeCancelSec} seconds for free. ${POLICY.consecutiveLimit} missed in a row or ${POLICY.totalLimit} in a semester pauses claiming until next semester.</p>
    </section>
    <section class="bb-card bb-pad">
      <h3>Hide alerts for</h3>
      <div class="chips" id="avoid" style="margin-top:10px">${ALLERGENS.map(a => `<button class="chip" data-av="${a}" aria-pressed="${avoid.includes(a)}">${a}</button>`).join("")}</div>
    </section>`;
}

function bbBind(pane, x){
  const all = s => pane.querySelectorAll(s);
  all("[data-go]").forEach(b => b.onclick = () => bbGo(b.dataset.go));
  all("[data-open]").forEach(b => b.onclick = () => bbGo("detail", {postId: b.dataset.open}));
  all("[data-claim]").forEach(b => b.onclick = () => {
    claim(b.dataset.claim, +b.dataset.n);
    if(state.claims.some(c => c.student === ME && c.status === "held")) bbGo("claim");
  });
  all("[data-confirm]").forEach(b => b.onclick = () => {
    const c = state.claims.find(c => c.id === b.dataset.confirm), p = c && state.posts.find(p => p.id === c.postId);
    if(!p || c.status !== "held" || c.holdUntil < now() || pickupCloseAt(p) <= now()) return;
    c.status = "onway"; c.pickupBy = Math.min(now() + POLICY.pickupMin * 60000, pickupCloseAt(p));
    save(); bbGo("success"); onStateChange();
  });
  all("[data-cancel]").forEach(b => b.onclick = () => { cancelClaim(b.dataset.cancel); bbGo("home"); });
  const near = pane.querySelector("#near");
  if(near) near.onchange = e => { ui.near = e.target.value; store.set("pw_ui", ui); renderStudent(); };
  const av = pane.querySelector("#avoid");
  if(av) av.onclick = e => { const b = e.target.closest("[data-av]"); if(!b) return; const a = b.dataset.av; ui.avoid = x.avoid.includes(a) ? x.avoid.filter(v => v !== a) : [...x.avoid, a]; store.set("pw_ui", ui); renderStudent(); };
  all("[data-alerts]").forEach(b => b.onclick = async () => {
    ui.alerts = true; store.set("pw_ui", ui);
    try{ if("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); }catch(e){}
    renderStudent(); toast("Alerts on", "You'll get a ping when a club posts food.");
  });
}

function walk(d){ const m=Math.round(d/10)*10, min=Math.max(1,Math.round(d/80)); return `${m<1000?m+" m":(d/1609).toFixed(1)+" mi"} · ${min} min walk`; }
function claim(postId, n){
  const st=state.students[ME], p=state.posts.find(p=>p.id===postId);
  if(!p || p.status!=="live" || st.suspended || !Number.isInteger(n) || n<1 || n>POLICY.maxPortions ||
    portionsLeft(p)<n || pickupCloseAt(p)-now()<=3*60000 ||
    state.claims.some(c=>c.student===ME && ["held","onway"].includes(c.status))) return;
  const t=now();
  state.claims.push({id:uid("c"), postId, student:ME, portions:n, createdAt:t, holdUntil:t+POLICY.holdSec*1000, status:"held"});
  save(); onStateChange();
}
function cancelClaim(id){
  const c=state.claims.find(c=>c.id===id); if(!c) return;
  const free = c.status==="held" || now()-c.createdAt < POLICY.freeCancelSec*1000;
  c.status="canceled"; if(!free) addStrike(c.student,"Late cancel");
  save(); onStateChange(); toast(free?"Canceled":"Canceled late", free?"No strike. Portions went back to the pool.":"That counts as a strike. Portions went back to the pool.");
}
function notify(p, avoid){
  if(p.allergens.some(a=>avoid.includes(a))) return;
  const d = bbDist(ui.near||"LIB", p.location);
  const body=`${portionsLeft(p)} portions at ${bbPlace(p.location)}${d===null?"":" · "+walk(d)}`;
  toast(`Free food: ${p.food}`, body, "rescue");
  try{ if(ui.alerts && "Notification" in window && Notification.permission==="granted"){
    const title="Platewise: free "+p.food, opts={body, icon:"icons/icon-192.png", tag:p.id};
    // Phones only allow notifications through the service worker
    if(navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r=>r.showNotification(title,opts)).catch(()=>{});
    else new Notification(title, opts); } }catch(e){}
  try{ navigator.vibrate && navigator.vibrate(120); }catch(e){}
}
