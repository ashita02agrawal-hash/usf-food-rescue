/* club.js
 * Owner: Club-app teammate
 * Club console: events & live rescue, plan an event, report results, manual event planning and report results.
 */
"use strict";
// ---------- club ----------
function renderClub(){
  const club = ui.club, tab = ui.clubTab === "plan" ? "plan" : "events";
  ui.clubTab=tab;
  $("#clubPane").innerHTML = `
    <div class="pane-head">
      <div class="who"><div class="avatar">${esc(club.split(" ").map(w=>w[0]).join("").slice(0,3))}</div><div><div>${esc(club)}</div><div class="small muted">Club console</div></div></div>
      <div class="spacer"></div>
      <select id="clubSwitch" aria-label="Switch club" style="width:auto">${META.clubs.map(c=>`<option ${c.club===club?"selected":""}>${esc(c.club)}</option>`).join("")}</select>
    </div>
    <div class="tabs" role="tablist">
      ${[["events","Events & rescue"],["plan","Plan an event"]].map(([k,l])=>`<button role="tab" data-tab="${k}" aria-selected="${tab===k}">${l}</button>`).join("")}
    </div>
    <div id="clubBody"></div>`;
  $("#clubSwitch").onchange = e=>{ ui.club=e.target.value; seed(ui.club); save(); store.set("pw_ui",ui); renderClub(); };
  $("#clubPane").querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{ ui.clubTab=b.dataset.tab; store.set("pw_ui",ui); renderClub(); });
  if(tab==="plan") renderPlan(); else renderClubDynamic();
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
            <div class="small muted">${ev.rsvps} RSVPs / ${ev.ordered} servings ordered / ${esc(ev.food_item)}</div></div>
          <div class="act"><button class="btn primary sm" data-report="${ev.id}">Report results</button></div>
        </div>`).join("") : `<p class="muted">No upcoming events. Create an event to track attendance and leftovers.</p>`}</div>
    </div>
    ${reported.length||closed.length?`<div class="card"><h3>Recent</h3><div style="margin-top:6px">${reported.map(ev=>`
      <div class="ev">${dateBox(ev.date)}<div style="min-width:0"><div style="font-weight:600">${esc(ev.event_type)} · ${esc(LOCS[ev.location]?.name||ev.location)}</div>
      <div class="small muted num">Checked in ${ev.checked_in} / ${ev.servings_left} servings left of ${ev.servings_ordered}</div></div>
      <div class="act">${ev.postId? rescuedPill(ev.postId):`<span class="pill ok">Results saved</span>`}</div></div>`).join("")}
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
      <div class="row" style="justify-content:space-between"><h3>Plan an event</h3><span class="small muted">Enter your event details</span></div>
      <div class="grid2">
        <label class="f">Event type<select id="pType">${TYPES.map(t=>`<option ${t===typ?"selected":""}>${t}</option>`).join("")}</select></label>
        <label class="f">Date<input type="date" id="pDate" value="${ds}"></label>
        <label class="f">Start time<select id="pHour">${[...Array(13)].map((_,i)=>i+9).map(h=>`<option value="${h}" ${h===(hist.at(-1)?.start_hour||18)?"selected":""}>${fmtHour(h)}</option>`).join("")}</select></label>
        <label class="f">Location<select id="pLoc">${Object.entries(LOCS).map(([k,v])=>`<option value="${k}" ${k===c.home?"selected":""}>${esc(v.name)}</option>`).join("")}</select></label>
        <label class="f">RSVPs so far<input type="number" id="pRsvp" min="1" max="500" value="${rsvp}"></label>
        <label class="f">Food<select id="pFood">${[...new Set([c.food_item,...Object.keys(FOOD_UNITS)])].map(f=>`<option ${f===c.food_item?"selected":""}>${esc(f)}</option>`).join("")}</select></label>
      </div>
      <label class="f">Servings ordered<input type="number" id="pOrdered" min="1" max="5000" value="${rsvp}" required></label>
      <button class="btn primary" type="submit">Save event</button>
    </form>
  </div>`;
  $("#planForm").onsubmit=e=>{ e.preventDefault(); const ev=planEvent(); state.planned.push({...ev,id:uid("e"),status:"planned",ordered:clamp(+$("#pOrdered").value||1,1,5000)}); save(); ui.clubTab="events"; renderClub(); toast("Event saved","Report attendance and leftovers after your event."); };
}
function planEvent(){
  const c=META.clubs.find(x=>x.club===ui.club);
  return {club:ui.club, event_type:$("#pType").value, date:$("#pDate").value||todayStr(), start_hour:+$("#pHour").value, location:$("#pLoc").value, rsvps:clamp(+$("#pRsvp").value||1,1,500), food_item:$("#pFood").value, caterer:c.caterer, allergens:c.allergens.slice()};
}
// ---------- report + rescue sheet ----------
function openReport(id){
  const ev=state.planned.find(e=>e.id===id); if(!ev) return;
  const board=eboard(ev.club), rot=(state.rotation[ev.club]||0)%board.length;
  const startTs = new Date(ev.date+"T"+String(ev.start_hour).padStart(2,"0")+":00:00").getTime();
  const outT = new Date(Math.min(now(), startTs)); const outStr = String(outT.getHours()).padStart(2,"0")+":"+String(outT.getMinutes()).padStart(2,"0");
  const guessIn = "", guessLeft="";
  $("#sheetRoot").innerHTML = `<div class="sheet-bg" id="sheetBg"><form class="sheet" id="repForm">
    <div><div class="eyebrow">${esc(ev.club)} · ${esc(ev.event_type)}</div><h2>How did it go?</h2><p class="small muted">Enter the actual results. Planned: ${ev.rsvps} RSVPs, ${ev.ordered} servings ordered.</p></div>
    <div class="grid2">
      <label class="f">People checked in<input type="number" id="rIn" min="0" required value="${guessIn}"></label>
      <label class="f">Servings left over<input type="number" id="rLeft" min="0" required value="${guessLeft}"></label>
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
  $("#rLeft").oninput=()=>{ $("#rRescue").checked=+$("#rLeft").value>0; syncBtn(); };
  $("#rAll").onclick=e=>{ const b=e.target.closest("[data-a]"); if(b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed")!=="true")); };
  $("#rCancel").onclick=closeSheet; $("#sheetBg").onclick=e=>{ if(e.target.id==="sheetBg") closeSheet(); };
  $("#repForm").onsubmit=e=>{ e.preventDefault(); submitReport(ev); };
}
function closeSheet(){ $("#sheetRoot").innerHTML=""; }
function submitReport(ev){
  const checked=Math.max(0,+$("#rIn").value||0), left=Math.max(0,+$("#rLeft").value||0);
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
  setTimeout(()=>{
    fitFull();
    save(); onStateChange();
    toast("Results saved","Attendance and leftovers recorded.");
    if(ev.postId) toast("Rescue surplus sent", `${left} portions posted. Students nearby were notified.`, "rescue");
  }, 30);
}

