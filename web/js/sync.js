/* sync.js
 * Owner: Ashita (shared)
 * Two-phone live sync: the club phone and the student phone share live posts,
 * claims and strikes through a free public relay (ntfy.sh), keyed by a sync code.
 * Only demo data is sent (live posts, claims, mock student names). Anyone who
 * knows the code can read it, so never put real personal info in here.
 * Same-device tabs already sync through BroadcastChannel in core.js.
 */
"use strict";
const RELAY = store.get("pw_relay") || "https://ntfy.sh";  // swap for your own ntfy server if you have one
const TOPIC_PREFIX = "platewise-usf-";
const Relay = { code: null, es: null, status: "off", joining: false, gotRemote: false, timer: null };

function relayTopic(){ return TOPIC_PREFIX + Relay.code; }
function relaySetStatus(s){ Relay.status = s; relayRender(); }

function relayConnect(code){
  relayDisconnect();
  code = String(code || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  if (code.length < 4) { toast("Sync code too short", "Use at least 4 letters or numbers."); return; }
  Relay.code = code; store.set("pw_sync", code);
  relaySetStatus("connecting");
  try {
    // since=10m replays the latest state so a phone that joins late catches up
    const es = new EventSource(`${RELAY}/${relayTopic()}/sse?since=10m`);
    Relay.es = es;
    Relay.joining = true; Relay.gotRemote = false;
    es.onopen = () => {
      relaySetStatus("live");
      // Give the relay a moment to replay the latest state; if nobody is there yet, share ours.
      setTimeout(() => { Relay.joining = false; if (!Relay.gotRemote) relayPublish(true); }, 2000);
    };
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.event && msg.event !== "message") return;
        Relay.gotRemote = true;
        applySlim(JSON.parse(msg.message), Relay.joining);  // a phone that is joining adopts the room's state
      } catch (e) { /* ignore anything that isn't our state */ }
    };
    es.onerror = () => relaySetStatus(es.readyState === 2 ? "error" : "connecting");
  } catch (e) { relaySetStatus("error"); }
}
function relayDisconnect(){
  if (Relay.es) { try { Relay.es.close(); } catch (e) {} }
  Relay.es = null; Relay.code = null; store.set("pw_sync", null); relaySetStatus("off");
}
// Called from save() in core.js. Coalesces bursts into one send.
function relayPublish(now){
  if (!Relay.code || Relay.joining || !state || !state.updatedAt) return;
  clearTimeout(Relay.timer);
  Relay.timer = setTimeout(() => {
    let d = slim();
    if (JSON.stringify(d).length > 3800) d.posts = d.posts.filter((p) => p.status === "live");
    fetch(`${RELAY}/${relayTopic()}`, { method: "POST", body: JSON.stringify(d) })
      .catch(() => relaySetStatus("error"));
  }, now ? 0 : 150);
}

function relayJoinLink(){
  const u = new URL(location.href); u.hash = ""; u.search = "?sync=" + Relay.code; return u.toString();
}
function relayRender(){
  const box = document.getElementById("syncBox"); if (!box) return;
  const label = { off: "Not connected", connecting: "Connecting…", live: "Live", error: "Can't reach sync server" }[Relay.status];
  const cls = { off: "off", connecting: "plan", live: "ok", error: "live" }[Relay.status];
  box.innerHTML = Relay.code
    ? `<div class="row"><span class="pill ${cls}"><span class="dot"></span>Two-phone sync: ${esc(label)}</span>
         <span>Code <b class="num">${esc(Relay.code)}</b></span>
         <button class="btn sm" id="syncCopy">Copy join link</button>
         <button class="btn sm ghost" id="syncOff">Disconnect</button></div>`
    : `<div class="row"><span class="small muted">Two phones?</span>
         <button class="btn sm" id="syncNew">Create sync code</button>
         <input id="syncCode" type="text" placeholder="or enter a code" style="width:150px" aria-label="Sync code">
         <button class="btn sm" id="syncJoin">Join</button></div>`;
  const $id = (id) => document.getElementById(id);
  if ($id("syncNew")) $id("syncNew").onclick = () => relayConnect(Math.random().toString(36).slice(2, 8));
  if ($id("syncJoin")) $id("syncJoin").onclick = () => relayConnect($id("syncCode").value);
  if ($id("syncOff")) $id("syncOff").onclick = relayDisconnect;
  if ($id("syncCopy")) $id("syncCopy").onclick = () => {
    const link = relayJoinLink();
    navigator.clipboard.writeText(link).then(() => toast("Join link copied", "Open it on the other phone."), () => toast("Join link", link));
  };
}
function relayBoot(){
  const fromUrl = new URLSearchParams(location.search).get("sync");
  const saved = store.get("pw_sync");
  relayRender();
  if (fromUrl || saved) relayConnect(fromUrl || saved);
}
