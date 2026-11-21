/* app.js
 * Owner: Ashita (shared)
 * Login screen, demo tools, timers, and boot. Loaded last.
 */
"use strict";
// ---------- login ----------
function renderLogin(){
  $("#login").innerHTML = `
    <div class="stack">
      <div class="eyebrow">HackJam'26 · USF Tampa</div>
      <div class="hero-line">Share <em>surplus food</em>.<br>Pick it up in minutes.</div>
      <p class="muted" style="max-width:62ch">Clubs post leftover food from campus events. Students nearby can reserve portions and pick them up before the window closes.</p>
    </div>
    <div class="login-grid">
      <form class="card stack" id="clubLogin">
        <h2>Club / org login</h2>
        <label class="f">Organization<select id="loginClub">${META.clubs.map(c=>`<option ${c.club==="ACM"?"selected":""}>${esc(c.club)}</option>`).join("")}</select></label>
        <label class="f">E-board email<input type="text" id="loginClubEmail" value="eboard@usf.edu"></label>
        <button class="btn primary">Log in as club</button>
      </form>
      <form class="card stack" id="studentLogin">
        <h2>Student login</h2>
        <label class="f">Name<input type="text" id="loginName" value="Jordan Lee"></label>
        <label class="f">USF email<input type="text" id="loginEmail" value="jlee@usf.edu"></label>
        <button class="btn primary">Log in as student</button>
      </form>
    </div>
    <div class="row"><button class="btn rescue" data-action="demo">Start demo: both views side by side</button><span class="muted small">Mock sign-in. Data shown is sample data.</span></div>`;
  $("#clubLogin").onsubmit = e=>{ e.preventDefault(); ui.club=$("#loginClub").value; ui.view="club"; seed(ui.club); save(); store.set("pw_ui",ui); render(); };
  $("#studentLogin").onsubmit = e=>{ e.preventDefault(); ui.student=ME; state.students[ME].name=$("#loginName").value||"Jordan Lee"; ui.view="student"; seed("ACM"); save(); store.set("pw_ui",ui); render(); };
}


// ---------- demo tools ----------
function botClaim(){
  const live=state.posts.filter(p=>p.status==="live" && portionsLeft(p)>0); if(!live.length){ toast("Nothing to claim","No live posts with portions left."); return; }
  const p=live[live.length-1]; const sid=["s_taylor","s_sam"].find(s=>!state.claims.some(c=>c.student===s&&c.postId===p.id)) || "s_taylor";
  const t=now(); state.claims.push({id:uid("c"), postId:p.id, student:sid, portions:Math.min(2,portionsLeft(p)), createdAt:t, holdUntil:t, pickupBy:Math.min(t+POLICY.pickupMin*60000,p.windowEnd), status:"onway"});
  save(); onStateChange();
}

document.addEventListener("click", e=>{
  const a=e.target.closest("[data-action]"); if(a){ const k=a.dataset.action;
    if(k==="demo"){ ui.club="ACM"; ui.student=ME; ui.view=innerWidth<1060?"club":"both"; ui.clubTab="plan"; seed("ACM"); save(); store.set("pw_ui",ui); render(); }
    if(k==="ff"){ state.offsetMs+=5*60000; save(); process(); onStateChange(); toast("Skipped ahead 5 minutes"); }
    if(k==="bot") botClaim();
    if(k==="reset"){ state=freshState(); ui={view:ui.view, club:ui.club, student:ui.student, clubTab:"plan"}; if(ui.club) seed(ui.club); else seed("ACM"); fitFull(); save(); store.set("pw_ui",ui); render(); toast("Demo reset"); }
    if(k==="logout"){ ui={}; store.set("pw_ui",ui); render(); }
  }
  const v=e.target.closest("#viewSeg [data-view]"); if(v) setView(v.dataset.view);
});
// countdown ticker (updates text only, no re-render)
setInterval(()=>{ document.querySelectorAll("[data-until]").forEach(el=>{ el.textContent = mmss(+el.dataset.until - now()); }); process(); }, 1000);

// ---------- boot ----------
async function boot(){
  let meta; try{ meta = await (await fetch("data/sample_events.json")).json(); }catch(e){ document.body.insertAdjacentHTML("beforeend",'<p style="padding:16px">Could not load sample_events.json.</p>'); return; }
  META=meta; LOCS=meta.locations; CLUBS=meta.clubs.map(c=>c.club); buildCols();
  state = store.get("pw_state") || freshState(); if(!state.learned) state=freshState();
  ui = store.get("pw_ui") || {};
  // Remove data left by the retired student prediction feature.
  try{ localStorage.removeItem("pw_claim_confidence"); }catch(e){}
  delete ui.foodForecastFood; delete ui.foodForecastLocation;
  store.set("pw_ui",ui);
  if(!ui.club && !ui.student && innerWidth>=1060){ /* landing */ }
  // Retain the club model engine; prediction UI has been removed.
  fitFull(); render();
  if(typeof relayBoot==="function") relayBoot();
  if("serviceWorker" in navigator && location.protocol!=="file:") navigator.serviceWorker.register("sw.js").catch(()=>{});
  try{ bc=new BroadcastChannel("platewise"); bc.onmessage=e=>applyRemote(e.data); }catch(e){}
  addEventListener("storage", e=>{ if(e.key==="pw_state") applyRemote(store.get("pw_state")); });
  try{ if(window.claude && window.claude.use){ const r = await window.claude.use("room"); if(r){ room=r; room.on("sync", m=>{ if(!m.sameTab) applySlim(m.data); }); room.on("hello", m=>{ if(!m.sameTab) roomSync(); }); room.emit("hello", {}).catch(()=>{}); } } }catch(e){}
}
boot();
