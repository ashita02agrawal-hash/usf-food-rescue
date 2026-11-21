/* student.js - Bulls Bites Student App Frontend */
"use strict";

let bbSplash = true;
const BB_LB_PER_SERVING = 0.5;
const bbPicked = who => state.claims.filter(c => c.status === "picked" && (!who || c.student === who)).reduce((s, c) => s + c.portions, 0);
const bbGo = (sv, extra) => { ui.sv = sv; Object.assign(ui, extra || {}); store.set("pw_ui", ui); renderStudent(); };

function renderStudent(){
  const pane = $("#studentPane");
  if(bbSplash){
    pane.innerHTML = `<div class="bb bb-splash"><div class="bb-logo">Bulls<br>Bites</div><p>Predict. Rescue. Waste less.</p></div>`;
    setTimeout(() => { bbSplash = false; renderStudent(); }, 1200);
    return;
  }
  const st = state.students[ME], near = ui.near || "LIB", avoid = ui.avoid || [];
  const myActive = state.claims.find(c => c.student === ME && ["held","onway"].includes(c.status));
  
  const live = state.posts.filter(p => p.status === "live")
    .map(p => ({p, d: haversine(LOCS[near], LOCS[p.location]), left: portionsLeft(p)}))
    .sort((a, b) => a.d - b.d);

  const allCampusLive = state.posts.filter(p => p.status === "live")
    .map(p => ({p, left: portionsLeft(p)}));

  if(ui.sv === "claim" && !(myActive && myActive.status === "held")) ui.sv = myActive ? "success" : "home";
  if(ui.sv === "success" && !myActive) ui.sv = "home";
  const sv = ui.sv || "home";
  const x = {st, near, avoid, myActive, live, allCampusLive};
  const screens = {home: bbHome, detail: bbDetail, claim: bbClaim, success: bbSuccess, impact: bbImpact, board: bbBoard, profile: bbProfile};
  const body = (screens[sv] || bbHome)(x);
  const tabs = [["home","Home"],["impact","Impact"],["board","Leaderboard"],["profile","Profile"]];
  const tab = ["detail","claim","success"].includes(sv) ? "home" : sv;

  pane.innerHTML = `<div class="bb"><div class="bb-body">${body}</div>
    <nav class="bb-nav" aria-label="Student navigation">${tabs.map(([k, l]) => `<button data-go="${k}" ${tab === k ? 'aria-current="page"' : ""}>${l}</button>`).join("")}</nav></div>`;
  bbBind(pane, x);
}

function bbHome({st, near, avoid, myActive, live, allCampusLive}){
  const rescued = bbPicked();

  return `<header class="bb-top"><div><h1>Hi, ${esc(st.name.split(" ")[0])}</h1><p>Let’s save some food today</p></div>
      <button class="bb-bell" data-alerts aria-label="Notifications">🔔</button></header>
    <section class="bb-hero"><div><p>Together, USF has rescued</p><b>${rescued} serving${rescued === 1 ? "" : "s"}</b><span>about ${Math.round(rescued * BB_LB_PER_SERVING)} lbs kept out of the trash</span></div></section>
    ${myActive ? bbActiveBar(myActive) : ""}
    
    <div class="bb-sec"><h2>Available food near you</h2>
      <label class="bb-near"><select id="near">${Object.entries(LOCS).map(([k, v]) => `<option value="${k}" ${k === near ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label></div>
    ${live.length ? live.slice(0, 2).map(x => bbCard(x)).join("") : `<div class="bb-empty">No leftovers right now near this building.</div>`}

    <div class="bb-sec" style="margin-top: 24px;"><h2>All Campus Leftovers</h2><p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">Browse everything posted across all buildings by clubs</p></div>
    ${allCampusLive.length ? allCampusLive.map(x => bbCard({p: x.p, d: 500, left: x.left})).join("") : `<div class="bb-empty">No leftovers available on campus right now.</div>`}`;
}

function bbCard({p, d, left}){
  return `<article class="bb-card"><div class="bb-img"><span class="bb-live">● LIVE</span><span class="bb-count">${left} serving${left === 1 ? "" : "s"}</span></div>
    <div class="bb-cbody">
      <h3>${esc(p.food)}</h3>
      <p><b>Building:</b> ${esc(p.spot)} (${esc(p.location)})</p>
      <p><b>Pickup Deadline:</b> <b class="num" data-until="${p.windowEnd}">${mmss(p.windowEnd - now())}</b> left</p>
      <p style="font-size:0.8rem; color:var(--forest); font-weight:600; margin-top:4px;"><b>Food Type:</b> ${esc(p.eventName || "Club Event Leftovers")} (${esc(p.club)})</p>
      <button class="bb-btn" data-open="${p.id}">Reserve & Claim Food →</button>
    </div></article>`;
}

function bbActiveBar(c){
  const held = c.status === "held";
  return `<button class="bb-active" data-go="${held ? "claim" : "success"}"><span>${held ? "Held for you. Tap to confirm" : "Pick up within 15 mins"}</span><b class="num" data-until="${held ? c.holdUntil : c.pickupBy}">${mmss((held ? c.holdUntil : c.pickupBy) - now())}</b></button>`;
}

function bbDetail(x){
  const {st, avoid, myActive} = x;
  const p = state.posts.find(p => p.id === ui.postId);
  if(!p || p.status !== "live"){ ui.sv = "home"; return bbHome(x); }
  const left = portionsLeft(p);
  const can = !st.suspended && !myActive && left > 0;
  return `<div style="margin-bottom:12px;"><button class="bb-btn ghost" data-go="home" style="width:auto; padding:6px 14px;">← Back</button></div>
    <div class="bb-card">
      <div class="bb-img"><span class="bb-live">● LIVE</span><span class="bb-count">${left} serving${left === 1 ? "" : "s"}</span></div>
      <div class="bb-cbody">
        <h1>${esc(p.food)}</h1>
        <p><b>Location:</b> ${esc(p.spot)} (${esc(p.location)})</p>
        <p><b>Club Pickup Deadline:</b> <b class="num" data-until="${p.windowEnd}">${mmss(p.windowEnd - now())}</b></p>
        <div style="background:var(--sage-tint); padding:12px; border-radius:12px; margin:12px 0;">
          <b style="font-size:0.85rem; color:var(--forest);">Food Description & Club Info:</b>
          <p style="font-size:0.82rem; margin:4px 0 0 0;">Hosted by <b>${esc(p.club)}</b> — <em>${esc(p.eventName)}</em></p>
          <p style="font-size:0.82rem; margin:4px 0 0 0;"><b>Allergens/Dietary:</b> ${p.allergens.length ? p.allergens.join(", ") : "None specified"}</p>
        </div>
        <p style="font-size:0.82rem; font-weight:700; color:var(--text-dark);">Mandatory Reservation:</p>
        <div class="bb-claims">
          ${[1, 2].filter(n => n <= POLICY.maxPortions).map(n => `<button class="bb-btn" data-claim="${p.id}" data-n="${n}" ${can && left >= n ? "" : "disabled"}>Reserve ${n} serving${n === 1 ? "" : "s"}</button>`).join("")}
        </div>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:8px; text-align:center;">You have 15 minutes to arrive after confirming your reservation, or your food becomes available to others.</p>
      </div>
    </div>`;
}

function bbClaim({myActive: c}){
  const p = state.posts.find(p => p.id === c.postId);
  return `<div class="bb-center"><div class="bb-ring"><b class="num" data-until="${c.holdUntil}">${mmss(c.holdUntil - now())}</b><span>to confirm</span></div>
    <h1>Reserved for you</h1><p>${c.portions} × ${esc(p.food)}<br>${esc(p.spot)}</p>
    <button class="bb-btn" data-confirm="${c.id}">I’m on my way (Start 15-Min Timer)</button>
    <button class="bb-btn ghost" data-cancel="${c.id}">Cancel Reservation</button>
    <p style="font-size:0.8rem; color:var(--text-muted); margin-top:12px;">Confirm now to lock in your reservation before someone else takes it.</p></div>`;
}

function bbSuccess({myActive: c}){
  const p = state.posts.find(p => p.id === c.postId);
  return `<div class="bb-center"><div class="bb-check" aria-hidden="true">✓</div><h1>Reservation Confirmed!</h1>
    <p>You’ve reserved ${c.portions} serving(s) of ${esc(p.food)}.</p>
    <div class="bb-pick"><span><b>Pickup within 15 Minutes:</b></span><b class="num" data-until="${c.pickupBy}">${mmss(c.pickupBy - now())}</b><p style="margin-top:6px;"><b>Location:</b> ${esc(p.spot)}</p><p style="font-size:0.8rem; color:var(--text-muted); margin:0;">Show up before this timer hits zero, or your reservation will automatically expire and release back to other students!</p></div>
    <button class="bb-btn" data-go="home">View More Food</button>
    <button class="bb-btn ghost" data-cancel="${c.id}">Cancel Reservation</button></div>`;
}

function bbImpact({st}){
  const n = bbPicked(ME);
  return `<header class="bb-top"><div><h1>Your Impact</h1><p>Preventing campus food waste</p></div></header>
    <section class="bb-hero col"><div><p>Total Waste Prevented</p><b>${Math.round(n * BB_LB_PER_SERVING * 10) / 10} lbs</b><span>Estimated Savings: $${n * COST_PER_SERVING}</span></div></section>`;
}

function bbBoard(){
  return `<header class="bb-top"><div><h1>USF Leaderboard</h1><p>Top rescuing clubs</p></div></header><div class="bb-empty">Leaderboard active once student pickups are completed.</div>`;
}

function bbProfile({st}){
  return `<header class="bb-top"><div><h1>Student Profile</h1><p>${esc(st.name)}</p></div></header>
    <section class="bb-card" style="padding:16px;"><b>USF Student Account</b><p style="font-size:0.85rem; color:var(--text-muted);">Email: ${esc(st.name.toLowerCase().replace(' ',''))}@usf.edu</p></section>`;
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
    const c = state.claims.find(c => c.id === b.dataset.confirm), p = state.posts.find(p => p.id === c.postId);
    c.status = "onway"; c.pickupBy = Math.min(now() + POLICY.pickupMin * 60000, p.windowEnd);
    save(); bbGo("success"); onStateChange();
  });
  all("[data-cancel]").forEach(b => b.onclick = () => { cancelClaim(b.dataset.cancel); bbGo("home"); });
  const near = pane.querySelector("#near");
  if(near) near.onchange = e => { ui.near = e.target.value; store.set("pw_ui", ui); renderStudent(); };
  all("[data-alerts]").forEach(b => b.onclick = () => { toast("Alerts Enabled", "You'll be notified when clubs post food."); });
}

function walk(d){ const m=Math.round(d/10)*10, min=Math.max(1,Math.round(d/80)); return `${m<1000?m+" m":(d/1609).toFixed(1)+" mi"} · ${min} min walk`; }
function claim(postId, n){
  const st=state.students[ME], p=state.posts.find(p=>p.id===postId);
  if(!p || st.suspended || portionsLeft(p)<n) return;
  const t=now(); state.claims.push({id:uid("c"), postId, student:ME, portions:n, createdAt:t, holdUntil:t+POLICY.holdSec*1000, status:"held"});
  save(); onStateChange();
}
function cancelClaim(id){
  const c=state.claims.find(c=>c.id===id); if(!c) return;
  c.status="canceled"; save(); onStateChange(); toast("Reservation Canceled", "Portions returned to the campus pool.");
}