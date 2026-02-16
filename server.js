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

  // Store timer info in DB
  await db.ref("smartHomeState/timer").set({
    id, devices, duration, action,
    startedAt: Date.now(),
    endsAt: Date.now() + (duration * 1000),
    active: true
  });

  activeTimers[id] = setTimeout(async () => {
    console.log(`[TIMER] Executing: ${id} - ${action} [${devices.join(',')}]`);
    const updates = {};
    devices.forEach(dev => {
      updates[dev] = action === "on";
    });
    // If turning on, make sure kill is off
    if (action === "on") updates.kill = false;
    await db.ref("smartHomeState").update(updates);
    await db.ref("smartHomeState/timer").set(null);
    delete activeTimers[id];
  }, duration * 1000);
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
  const valid = devices.every(d => ["led1", "led2", "led3"].includes(d));
  if (!valid) {
    return res.status(400).json({ error: "Invalid device names. Use led1, led2, led3." });
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

// ======================== START SERVER ========================

app.listen(PORT, () => {
  console.log("========================================");
  console.log("  SmartHome Cloud Control Server");
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Firebase: ${DATABASE_URL}`);
  console.log("========================================");
});
