const APP_ID = "7bd059c9b0e043c2b0f335954214327a";

const params = new URLSearchParams(window.location.search);

const isDoctor = (params.get('as') || '').toLowerCase() === 'doctor';
const hostUid = params.get('hostUid') || null;
const patientUidParam = params.get('uid') || null;

// Channel: prefer ?room=..., else derive from doctor's UID
const CHANNEL = params.get('room') || (hostUid ? `doc_${hostUid}` : "TechMed");

const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

let localTracks = [];
let remoteUsers = {};
let localUID = null;
let isJoining = false;
let identityForJoin = null; // used for token renewals

function getOrCreatePatientUid() {
  if (patientUidParam) return patientUidParam;
  try {
    const key = `techmed_patient_uid_${CHANNEL}`;
    let u = sessionStorage.getItem(key);
    if (!u) {
      u = (crypto?.randomUUID?.() || `p_${Math.random().toString(36).slice(2)}${Date.now()}`);
      if (!u.startsWith('p_')) u = `p_${u}`;
      sessionStorage.setItem(key, u);
    }
    return u;
  } catch {
    return `p_${Math.random().toString(36).slice(2)}${Date.now()}`;
  }
}

// Auto-select token endpoint: same-origin on prod, Cloud Function on localhost
const useSameOrigin =
  location.hostname.endsWith("web.app") ||
  location.hostname.endsWith("firebaseapp.com");
const SAME_ORIGIN_ENDPOINT = new URL("/agora/token", location.origin).toString();
const CF_ENDPOINT = "https://us-central1-t-echmed.cloudfunctions.net/agoraToken";

async function getToken(channel, uid) {
  if (!uid) throw new Error("Missing uid for token");
  const endpoints = useSameOrigin ? [SAME_ORIGIN_ENDPOINT, CF_ENDPOINT] : [CF_ENDPOINT, SAME_ORIGIN_ENDPOINT];
  let lastErr;
  for (const base of endpoints) {
    try {
      const url = `${base}?room=${encodeURIComponent(channel)}&uid=${encodeURIComponent(uid)}`;
      console.log("fetch token", url);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`token fetch failed (${res.status})`);
      const { token } = await res.json();
      if (!token) throw new Error("token missing");
      return token;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("token fetch failed");
}

// Auto-renew token to avoid drops on expiry
client.on("token-privilege-will-expire", async () => {
  try {
    if (!identityForJoin) return;
    const newToken = await getToken(CHANNEL, identityForJoin);
    await client.renewToken(newToken);
  } catch (err) {
    console.error("Token renewal failed:", err);
  }
});
client.on("token-privilege-did-expire", () => {
  alert("Session token expired. Please rejoin the meeting.");
});

let joinAndDisplayLocalStream = async () => {
  client.on("user-published", handleUserJoined);
  client.on("user-left", handleUserLeft);

  let desiredUid;
  if (isDoctor) {
    if (!hostUid) { alert("Missing hostUid for doctor. Use ?hostUid=<DOCTOR_UID>"); return; }
    desiredUid = hostUid;
  } else {
    desiredUid = getOrCreatePatientUid();
    if (!hostUid && !params.get("room")) {
      alert("Missing doctor UID. Link should include ?hostUid=<DOCTOR_UID> or ?room=doc_<DOCTOR_UID>");
      return;
    }
  }
  identityForJoin = desiredUid;

  let token;
  try {
    token = await getToken(CHANNEL, desiredUid);
    console.log("token ok", { channel: CHANNEL, uid: desiredUid, len: token.length });
  } catch (e) {
    console.error("Token error:", e);
    alert(`Token error: ${e.message || e}`);
    return;
  }

  try {
    localUID = await client.join(APP_ID, CHANNEL, token, desiredUid);
  } catch (e) {
    console.error("Agora join failed:", e);
    alert(`Join failed: ${e.code || ""} ${e.message || e}`);
    return;
  }

  localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();

  const player = `
    <div class="video-container" id="user-container-${localUID}">
      <div class="video-player" id="user-${localUID}"></div>
    </div>`;
  document.getElementById("video-streams").insertAdjacentHTML("beforeend", player);

  localTracks[1].play(`user-${localUID}`);
  await client.publish([localTracks[0], localTracks[1]]);
};

let joinStream = async () => {
  if (isJoining) return;
  isJoining = true;
  try {
    await joinAndDisplayLocalStream();
    document.getElementById("join-btn").style.display = "none";
    document.getElementById("stream-controls").style.display = "flex";
  } finally {
    isJoining = false;
  }
};

let handleUserJoined = async (user, mediaType) => {
  remoteUsers[user.uid] = user;
  await client.subscribe(user, mediaType);

  if (mediaType === "video") {
    let player = document.getElementById(`user-container-${user.uid}`);
    if (player) player.remove();
    player = `
      <div class="video-container" id="user-container-${user.uid}">
        <div class="video-player" id="user-${user.uid}"></div>
      </div>`;
    document.getElementById("video-streams").insertAdjacentHTML("beforeend", player);
    user.videoTrack.play(`user-${user.uid}`);
  }

  if (mediaType === "audio") {
    user.audioTrack.play();
  }
};

let handleUserLeft = async (user) => {
  delete remoteUsers[user.uid];
  const el = document.getElementById(`user-container-${user.uid}`);
  if (el) el.remove();
};

let leaveAndRemoveLocalStream = async () => {
  for (let i = 0; i < localTracks.length; i++) {
    localTracks[i].stop();
    localTracks[i].close();
  }

  await client.leave();
  document.getElementById("join-btn").style.display = "block";
  document.getElementById("stream-controls").style.display = "none";
  document.getElementById("video-streams").innerHTML = "";
  localUID = null;
  identityForJoin = null;
};

let toggleMic = async (e) => {
  if (localTracks[0].muted) {
    await localTracks[0].setMuted(false);
    e.target.innerText = "Mic on";
    e.target.style.backgroundColor = "cadetblue";
  } else {
    await localTracks[0].setMuted(true);
    e.target.innerText = "Mic off";
    e.target.style.backgroundColor = "#EE4B2B";
  }
};

let toggleCamera = async (e) => {
  if (localTracks[1].muted) {
    await localTracks[1].setMuted(false);
    e.target.innerText = "Camera on";
    e.target.style.backgroundColor = "cadetblue";
  } else {
    await localTracks[1].setMuted(true);
    e.target.innerText = "Camera off";
    e.target.style.backgroundColor = "#EE4B2B";
  }
};

document.getElementById("join-btn").addEventListener("click", joinStream);
document.getElementById("leave-btn").addEventListener("click", leaveAndRemoveLocalStream);
document.getElementById("mic-btn").addEventListener("click", toggleMic);
document.getElementById("camera-btn").addEventListener("click", toggleCamera);