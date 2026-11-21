/* club.js
 * Owner: Club-app teammate
 * Club console: events & live rescue, plan an event, report results, insights & CSV upload.
 */
"use strict";
// ---------- club ----------
function renderClub(){
  const club = ui.club, tab = ui.clubTab || "events";
  $("#clubPane").innerHTML = `
    <div class="pane-head">
      <div class="who"><div class="avatar">${esc(club.split(" ").map(w=>w[0]).join("").slice(0,3))}</div><div><div>${esc(club)}</div><div class="small muted">Club console</div></div></div>
      <div class="spacer"></div>
      <select id="clubSwitch" aria-label="Switch club" style="width:auto">${META.clubs.map(c=>`<option ${c.club===club?"selected":""}>${esc(c.club)}</option>`).join("")}</select>
    </div>
    <div class="tabs" role="tablist">
      ${[["events","Events & rescue"],["plan","Plan an event"],["insights","Insights & history"]].map(([k,l])=>`<button role="tab" data-tab="${k}" aria-selected="${tab===k}">${l}</button>`).join("")}
    </div>
    <div id="clubBody"></div>`;
  $("#clubSwitch").onchange = e=>{ ui.club=e.target.value; seed(ui.club); save(); store.set("pw_ui",ui); renderClub(); };
  $("#clubPane").querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{ ui.clubTab=b.dataset.tab; store.set("pw_ui",ui); renderClub(); });
  if(tab==="plan") renderPlan(); else if(tab==="insights") renderInsights(); else renderClubDynamic();
}
function renderClubDynamic(){
  if((ui.clubTab||"events")!=="events"){ return; }
  const body=$("#clubBody"); if(!body) return;
  const club=ui.club;
  const live = state.posts.filter(p=>p.club===club && p.status==="live");
  const closed = state.posts.filter(p=>p.club===club && p.status==="closed").slice(-3).reverse();
  const planned = state.planned.filter(p=>p.club===club && p.status==="planned");
  const reported = state.planned.filter(p=>p.club===club && p.status==="reported").slice(-4).reverse();
  body.innerHTML = `<div class="stack">
    ${live.map(livePostCard).join("")}
    <div class="card">
      <div class="row" style="justify-content:space-between"><h3>Upcoming and needs results</h3><button class="btn sm" data-tab-go="plan">+ Plan an event</button></div>
      <div style="margin-top:6px">${planned.length? planned.map(ev=>`
        <div class="ev">
          ${dateBox(ev.date)}
          <div style="min-width:0"><div style="font-weight:600">${esc(ev.event_type)} · ${fmtHour(ev.start_hour)} · ${esc(LOCS[ev.location]?.name||ev.location)}</div>
            <div class="small muted">${ev.rsvps} RSVPs · Platewise expects <b class="num" style="color:var(--pred)">${ev.pred}</b> · order ${ev.recServings} servings of ${esc(ev.food_item)}</div></div>
          <div class="act"><button class="btn primary sm" data-report="${ev.id}">Report results</button></div>
        </div>`).join("") : `<p class="muted">No upcoming events. Plan one to get a food recommendation.</p>`}</div>
    </div>
    ${reported.length||closed.length?`<div class="card"><h3>Recent</h3><div style="margin-top:6px">${reported.map(ev=>`
      <div class="ev">${dateBox(ev.date)}<div style="min-width:0"><div style="font-weight:600">${esc(ev.event_type)} · ${esc(LOCS[ev.location]?.name||ev.location)}</div>
      <div class="small muted num">Predicted ${ev.pred} · actual ${ev.checked_in} · ${ev.servings_left} servings left of ${ev.servings_ordered}</div></div>
      <div class="act">${ev.postId? rescuedPill(ev.postId):`<span class="pill ok">Model updated</span>`}</div></div>`).join("")}
      ${closed.filter(p=>!reported.some(r=>r.postId===p.id)).map(p=>`<div class="ev">${dateBox(todayStr())}<div><div style="font-weight:600">${esc(p.food)} rescue</div><div class="small muted">${esc(p.eventName)}</div></div><div class="act">${rescuedPill(p.id)}</div></div>`).join("")}
    </div></div>`:""}
  </div>`;
  body.querySelectorAll("[data-report]").forEach(b=>b.onclick=()=>openReport(b.dataset.report));
  body.querySelectorAll("[data-tab-go]").forEach(b=>b.onclick=()=>{ui.clubTab=b.dataset.tabGo; renderClub();});
  body.querySelectorAll("[data-picked]").forEach(b=>b.onclick=()=>markPicked(b.dataset.picked));
  body.querySelectorAll("[data-endwin]").forEach(b=>b.onclick=()=>{ const p=state.posts.find(p=>p.id===b.dataset.endwin); p.windowEnd=now()-1; process(); save(); onStateChange(); });
}
function rescuedPill(postId){ const p=state.posts.find(p=>p.id===postId); if(!p) return ""; const got=state.claims.filter(c=>c.postId===p.id&&c.status==="picked").reduce((s,c)=>s+c.portions,0); return p.status==="live"?`<span class="pill live"><span class="dot"></span>Rescue live</span>`:`<span class="pill ok">${got} of ${p.total} rescued</span>`; }
function dateBox(d){ const x=new Date(d+"T12:00:00"); return `<div class="datebox"><span>${x.toLocaleDateString([], {month:"short"})}</span><b>${x.getDate()}</b></div>`; }
function livePostCard(p){
  const claims = state.claims.filter(c=>c.postId===p.id && c.status!=="expired");
  const left = portionsLeft(p);
  return `<div class="card stack" style="border-color:var(--rescue)">
    <div class="row" style="justify-content:space-between">
      <div><span class="pill live"><span class="dot"></span>Rescue live</span> <b style="margin-left:6px">${esc(p.food)}</b> <span class="muted">· ${esc(p.spot)}</span></div>
      <div class="small muted">Window closes in <b class="num" data-until="${p.windowEnd}">${mmss(p.windowEnd-now())}</b></div>
    </div>
    <div class="grid2">
      <div><div class="eyebrow">Portions left</div><div class="big num">${left}<small>of ${p.total}</small></div></div>
      <div><div class="eyebrow">On duty</div><div style="font-weight:600;margin-top:6px">${esc(p.onDuty)}</div><div class="small muted">Stays until the window closes, then can leave</div></div>
    </div>
    <div class="tablewrap"><table class="claims"><thead><tr><th>Student</th><th>Portions</th><th>Status</th><th></th></tr></thead><tbody>
      ${claims.length? claims.map(c=>`<tr><td>${esc(state.students[c.student]?.name||"Student")}</td><td class="num">${c.portions}</td><td>${claimStatus(c)}</td>
        <td style="text-align:right">${["held","onway"].includes(c.status)?`<button class="btn primary sm" data-picked="${c.id}">Picked up</button>`:""}</td></tr>`).join("")
        : `<tr><td colspan="4" class="muted">Students nearby were notified. Claims will appear here.</td></tr>`}
    </tbody></table></div>
    <div class="row"><button class="btn sm" data-endwin="${p.id}">Close window now</button><span class="small muted">Food out since ${fmtTime(p.outSince)}. Safe until ${fmtTime(p.outSince+2*3600000)} (2-hour rule).</span></div>
  </div>`;
}
function claimStatus(c){
  if(c.status==="held") return `<span class="pill plan">Holding · <span class="num" data-until="${c.holdUntil}">${mmss(c.holdUntil-now())}</span></span>`;
  if(c.status==="onway") return `<span class="pill plan">On the way · <span class="num" data-until="${c.pickupBy}">${mmss(c.pickupBy-now())}</span></span>`;
  if(c.status==="picked") return `<span class="pill ok">Picked up</span>`;
  if(c.status==="noshow") return `<span class="pill live">No-show</span>`;
  if(c.status==="canceled") return `<span class="pill off">Canceled</span>`;
  return `<span class="pill off">${esc(c.status)}</span>`;
}
function markPicked(id){ const c=state.claims.find(c=>c.id===id); if(!c) return; c.status="picked"; const st=state.students[c.student]; if(st) st.consecutive=0; save(); onStateChange(); if(c.student===ME) toast("Enjoy!","Pickup confirmed by the club."); }

// ---------- plan ----------
function renderPlan(){
  const club=ui.club, c=META.clubs.find(x=>x.club===club);
  const d=new Date(now()); d.setDate(d.getDate()+((2-((d.getDay()+6)%7)+7)%7||7)); // next Wednesday
  const ds=d.toISOString().slice(0,10);
  const hist=trainingRows().filter(r=>r.club===club); const typ=hist.length? hist[hist.length-1].event_type : "General meeting";
  const rsvp = hist.length? Math.round(mean(hist.slice(-5).map(r=>r.rsvps))) : 40;
  $("#clubBody").innerHTML = `<div class="stack">
    <form class="card stack" id="planForm">
      <div class="row" style="justify-content:space-between"><h3>Plan an event</h3><span class="small muted">Recommendation updates as you type</span></div>
      <div class="grid2">
        <label class="f">Event type<select id="pType">${TYPES.map(t=>`<option ${t===typ?"selected":""}>${t}</option>`).join("")}</select></label>
        <label class="f">Date<input type="date" id="pDate" value="${ds}"></label>
        <label class="f">Start time<select id="pHour">${[...Array(13)].map((_,i)=>i+9).map(h=>`<option value="${h}" ${h===(hist.at(-1)?.start_hour||18)?"selected":""}>${fmtHour(h)}</option>`).join("")}</select></label>
        <label class="f">Location<select id="pLoc">${Object.entries(LOCS).map(([k,v])=>`<option value="${k}" ${k===c.home?"selected":""}>${esc(v.name)}</option>`).join("")}</select></label>
        <label class="f">RSVPs so far<input type="number" id="pRsvp" min="1" max="500" value="${rsvp}"></label>
        <label class="f">Food<select id="pFood">${[...new Set([c.food_item,...Object.keys(FOOD_UNITS)])].map(f=>`<option ${f===c.food_item?"selected":""}>${esc(f)}</option>`).join("")}</select></label>
      </div>
    </form>
    <div class="card" id="recBox"></div>
  </div>`;
  const f=$("#planForm"); f.oninput=updateRec; f.onsubmit=e=>e.preventDefault(); updateRec();
}
function planEvent(){
  const c=META.clubs.find(x=>x.club===ui.club);
  return {club:ui.club, event_type:$("#pType").value, date:$("#pDate").value||todayStr(), start_hour:+$("#pHour").value, location:$("#pLoc").value, rsvps:clamp(+$("#pRsvp").value||1,1,500), food_item:$("#pFood").value, caterer:c.caterer, allergens:c.allergens.slice()};
}
function updateRec(){
  if(!M.full){ $("#recBox").innerHTML=`<p class="muted">Training the model on ${META.events.length} sample events…</p>`; return; }
  const ev=planEvent(), p=predictEvent(ev), u=units(p.servings, ev.food_item), ua=units(ev.rsvps, ev.food_item);
  const waste = Math.max(0, ev.rsvps - p.servings);
  const reasons = Object.entries(p.groups).filter(([,v])=>Math.abs(v)>=0.5).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,6);
  const maxAbs = Math.max(4, ...reasons.map(r=>Math.abs(r[1])));
  $("#recBox").innerHTML = `<div class="rec">
    <div class="row" style="justify-content:space-between"><div class="eyebrow">Platewise recommendation</div><span class="tag">Model trained on ${M.n} events</span></div>
    <div class="rec-hero">
      <div><div class="small muted">Expected turnout</div><div class="big num" style="color:var(--pred)">${Math.round(p.people)}<small>people</small></div><div class="small muted num">Likely range ${p.low}–${p.high} of ${ev.rsvps} RSVPs</div></div>
      <div><div class="small muted">Order</div><div class="big num">${u.n}<small>${esc(u.unit)}</small></div><div class="small muted">${p.servings} servings, 15% buffer${u.note?" · "+esc(u.note):""}</div></div>
    </div>
    <div class="compare">Ordering for all ${ev.rsvps} RSVPs (${ua.n} ${esc(ua.unit)}) would likely leave <b class="num">${waste}</b> servings uneaten, about <b class="num">$${waste*COST_PER_SERVING}</b> (est. $${COST_PER_SERVING} a serving).</div>
    <div class="stack" style="gap:8px">
      <div class="row" style="justify-content:space-between"><h3>Why this number</h3><span class="small muted">People added or removed vs. campus baseline (${Math.round(p.base)})</span></div>
      <div class="why">${reasons.map(([g,v])=>{ const w=Math.abs(v)/maxAbs*50; return `<div class="why-row"><span>${esc(reasonLabel(g,p.feats))}</span>
        <div class="why-bar" aria-hidden="true"><i style="${v>=0?`left:50%;width:${w}%;background:var(--accent)`:`right:50%;width:${w}%;background:var(--pred)`}"></i></div>
        <span class="v num">${v>=0?"+":"−"}${Math.abs(v).toFixed(1)}</span></div>`;}).join("")}</div>
      <div class="small muted">Contributions come from the trees' split paths, so they add up exactly to the prediction.</div>
    </div>
    <div class="row"><button class="btn primary" id="saveEv">Save event with this order</button><span class="small muted">You'll report real turnout after, and the model learns from it.</span></div>
  </div>`;
  $("#saveEv").onclick=()=>{ const e={...ev, id:uid("e"), status:"planned", pred:Math.round(p.people), recServings:p.servings, ordered:p.servings}; state.planned.push(e); save(); toast("Event saved",`Order ${u.n} ${u.unit} for ${ev.event_type.toLowerCase()}.`); ui.clubTab="events"; renderClub(); };
}

// ---------- report + rescue sheet ----------
function openReport(id){
  const ev=state.planned.find(e=>e.id===id); if(!ev) return;
  const board=eboard(ev.club), rot=(state.rotation[ev.club]||0)%board.length;
  const startTs = new Date(ev.date+"T"+String(ev.start_hour).padStart(2,"0")+":00:00").getTime();
  const outT = new Date(Math.min(now(), startTs)); const outStr = String(outT.getHours()).padStart(2,"0")+":"+String(outT.getMinutes()).padStart(2,"0");
  const guessIn = Math.max(1, Math.round(ev.pred*0.85)), guessLeft=Math.max(0, ev.ordered-guessIn);
  $("#sheetRoot").innerHTML = `<div class="sheet-bg" id="sheetBg"><form class="sheet" id="repForm">
    <div><div class="eyebrow">${esc(ev.club)} · ${esc(ev.event_type)}</div><h2>How did it go?</h2><p class="small muted">Your numbers retrain the model right away. Planned: ${ev.rsvps} RSVPs, ${ev.ordered} servings ordered, ${ev.pred} expected.</p></div>
    <div class="grid2">
      <label class="f">People checked in<input type="number" id="rIn" min="0" value="${guessIn}"></label>
      <label class="f">Servings left over<input type="number" id="rLeft" min="0" value="${guessLeft}"></label>
    </div>
    <div class="divider"></div>
    <label class="row" style="font-weight:600"><input type="checkbox" id="rRescue" ${guessLeft>0?"checked":""}> Send leftovers out as a Rescue surplus</label>
    <div id="rescueFields" class="stack">
      <div class="grid2">
        <label class="f">Food<input type="text" id="rFood" value="${esc(ev.food_item)}"></label>
        <label class="f">From (restaurant / caterer)<input type="text" id="rCaterer" value="${esc(ev.caterer)}"></label>
        <label class="f">Food out since<input type="time" id="rOut" value="${outStr}"></label>
        <label class="f">Distribution window<select id="rWin"><option value="15">15 min</option><option value="20" selected>20 min</option><option value="30">30 min</option></select></label>
      </div>
      <label class="f">Pickup spot<input type="text" id="rSpot" value="${esc(PICKUP_SPOTS[ev.location]||"")}"></label>
      <div class="f" style="display:grid;gap:6px"><span class="small muted" style="font-weight:600">Allergens</span><div class="chips" id="rAll">${ALLERGENS.map(a=>`<button type="button" class="chip" aria-pressed="${ev.allergens.includes(a)}" data-a="${a}">${a}</button>`).join("")}</div></div>
      <label class="f">E-board member on duty<select id="rDuty">${board.map((n,i)=>`<option ${i===rot?"selected":""}>${n}</option>`).join("")}</select></label>
      <div class="small muted">Rotation: ${board.map((n,i)=>i===rot?`<b>${n}</b>`:n).join(" → ")}. One person stays for the window, everyone else can leave.</div>
    </div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" id="rCancel">Cancel</button><button class="btn rescue" id="rSubmit">Save results & rescue surplus</button></div>
  </form></div>`;
  const syncBtn=()=>{ const on=$("#rRescue").checked; $("#rescueFields").hidden=!on; $("#rSubmit").textContent = on?"Save results & rescue surplus":"Save results"; $("#rSubmit").className="btn "+(on?"rescue":"primary"); };
  $("#rRescue").onchange=syncBtn; syncBtn();
  $("#rIn").oninput=()=>{ const l=Math.max(0, ev.ordered-(+$("#rIn").value||0)); $("#rLeft").value=l; $("#rRescue").checked=l>0; syncBtn(); };
  $("#rAll").onclick=e=>{ const b=e.target.closest("[data-a]"); if(b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed")!=="true")); };
  $("#rCancel").onclick=closeSheet; $("#sheetBg").onclick=e=>{ if(e.target.id==="sheetBg") closeSheet(); };
  $("#repForm").onsubmit=e=>{ e.preventDefault(); submitReport(ev); };
}
function closeSheet(){ $("#sheetRoot").innerHTML=""; }
function submitReport(ev){
  const checked=Math.max(0,+$("#rIn").value||0), left=Math.max(0,+$("#rLeft").value||0);
  // what would the model say for the same event next week, before learning?
  const nextWeek = d => { const x=new Date(d+"T12:00:00"); x.setDate(x.getDate()+7); return x.toISOString().slice(0,10); };
  const probe = {...ev, date:nextWeek(ev.date)};
  const before = predictEvent(probe).people;
  const row = {event_id:ev.id, club:ev.club, event_type:ev.event_type, date:ev.date, day_of_week:dow(ev.date), start_hour:ev.start_hour, location:ev.location, rsvps:ev.rsvps, checked_in:checked,
    food_item:ev.food_item, servings_ordered:ev.ordered, servings_left:left, leftover_pct: ev.ordered? Math.round(1000*left/ev.ordered)/10 : 0, semester:semesterName(ev.date), week:semesterWeek(ev.date), is_sample:0, pred:ev.pred};
  state.learned.push(row);
  Object.assign(ev, {status:"reported", checked_in:checked, servings_left:left, servings_ordered:ev.ordered});
  if($("#rRescue").checked && left>0){
    const [hh,mm]=$("#rOut").value.split(":").map(Number); const out=new Date(now()); out.setHours(hh||0,mm||0,0,0);
    const win=+$("#rWin").value, t0=now();
    const allergens=[...document.querySelectorAll("#rAll [aria-pressed=true]")].map(b=>b.dataset.a);
    const post={id:uid("p"), club:ev.club, eventName:ev.event_type, food:$("#rFood").value||ev.food_item, caterer:$("#rCaterer").value, allergens, location:ev.location, spot:$("#rSpot").value, total:left,
      outSince:Math.min(out.getTime(), t0), windowEnd:Math.min(t0+win*60000, out.getTime()+2*3600000), createdAt:t0, onDuty:$("#rDuty").value, status:"live"};
    state.posts.push(post); ev.postId=post.id;
    state.rotation[ev.club]=(state.rotation[ev.club]||0)+1;
  }
  closeSheet();
  setModelStatus("Retraining…");
  setTimeout(()=>{
    fitFull(); const after=predictEvent(probe).people;
    save(); setModelStatus(); onStateChange();
    toast("Model retrained", `Learned from ${M.n} events. Next ${ev.event_type.toLowerCase()} like this: ${Math.round(after)} people (was ${Math.round(before)}).`);
    if(ev.postId) toast("Rescue surplus sent", `${left} portions posted. Students nearby were notified.`, "rescue");
  }, 30);
}

// ---------- insights ----------
function renderInsights(){
  const club = ui.insClub || ui.club;
  const bt=M.backtest;
  const clubs = META.clubs.map(c=>c.club);
  $("#clubBody").innerHTML = `<div class="stack">
    <div class="tiles">
      <div class="tile"><div class="eyebrow">Waste cut</div><div class="big num" style="color:var(--accent)">${bt?Math.round(bt.cut*100)+"%":"…"}</div><div class="small muted">vs. ordering for every RSVP, on ${bt?bt.n:"…"} held-out sample events</div></div>
      <div class="tile"><div class="eyebrow">Servings saved</div><div class="big num">${bt?Math.round(bt.servingsSaved):"…"}</div><div class="small muted">about $${bt?Math.round(bt.servingsSaved*COST_PER_SERVING).toLocaleString():"…"} in those ${bt?bt.n:""} events</div></div>
      <div class="tile"><div class="eyebrow">Typical error</div><div class="big num">±${M.mae?M.mae.toFixed(1):"…"}</div><div class="small muted">people per event (5-fold cross-validation)</div></div>
      <div class="tile"><div class="eyebrow">Events learned</div><div class="big num">${M.n||"…"}</div><div class="small muted">${state.learned.length} reported or uploaded in the app</div></div>
    </div>
    <div class="card stack">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><h3>Predicted vs. actual turnout</h3><div class="small muted">Predictions are out-of-sample: the model never saw that event when predicting it.</div></div>
        <select id="insClub" aria-label="Club" style="width:auto">${clubs.map(c=>`<option ${c===club?"selected":""}>${esc(c)}</option>`).join("")}</select>
      </div>
      <div class="legend"><span><i style="border-color:var(--muted);border-top-style:dashed"></i>RSVPs (what clubs order for)</span><span><i style="border-color:var(--accent)"></i>Actually checked in</span><span><i style="border-color:var(--pred)"></i>Platewise prediction</span></div>
      <div class="chart" id="chart"></div>
      <div class="small muted" id="chartNote"></div>
    </div>
    <div class="card stack">
      <h3>What drives turnout</h3>
      <div class="small muted">Average effect on predicted turnout, in people, across all events.</div>
      <div class="stack" style="gap:6px">${(M.importance||[]).slice(0,8).map(([g,v],i,a)=>`<div class="imp-row"><span>${esc(GROUP_NAMES[g]||g)}</span><span style="background:var(--sunk);border-radius:0 4px 4px 0"><i style="width:${(v/a[0][1]*100).toFixed(0)}%"></i></span><span class="num small" style="text-align:right">${v.toFixed(1)}</span></div>`).join("")}</div>
    </div>
    <div class="card stack">
      <div class="row" style="justify-content:space-between"><h3>Upload past events</h3><button class="btn sm" id="exBtn">Fill in an example</button></div>
      <div class="small muted">Paste your club's RSVP and check-in records as CSV. Food columns are optional. Columns: <code>date,event_type,location,start_hour,rsvps,checked_in,servings_ordered,servings_left</code>. Locations: ${Object.keys(LOCS).join(", ")}.</div>
      <textarea id="csv" aria-label="CSV of past events" placeholder="2026-09-03,General meeting,ENB,18,64,22,70,40"></textarea>
      <div class="row"><button class="btn primary" id="upBtn">Teach the model these events</button><span class="small muted" id="upMsg"></span></div>
    </div>
  </div>`;
  $("#insClub").onchange=e=>{ ui.insClub=e.target.value; renderInsights(); };
  drawChart(club);
  $("#exBtn").onclick=()=>{ $("#csv").value = "date,event_type,location,start_hour,rsvps,checked_in,servings_ordered,servings_left\n2026-11-02,General meeting,ENB,18,66,19,70,47\n2026-11-09,Workshop,ENB,18,58,31,60,25\n2026-11-16,Social,MSC,17,62,40,65,22"; };
  $("#upBtn").onclick=()=>uploadCsv(club);
}
function uploadCsv(club){
  const lines=$("#csv").value.trim().split(/\r?\n/).filter(Boolean); let added=0, bad=0;
  for(const ln of lines){ const p=ln.split(",").map(s=>s.trim()); if(/^date$/i.test(p[0])) continue;
    const [date,type,loc,hour,rsvps,inn,ord,left]=p;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!TYPES.includes(type)||!LOCS[loc]||!(+rsvps>0)||!(+inn>=0)){ bad++; continue; }
    const o=+ord||+rsvps, l=left!==undefined&&left!==""? +left : Math.max(0,o-(+inn));
    state.learned.push({event_id:uid("u"), club, event_type:type, date, day_of_week:dow(date), start_hour:+hour||18, location:loc, rsvps:+rsvps, checked_in:+inn, servings_ordered:o, servings_left:l, leftover_pct:Math.round(1000*l/o)/10, semester:semesterName(date), week:semesterWeek(date), is_sample:0});
    added++; }
  if(!added){ $("#upMsg").textContent = bad? `None of the ${bad} rows matched the columns above.` : "Paste some rows first."; return; }
  $("#upMsg").textContent="Retraining…";
  setTimeout(()=>{ fitFull(); save(); setModelStatus(); renderInsights(); toast("History uploaded", `Learned ${added} events for ${club}${bad?`, skipped ${bad} rows that didn't match`:""}.`); },30);
}
function drawChart(club){
  const rows = sortEvents(trainingRows().filter(r=>r.club===club));
  const box=$("#chart"); if(!rows.length){ box.innerHTML='<p class="muted">No history yet.</p>'; return; }
  const W=720,H=260,pl=34,pr=12,pt=10,pb=28;
  const pts = rows.map(r=>({r, rs:r.rsvps, a:r.checked_in, p: r.pred ?? M.oof[r.event_id]}));
  const ymax = Math.ceil(Math.max(...pts.map(d=>Math.max(d.rs,d.a,d.p||0)))/10)*10;
  const x=i=> pl + (pts.length===1? (W-pl-pr)/2 : i*(W-pl-pr)/(pts.length-1)), y=v=> pt + (H-pt-pb)*(1-v/ymax);
  const line=(key,col,dash)=>`<path d="${pts.map((d,i)=>d[key]==null?"":`${i&&pts[i-1][key]!=null?"L":"M"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join("")}" fill="none" stroke="${col}" stroke-width="2" ${dash?'stroke-dasharray="5 4"':""} stroke-linejoin="round" stroke-linecap="round"/>`;
  const ticks=[0,ymax/2,ymax].map(v=>`<line class="gl" x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join("");
  const sems=[]; pts.forEach((d,i)=>{ if(!i||d.r.semester!==pts[i-1].r.semester) sems.push([i,d.r.semester]); });
  const semMarks=sems.map(([i,s])=>`<line class="gl" x1="${x(i)}" x2="${x(i)}" y1="${pt}" y2="${H-pb}" stroke-dasharray="2 3"/><text x="${x(i)+4}" y="${H-pb+16}">${esc(s)}</text>`).join("");
  const last=pts.length-1;
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Turnout for ${esc(club)}: RSVPs, actual check-ins and model predictions">
    ${ticks}${semMarks}${line("rs","var(--muted)",true)}${line("a","var(--accent)")}${line("p","var(--pred)")}
    ${pts.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d.a)}" r="3" fill="var(--accent)" stroke="var(--surface)" stroke-width="1.5"/>`).join("")}
    <circle cx="${x(last)}" cy="${y(pts[last].a)}" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
    <line id="xh" class="gl" y1="${pt}" y2="${H-pb}" visibility="hidden" stroke="var(--muted)"/>
    <rect x="${pl}" y="${pt}" width="${W-pl-pr}" height="${H-pt-pb}" fill="transparent" id="hit"/>
  </svg><div class="tip" id="tip" hidden></div>`;
  const svg=box.querySelector("svg"), tip=$("#tip"), xh=$("#xh");
  const move = ev => { const b=svg.getBoundingClientRect(); const sx=(ev.clientX-b.left)/b.width*W; const i=clamp(Math.round((sx-pl)/((W-pl-pr)/Math.max(1,pts.length-1))),0,last); const d=pts[i];
    xh.setAttribute("x1",x(i)); xh.setAttribute("x2",x(i)); xh.setAttribute("visibility","visible");
    tip.hidden=false; tip.style.left=(x(i)/W*b.width)+"px"; tip.style.top=(y(Math.max(d.rs,d.a))/H*b.height)+"px";
    tip.innerHTML=`<b>${esc(d.r.event_type)}</b> · ${new Date(d.r.date+"T12:00:00").toLocaleDateString([], {month:"short",day:"numeric"})} · ${esc(d.r.location)}<br>RSVPs ${d.rs} · checked in ${d.a}${d.p!=null?` · predicted ${Math.round(d.p)}`:""}<br>${d.r.servings_left!=null?`${d.r.servings_left} of ${d.r.servings_ordered} servings left over`:""}`; };
  svg.addEventListener("pointermove", move); svg.addEventListener("pointerleave", ()=>{ tip.hidden=true; xh.setAttribute("visibility","hidden"); });
  const withP=pts.filter(d=>d.p!=null), err=mean(withP.map(d=>Math.abs(d.p-d.a))), left=mean(rows.map(r=>r.leftover_pct||0));
  $("#chartNote").textContent = `${rows.length} events. Average leftovers today: ${Math.round(left)}% of food ordered. Prediction error for ${club}: ±${err.toFixed(1)} people.`;
}

