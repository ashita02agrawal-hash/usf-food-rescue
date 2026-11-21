/* student.js
 * Owner: Student-app teammate
 * Student app: live feed, claim hold, pickup timer, no-show policy, alerts.
 */
"use strict";
// ---------- student ----------
function renderStudent(){
  const st=state.students[ME]; const near=ui.near||"LIB";
  const myActive = state.claims.find(c=>c.student===ME && ["held","onway"].includes(c.status));
  const live = state.posts.filter(p=>p.status==="live").map(p=>({p, d:haversine(LOCS[near],LOCS[p.location]), left:portionsLeft(p)})).sort((a,b)=>a.d-b.d);
  const recent = state.posts.filter(p=>p.status==="closed").slice(-2).reverse();
  const avoid = ui.avoid||[];
  // notifications for posts not seen before
  const seen = new Set(ui.seen||[]);
  const fresh = live.filter(x=>!seen.has(x.p.id));
  if(fresh.length && ui.seenInit){ fresh.forEach(x=>notify(x.p, avoid)); }
  ui.seen=[...new Set([...(ui.seen||[]), ...live.map(x=>x.p.id)])]; ui.seenInit=true; store.set("pw_ui",ui);
  const newIds = new Set(live.filter(x=>now()-x.p.createdAt<2*60000).map(x=>x.p.id));
  $("#studentPane").innerHTML = `<div class="phone">
    <div class="phone-bar"><div class="avatar">${esc(st.name.split(" ").map(w=>w[0]).join(""))}</div>
      <div style="flex:1;min-width:0"><div style="font-weight:600">Hi, ${esc(st.name.split(" ")[0])}</div>
        <div class="small muted row" style="gap:4px">Near <select id="near" aria-label="Where you are" style="width:auto;padding:2px 6px;font-size:12px">${Object.entries(LOCS).map(([k,v])=>`<option value="${k}" ${k===near?"selected":""}>${esc(v.name)}</option>`).join("")}</select></div></div>
      <button class="btn sm" id="alertsBtn">${ui.alerts?"Alerts on":"Turn on alerts"}</button>
    </div>
    <div class="phone-body">
      ${st.suspended?`<div class="banner bad"><b>Claiming is paused for the rest of the semester.</b> You missed ${st.strikes.length} pickups. You can still see posts, and claiming comes back next semester.</div>`:""}
      ${myActive? myClaimBox(myActive):""}
      <div class="row" style="justify-content:space-between"><h3>Free food near you</h3><span class="small muted">${live.length} live</span></div>
      ${live.length? live.map(x=>postCard(x, myActive, st, avoid, newIds.has(x.p.id))).join("") : `<div class="banner info">No leftovers right now. You'll get an alert as soon as a club posts some.</div>`}
      ${recent.map(p=>`<div class="post closed"><div class="post-top"><div><h3>${esc(p.food)}</h3><div class="small muted">${esc(p.club)}</div></div><span class="pill ok">${p.total-portionsLeftClosed(p)} of ${p.total} rescued</span></div></div>`).join("")}
      <div class="divider"></div>
      <div class="stack" style="gap:8px">
        <div class="row" style="justify-content:space-between"><b>Your pickups</b>
          <span class="row small muted" style="gap:6px">No-shows <span class="strikes">${[...Array(POLICY.totalLimit)].map((_,i)=>`<i class="${i<st.strikes.length?"on":""}"></i>`).join("")}</span></span></div>
        <div class="small muted">Cancel within ${POLICY.freeCancelSec} seconds of claiming for free. Missing a pickup is a strike. ${POLICY.consecutiveLimit} in a row or ${POLICY.totalLimit} in a semester pauses claiming until next semester. A pickup resets the in-a-row count.</div>
        <div class="row small" style="gap:6px"><span class="muted">Hide alerts for:</span><div class="chips" id="avoid">${ALLERGENS.map(a=>`<button class="chip" data-av="${a}" aria-pressed="${avoid.includes(a)}">${a}</button>`).join("")}</div></div>
      </div>
    </div></div>`;
  $("#near").onchange=e=>{ ui.near=e.target.value; store.set("pw_ui",ui); renderStudent(); };
  $("#alertsBtn").onclick=async()=>{ ui.alerts=true; store.set("pw_ui",ui); try{ if("Notification" in window && Notification.permission==="default") await Notification.requestPermission(); }catch(e){} renderStudent(); toast("Alerts on","You'll get a ping when food is posted nearby."); };
  $("#avoid").onclick=e=>{ const b=e.target.closest("[data-av]"); if(!b) return; const a=b.dataset.av; ui.avoid = avoid.includes(a)? avoid.filter(x=>x!==a) : [...avoid,a]; store.set("pw_ui",ui); renderStudent(); };
  $("#studentPane").querySelectorAll("[data-claim]").forEach(b=>b.onclick=()=>claim(b.dataset.claim, +b.dataset.n));
  $("#studentPane").querySelectorAll("[data-confirm]").forEach(b=>b.onclick=()=>{ const c=state.claims.find(c=>c.id===b.dataset.confirm); const p=state.posts.find(p=>p.id===c.postId); c.status="onway"; c.pickupBy=Math.min(now()+POLICY.pickupMin*60000, p.windowEnd); save(); onStateChange(); });
  $("#studentPane").querySelectorAll("[data-cancel]").forEach(b=>b.onclick=()=>cancelClaim(b.dataset.cancel));
}
function portionsLeftClosed(p){ return p.total - state.claims.filter(c=>c.postId===p.id && c.status==="picked").reduce((s,c)=>s+c.portions,0); }
function walk(d){ const m=Math.round(d/10)*10, min=Math.max(1,Math.round(d/80)); return `${m<1000?m+" m":(d/1609).toFixed(1)+" mi"} · ${min} min walk`; }
function postCard({p,d,left}, myActive, st, avoid, isNew){
  const flagged = p.allergens.filter(a=>avoid.includes(a));
  const can = !st.suspended && !myActive && left>0 && p.windowEnd-now()>3*60000;
  return `<article class="post ${isNew?"new":""}">
    <div class="post-top"><div style="min-width:0"><div class="row" style="gap:6px">${isNew?'<span class="pill live"><span class="dot"></span>New</span>':""}<span class="small muted">${esc(p.club)} · ${esc(p.eventName)}</span></div><h3 style="margin-top:4px">${esc(p.food)}</h3></div>
      <div class="left"><b class="num">${left}</b><span class="small muted">of ${p.total} left</span></div></div>
    <div class="meter" aria-hidden="true"><i style="width:${(left/p.total*100).toFixed(0)}%"></i></div>
    <dl class="facts" style="margin:0">
      <div><dt>Pickup</dt><dd>${esc(p.spot)}<br><span class="muted">${walk(d)}</span></dd></div>
      <div><dt>Food out since</dt><dd>${fmtTime(p.outSince)} <span class="muted">· safe until ${fmtTime(p.outSince+2*3600000)}</span></dd></div>
      <div><dt>From</dt><dd>${esc(p.caterer||"Not listed")}</dd></div>
      <div><dt>Allergens</dt><dd class="chips">${p.allergens.length?p.allergens.map(a=>`<span class="chip ${flagged.includes(a)?"warn":""}">${esc(a)}</span>`).join(""):'<span class="muted">None listed</span>'}</dd></div>
      <div><dt>Closes in</dt><dd><b class="num" data-until="${p.windowEnd}">${mmss(p.windowEnd-now())}</b> <span class="muted">· ${esc(p.onDuty)} is handing out</span></dd></div>
    </dl>
    <div class="row">${[1,2].filter(n=>n<=POLICY.maxPortions).map(n=>`<button class="btn ${n===1?"primary":""}" data-claim="${p.id}" data-n="${n}" ${can&&left>=n?"":"disabled"}>Claim ${n}</button>`).join("")}
      <span class="small muted">${st.suspended?"Claiming paused":myActive?"Finish your current pickup first":left<=0?"All claimed":p.windowEnd-now()<=3*60000?"Closing soon":`Held for ${POLICY.holdSec}s, then ${POLICY.pickupMin} min to pick up`}</span></div>
  </article>`;
}
function myClaimBox(c){
  const p=state.posts.find(p=>p.id===c.postId); if(!p) return "";
  if(c.status==="held") return `<div class="claimbox hold"><div class="eyebrow">Held for you</div><div class="row" style="justify-content:space-between"><div><b>${c.portions} × ${esc(p.food)}</b><div class="small muted">${esc(p.spot)}</div></div><div class="big num" data-until="${c.holdUntil}">${mmss(c.holdUntil-now())}</div></div>
    <div class="row"><button class="btn primary" data-confirm="${c.id}">I'm on my way</button><button class="btn" data-cancel="${c.id}">Cancel</button></div><div class="small muted">Confirm to start your ${POLICY.pickupMin}-minute pickup window. If you don't, the hold just ends. No strike.</div></div>`;
  const free = now()-c.createdAt < POLICY.freeCancelSec*1000;
  return `<div class="claimbox"><div class="eyebrow">Pick up within</div><div class="row" style="justify-content:space-between"><div><b>${c.portions} × ${esc(p.food)}</b><div class="small muted">${esc(p.spot)} · ask for ${esc(p.onDuty)}</div></div><div class="big num" data-until="${c.pickupBy}">${mmss(c.pickupBy-now())}</div></div>
    <div class="row"><button class="btn" data-cancel="${c.id}">${free?"Cancel (free)":"Cancel (counts as a strike)"}</button></div><div class="small muted">The club taps "Picked up" when you get there.</div></div>`;
}
function claim(postId, n){
  const st=state.students[ME], p=state.posts.find(p=>p.id===postId);
  if(!p || st.suspended || portionsLeft(p)<n) return;
  const t=now(); state.claims.push({id:uid("c"), postId, student:ME, portions:n, createdAt:t, holdUntil:t+POLICY.holdSec*1000, status:"held"});
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
  const d = haversine(LOCS[ui.near||"LIB"], LOCS[p.location]);
  toast(`Rescue surplus: ${p.food}`, `${p.total} portions at ${LOCS[p.location].name} · ${walk(d)}`, "rescue");
  try{ if(ui.alerts && "Notification" in window && Notification.permission==="granted"){
    const title="Platewise: free "+p.food, opts={body:`${p.total} portions · ${p.spot}`, icon:"icons/icon-192.png", tag:p.id};
    // Phones only allow notifications through the service worker
    if(navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r=>r.showNotification(title,opts)).catch(()=>{});
    else new Notification(title, opts); } }catch(e){}
  try{ navigator.vibrate && navigator.vibrate(120); }catch(e){}
}

