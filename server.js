/*
  ============================================================
  SmartHome Cloud Control — Node.js Server
  ============================================================
  Role:
    - Serve static web frontend
    - Firebase Admin SDK for backend management
    - REST API for admin operations
    - Initialize default database state

  Architecture:
    Browser (Firebase SDK) ←→ Firebase RTDB ←→ ESP32
    Browser ←→ This Server (static files + admin API)
  ============================================================
*/

require('dotenv').config();
const express = require("express");
const admin = require("firebase-admin");
const { smarthome } = require("actions-on-google");

// ======================== CONFIG ========================

const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT || "./serviceAccountKey.json";
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || "https://team14-iot-default-rtdb.firebaseio.com/";
const PORT = process.env.PORT || 3000;

// ======================== FIREBASE ADMIN INIT ========================

try {
  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: DATABASE_URL
  });
  console.log("[FIREBASE] Admin SDK initialized");
} catch (err) {
  console.error("[FIREBASE] Failed to initialize:", err.message);
  process.exit(1);
}

const db = admin.database();

// ======================== ESP32 HEARTBEAT TRACKING ========================

let esp32Status = {
  online: false,
  lastSeen: null,
  ip: null,
  rssi: null,
  uptime: null,
  freeHeap: null
};

const ESP_TIMEOUT_MS = 30000; // 30 seconds without heartbeat = offline

// Check ESP32 status periodically
setInterval(() => {
  if (esp32Status.lastSeen) {
    const elapsed = Date.now() - new Date(esp32Status.lastSeen).getTime();
    if (elapsed > ESP_TIMEOUT_MS) {
      esp32Status.online = false;
    }
  }
}, 5000);

// ======================== DEFAULT STATE ========================

const defaultState = {
  led1: false,
  led2: false,
  led3: false,
  tv: false,
  mode: "normal",
  kill: false,
  timer: null
};

// ======================== TIMER MANAGEMENT ========================

let activeTimers = {}; // { timerId: setTimeout ref }

function clearAllTimers() {
  Object.keys(activeTimers).forEach(id => {
    clearTimeout(activeTimers[id]);
    delete activeTimers[id];
  });
}

async function executeTimer(timerData) {
  const { id, devices, duration, action } = timerData;
  console.log(`[TIMER] Starting: ${id} - ${action} [${devices.join(',')}] in ${duration}s`);

  // Only store timer info — the watcher will handle scheduling
  // This prevents double-scheduling (executeTimer + watcher both creating timeouts)
  await db.ref("smartHomeState/timer").set({
    id, devices, duration, action,
    startedAt: Date.now(),
    endsAt: Date.now() + (duration * 1000),
    active: true
  });
}

// Initialize database if empty
async function initializeDatabase() {
  try {
    const snap = await db.ref("smartHomeState").once("value");
    if (!snap.exists()) {
      await db.ref("smartHomeState").set(defaultState);
      console.log("[DB] Initialized default state");
    } else {
      console.log("[DB] Existing state found:", JSON.stringify(snap.val()));
    }
  } catch (err) {
    console.error("[DB] Init error:", err.message);
  }
}

initializeDatabase();

// ======================== TIMER WATCHER (server-side reliability) ========================

db.ref("smartHomeState/timer").on("value", async (snap) => {
  const timer = snap.val();
  if (timer && timer.active) {
    // Skip if we already have this exact timer scheduled
    if (activeTimers[timer.id]) {
      console.log(`[TIMER] Already tracking ${timer.id}, skipping re-schedule`);
      return;
    }
    clearAllTimers();
    const remaining = Math.max(0, timer.endsAt - Date.now());
    if (remaining <= 0) {
      console.log(`[TIMER] Expired timer found, executing now`);
      const updates = {};
      timer.devices.forEach(d => { updates[d] = timer.action === "on"; });
      if (timer.action === "on") updates.kill = false;
      updates.timer = null;
      await db.ref("smartHomeState").update(updates);
    } else {
      console.log(`[TIMER] Scheduling ${timer.id} in ${Math.ceil(remaining/1000)}s — action: ${timer.action} devices: [${timer.devices.join(',')}]`);
      activeTimers[timer.id] = setTimeout(async () => {
        console.log(`[TIMER] Executing: ${timer.id} — turning ${timer.action} [${timer.devices.join(',')}]`);
        const updates = {};
        timer.devices.forEach(d => { updates[d] = timer.action === "on"; });
        if (timer.action === "on") updates.kill = false;
        updates.timer = null;
        await db.ref("smartHomeState").update(updates);
        delete activeTimers[timer.id];
        console.log(`[TIMER] Done: ${timer.id} — devices set to ${timer.action}`);
      }, remaining);
    }
  } else {
    clearAllTimers();
  }
});

// ======================== EXPRESS APP ========================

const app = express();
app.use(express.json());
app.use(express.static("public"));

// ======================== REST API ========================

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    project: "team14-iot",
    database: DATABASE_URL,
    uptime: process.uptime()
  });
});

// Get current state
app.get("/api/state", async (req, res) => {
  try {
    const snap = await db.ref("smartHomeState").once("value");
    res.json(snap.val() || defaultState);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update state (admin)
app.post("/api/state", async (req, res) => {
  try {
    const updates = req.body;
    await db.ref("smartHomeState").update(updates);
    res.json({ success: true, updated: updates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle a specific LED
app.post("/api/toggle/:led", async (req, res) => {
  const led = req.params.led;
  if (!["led1", "led2", "led3", "tv"].includes(led)) {
    return res.status(400).json({ error: "Invalid device. Use led1, led2, led3, or tv." });
  }

  try {
    const snap = await db.ref(`smartHomeState/${led}`).once("value");
    const newVal = !snap.val();
    await db.ref(`smartHomeState/${led}`).set(newVal);
    res.json({ [led]: newVal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set mode (removed disco to fix LED2 conflict)
app.post("/api/mode/:mode", async (req, res) => {
  const mode = req.params.mode;
  if (!["normal", "wave", "pulse"].includes(mode)) {
    return res.status(400).json({ error: "Invalid mode. Use normal, wave, or pulse." });
  }

  try {
    await db.ref("smartHomeState/mode").set(mode);
    res.json({ mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kill switch
app.post("/api/kill", async (req, res) => {
  try {
    await db.ref("smartHomeState").update({
      led1: false,
      led2: false,
      led3: false,
      kill: true,
      mode: "normal"
    });
    res.json({ killed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset to defaults
app.post("/api/reset", async (req, res) => {
  try {
    await db.ref("smartHomeState").set(defaultState);
    res.json({ reset: true, state: defaultState });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== ESP32 HEARTBEAT ========================

// ESP32 sends heartbeat
app.post("/api/esp/heartbeat", (req, res) => {
  const { ip, rssi, uptime, freeHeap } = req.body || {};
  esp32Status = {
    online: true,
    lastSeen: new Date().toISOString(),
    ip: ip || req.ip,
    rssi: rssi || null,
    uptime: uptime || null,
    freeHeap: freeHeap || null
  };
  res.json({ ok: true, serverTime: Date.now() });
});

// Get ESP32 status
app.get("/api/esp/status", (req, res) => {
  // Recheck freshness
  if (esp32Status.lastSeen) {
    const elapsed = Date.now() - new Date(esp32Status.lastSeen).getTime();
    esp32Status.online = elapsed < ESP_TIMEOUT_MS;
  }
  res.json(esp32Status);
});

// All LEDs ON
app.post("/api/all-on", async (req, res) => {
  try {
    await db.ref("smartHomeState").update({
      led1: true,
      led2: true,
      led3: true,
      kill: false
    });
    res.json({ success: true, all: "on" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All LEDs OFF
app.post("/api/all-off", async (req, res) => {
  try {
    await db.ref("smartHomeState").update({
      led1: false,
      led2: false,
      led3: false
    });
    res.json({ success: true, all: "off" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== TIMER API ========================

// Start a timer
app.post("/api/timer/start", async (req, res) => {
  const { devices, duration, action } = req.body;
  if (!devices || !Array.isArray(devices) || devices.length === 0) {
    return res.status(400).json({ error: "devices must be a non-empty array of led names" });
  }
  if (!duration || duration < 1 || duration > 86400) {
    return res.status(400).json({ error: "duration must be between 1 and 86400 seconds" });
  }
  if (!["on", "off"].includes(action)) {
    return res.status(400).json({ error: "action must be 'on' or 'off'" });
  }
  // Validate device names
  const valid = devices.every(d => ["led1", "led2", "led3", "tv"].includes(d));
  if (!valid) {
    return res.status(400).json({ error: "Invalid device names. Use led1, led2, led3, tv." });
  }

  try {
    clearAllTimers();
    const timerId = `timer_${Date.now()}`;
    await executeTimer({ id: timerId, devices, duration, action });
    res.json({ success: true, timerId, devices, duration, action });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel timer
app.post("/api/timer/cancel", async (req, res) => {
  try {
    clearAllTimers();
    await db.ref("smartHomeState/timer").set(null);
    res.json({ success: true, cancelled: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get timer status
app.get("/api/timer/status", async (req, res) => {
  try {
    const snap = await db.ref("smartHomeState/timer").once("value");
    const timer = snap.val();
    if (timer && timer.active) {
      const remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
      if (remaining <= 0) {
        await db.ref("smartHomeState/timer").set(null);
        res.json({ active: false });
      } else {
        res.json({ active: true, ...timer, remaining });
      }
    } else {
      res.json({ active: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== GEMINI-FRIENDLY GET ACTION URLS ========================
// These are simple tappable links that Gemini mobile app can generate.
// Pattern: /do/<device>/<on|off|toggle>  or  /do/<action>

const DEVICE_ALIASES = {
  "living-room": "led1", "livingroom": "led1", "lounge": "led1", "led1": "led1",
  "bedroom": "led2", "bed": "led2", "led2": "led2",
  "kitchen": "led3", "led3": "led3",
  "tv": "tv", "television": "tv"
};

const DEVICE_LABELS = { led1: "Living Room", led2: "Bedroom", led3: "Kitchen", tv: "TV" };

function actionPage(title, message, success = true) {
  const color = success ? "#00ff88" : "#ff3355";
  const icon = success ? "\u2705" : "\u274C";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0a0e1a;color:#e0f2fe;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
.card{background:rgba(0,255,255,0.04);border:1px solid rgba(0,255,255,0.25);border-radius:20px;padding:40px 32px;max-width:400px;width:100%;box-shadow:0 0 40px rgba(0,255,255,0.08)}
.icon{font-size:3rem;margin-bottom:16px}.title{font-size:1.3rem;font-weight:800;background:linear-gradient(135deg,#00ffff,#ff00ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.msg{font-size:0.95rem;color:#94a3b8;line-height:1.6;margin-bottom:24px}.status{display:inline-block;padding:6px 18px;border-radius:20px;font-size:0.85rem;font-weight:700;background:${color}22;color:${color};border:1px solid ${color}44}
a.link{display:block;margin-top:16px;color:#00ffff;font-size:0.8rem;text-decoration:none;opacity:0.7}</style></head>
<body><div class="card"><div class="icon">${icon}</div><div class="title">${title}</div><div class="msg">${message}</div><div class="status">${success ? "EXECUTED" : "FAILED"}</div><a class="link" href="/">Open Dashboard</a></div></body></html>`;
}

// Device ON/OFF/TOGGLE
app.get("/do/:device/:action", async (req, res) => {
  const deviceKey = DEVICE_ALIASES[req.params.device.toLowerCase()];
  const action = req.params.action.toLowerCase();
  if (!deviceKey) return res.status(400).send(actionPage("Unknown Device", `"${req.params.device}" is not a valid device. Use: living-room, bedroom, kitchen, tv`, false));
  if (!["on", "off", "toggle"].includes(action)) return res.status(400).send(actionPage("Bad Action", `Use on, off, or toggle`, false));
  try {
    let newVal;
    if (action === "toggle") {
      const snap = await db.ref(`smartHomeState/${deviceKey}`).once("value");
      newVal = !snap.val();
    } else {
      newVal = action === "on";
    }
    const updates = { [deviceKey]: newVal };
    if (newVal) updates.kill = false;
    await db.ref("smartHomeState").update(updates);
    const label = DEVICE_LABELS[deviceKey];
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({ success: true, device: label, state: newVal ? "ON" : "OFF" });
    }
    res.send(actionPage(`${label} ${newVal ? "ON" : "OFF"}`, `${label} has been turned ${newVal ? "ON" : "OFF"} successfully.`));
  } catch (err) { res.status(500).send(actionPage("Error", err.message, false)); }
});

// All ON / All OFF
app.get("/do/all-on", async (req, res) => {
  try {
    await db.ref("smartHomeState").update({ led1: true, led2: true, led3: true, tv: true, kill: false });
    if (req.headers.accept && req.headers.accept.includes("application/json")) return res.json({ success: true, all: "on" });
    res.send(actionPage("All Devices ON", "Living Room, Bedroom, Kitchen, and TV have been turned ON."));
  } catch (err) { res.status(500).send(actionPage("Error", err.message, false)); }
});

app.get("/do/all-off", async (req, res) => {
  try {
    await db.ref("smartHomeState").update({ led1: false, led2: false, led3: false, tv: false });
    if (req.headers.accept && req.headers.accept.includes("application/json")) return res.json({ success: true, all: "off" });
    res.send(actionPage("All Devices OFF", "All devices have been turned OFF."));
  } catch (err) { res.status(500).send(actionPage("Error", err.message, false)); }
});

// Lights only (no TV)
app.get("/do/lights-on", async (req, res) => {
  try {
    await db.ref("smartHomeState").update({ led1: true, led2: true, led3: true, kill: false });
    res.send(actionPage("All Lights ON", "Living Room, Bedroom, and Kitchen lights turned ON."));
  } catch (err) { res.status(500).send(actionPage("Error", err.message, false)); }
});

app.get("/do/lights-off", async (req, res) => {
  try {
    await db.ref("smartHomeState").update({ led1: false, led2: false, led3: false });
    res.send(actionPage("All Lights OFF", "All lights turned OFF."));
  } catch (err) { res.status(500).send(actionPage("Error", err.message, false)); }
});

// Emergency
app.get("/do/emergency", async (req, res) => {
  try {
    await db.ref("smartHomeState").update({ led1: false, led2: false, led3: false, tv: false, kill: true });
    res.send(actionPage("\u{1F6A8} EMERGENCY STOP", "All devices shut down. Kill switch activated."));
  } catch (err) { res.status(500).send(actionPage("Error", err.message, false)); }
});

// Timer via URL: /do/timer/<device>/<duration-seconds>/<on|off>
app.get("/do/timer/:device/:duration/:action", async (req, res) => {
  const deviceKey = DEVICE_ALIASES[req.params.device.toLowerCase()];
  const duration = parseInt(req.params.duration);
  const action = req.params.action.toLowerCase();
  if (!deviceKey) return res.status(400).send(actionPage("Unknown Device", `"${req.params.device}" is not valid.`, false));
  if (!duration || duration < 1 || duration > 86400) return res.status(400).send(actionPage("Bad Duration", "Duration must be 1-86400 seconds.", false));
  if (!["on", "off"].includes(action)) return res.status(400).send(actionPage("Bad Action", "Use on or off.", false));
  try {
    const timerData = {
      id: "timer_" + Date.now(), devices: [deviceKey], duration, action,
      startedAt: Date.now(), endsAt: Date.now() + (duration * 1000), active: true
    };
    await db.ref("smartHomeState/timer").set(timerData);
    const label = DEVICE_LABELS[deviceKey];
    const mins = Math.floor(duration / 60), secs = duration % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    res.send(actionPage(`Timer Set`, `${label} will turn ${action.toUpperCase()} in ${timeStr}.`));
  } catch (err) { res.status(500).send(actionPage("Error", err.message, false)); }
});

// Timer for multiple devices: /do/timer-all/<duration>/<on|off>
app.get("/do/timer-all/:duration/:action", async (req, res) => {
  const duration = parseInt(req.params.duration);
  const action = req.params.action.toLowerCase();
  if (!duration || duration < 1 || duration > 86400) return res.status(400).send(actionPage("Bad Duration", "Duration must be 1-86400 seconds.", false));
  if (!["on", "off"].includes(action)) return res.status(400).send(actionPage("Bad Action", "Use on or off.", false));
  try {
    const timerData = {
      id: "timer_" + Date.now(), devices: ["led1", "led2", "led3", "tv"], duration, action,
      startedAt: Date.now(), endsAt: Date.now() + (duration * 1000), active: true
    };
    await db.ref("smartHomeState/timer").set(timerData);
    const mins = Math.floor(duration / 60), secs = duration % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    res.send(actionPage(`Timer Set`, `All devices will turn ${action.toUpperCase()} in ${timeStr}.`));
  } catch (err) { res.status(500).send(actionPage("Error", err.message, false)); }
});

// Cancel timer
app.get("/do/timer-cancel", async (req, res) => {
  try {
    clearAllTimers();
    await db.ref("smartHomeState/timer").set(null);
    res.send(actionPage("Timer Cancelled", "Active timer has been stopped."));
  } catch (err) { res.status(500).send(actionPage("Error", err.message, false)); }
});

// Status page (JSON)
app.get("/do/status", async (req, res) => {
  try {
    const snap = await db.ref("smartHomeState").once("value");
    const s = snap.val() || defaultState;
    const lines = [
      `Living Room: ${s.led1 ? "ON" : "OFF"}`,
      `Bedroom: ${s.led2 ? "ON" : "OFF"}`,
      `Kitchen: ${s.led3 ? "ON" : "OFF"}`,
      `TV: ${s.tv ? "ON" : "OFF"}`,
      `Kill Switch: ${s.kill ? "ACTIVE" : "OFF"}`,
      s.timer ? `Timer: Active (${Math.ceil((s.timer.endsAt - Date.now())/1000)}s left)` : `Timer: None`
    ];
    if (req.headers.accept && req.headers.accept.includes("application/json")) return res.json(s);
    res.send(actionPage("\u{1F4CA} Device Status", lines.join("<br>")));
  } catch (err) { res.status(500).send(actionPage("Error", err.message, false)); }
});

// Action index
app.get("/do", (req, res) => {
  res.send(actionPage("\u{1F3AE} SmartHome Actions",
    `<div style="text-align:left;font-size:0.82rem;line-height:2">
    <b>Devices:</b><br>
    <a href="/do/living-room/on" style="color:#00ffff">/do/living-room/on</a><br>
    <a href="/do/living-room/off" style="color:#00ffff">/do/living-room/off</a><br>
    <a href="/do/bedroom/on" style="color:#00ffff">/do/bedroom/on</a><br>
    <a href="/do/bedroom/off" style="color:#00ffff">/do/bedroom/off</a><br>
    <a href="/do/kitchen/on" style="color:#00ffff">/do/kitchen/on</a><br>
    <a href="/do/kitchen/off" style="color:#00ffff">/do/kitchen/off</a><br>
    <a href="/do/tv/on" style="color:#00ffff">/do/tv/on</a><br>
    <a href="/do/tv/off" style="color:#00ffff">/do/tv/off</a><br><br>
    <b>Bulk:</b><br>
    <a href="/do/all-on" style="color:#00ffff">/do/all-on</a><br>
    <a href="/do/all-off" style="color:#00ffff">/do/all-off</a><br>
    <a href="/do/lights-on" style="color:#00ffff">/do/lights-on</a><br>
    <a href="/do/lights-off" style="color:#00ffff">/do/lights-off</a><br>
    <a href="/do/emergency" style="color:#ff3355">/do/emergency</a><br><br>
    <b>Timer:</b><br>
    /do/timer/bedroom/300/off <small>(5min)</small><br>
    /do/timer-all/600/off <small>(10min)</small><br>
    <a href="/do/timer-cancel" style="color:#00ffff">/do/timer-cancel</a><br><br>
    <b>Status:</b><br>
    <a href="/do/status" style="color:#00ffff">/do/status</a>
    </div>`
  ));
});

// ======================== GOOGLE HOME SMART HOME ========================

const googleHome = smarthome();

// SYNC — Tell Google what devices exist
googleHome.onSync((body) => {
  console.log("[GOOGLE HOME] SYNC request");
  return {
    requestId: body.requestId,
    payload: {
      agentUserId: "team14-user",
      devices: [
        {
          id: "led1",
          type: "action.devices.types.LIGHT",
          traits: ["action.devices.traits.OnOff"],
          name: { defaultNames: ["Living Room Light"], name: "Living Room", nicknames: ["Living Room", "Lounge"] },
          willReportState: true,
          roomHint: "Living Room"
        },
        {
          id: "led2",
          type: "action.devices.types.LIGHT",
          traits: ["action.devices.traits.OnOff"],
          name: { defaultNames: ["Bedroom Light"], name: "Bedroom", nicknames: ["Bedroom", "Bed Light"] },
          willReportState: true,
          roomHint: "Bedroom"
        },
        {
          id: "led3",
          type: "action.devices.types.LIGHT",
          traits: ["action.devices.traits.OnOff"],
          name: { defaultNames: ["Kitchen Light"], name: "Kitchen", nicknames: ["Kitchen"] },
          willReportState: true,
          roomHint: "Kitchen"
        },
        {
          id: "tv",
          type: "action.devices.types.TV",
          traits: ["action.devices.traits.OnOff"],
          name: { defaultNames: ["TV"], name: "TV", nicknames: ["Television", "Telly"] },
          willReportState: true,
          roomHint: "Living Room"
        }
      ]
    }
  };
});

// QUERY — Google asks for current device state
googleHome.onQuery(async (body) => {
  console.log("[GOOGLE HOME] QUERY request");
  const snap = await db.ref("smartHomeState").once("value");
  const state = snap.val() || {};

  const devices = {};
  for (const device of body.inputs[0].payload.devices) {
    devices[device.id] = {
      status: "SUCCESS",
      online: true,
      on: !!state[device.id]
    };
  }

  return { requestId: body.requestId, payload: { devices } };
});

// EXECUTE — Google tells us to change device state
googleHome.onExecute(async (body) => {
  console.log("[GOOGLE HOME] EXECUTE request");
  const commands = body.inputs[0].payload.commands;
  const results = [];

  for (const command of commands) {
    for (const execution of command.execution) {
      if (execution.command === "action.devices.commands.OnOff") {
        const updates = {};
        const ids = command.devices.map(d => d.id);

        for (const id of ids) {
          updates[id] = execution.params.on;
        }
        if (execution.params.on) updates.kill = false;

        await db.ref("smartHomeState").update(updates);
        console.log(`[GOOGLE HOME] Set ${ids.join(',')} to ${execution.params.on ? 'ON' : 'OFF'}`);

        results.push({
          ids,
          status: "SUCCESS",
          states: { on: execution.params.on, online: true }
        });
      }
    }
  }

  return { requestId: body.requestId, payload: { commands: results } };
});

// DISCONNECT
googleHome.onDisconnect((body) => {
  console.log("[GOOGLE HOME] DISCONNECT request");
  return {};
});

// Mount Google Smart Home fulfillment endpoint
app.post("/smarthome", googleHome);

// ======================== OAUTH ENDPOINTS (for Google Home linking) ========================

// Authorization endpoint — Google redirects user here to link account
app.get("/auth", (req, res) => {
  const redirectUri = req.query.redirect_uri;
  const state = req.query.state;
  console.log(`[OAUTH] Auth request, redirecting to: ${redirectUri}`);
  // Auto-approve for personal/demo use
  res.redirect(`${redirectUri}?code=SMARTHOME_AUTH_CODE&state=${state}`);
});

// Token endpoint — Google exchanges code for access token
app.post("/token", (req, res) => {
  console.log("[OAUTH] Token request");
  res.json({
    token_type: "Bearer",
    access_token: "smarthome-access-token-team14",
    refresh_token: "smarthome-refresh-token-team14",
    expires_in: 315360000 // 10 years
  });
});

// ======================== START SERVER ========================

app.listen(PORT, () => {
  console.log("========================================");
  console.log("  SmartHome Cloud Control Server");
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Firebase: ${DATABASE_URL}`);
  console.log("  Google Home: POST /smarthome");
  console.log("  OAuth: GET /auth, POST /token");
  console.log("========================================");
});
