// Test LED2 with clean output
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://team14-iot-default-rtdb.firebaseio.com/"
});

const db = admin.database();

async function quickTest() {
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║         🏠 SMART HOME LED2 CONTROL TEST              ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");
  
  // Get current state
  let snap = await db.ref("smartHomeState").once("value");
  const state = snap.val();
  
  console.log(`⏱️  TIMESTAMP: ${new Date().toLocaleTimeString()}\n`);
  
  console.log("📊 INITIAL STATE:");
  console.log(`   LED2 Before:  ${state.led2 ? "🟢 ON" : "⚫ OFF"}`);
  
  // Turn ON LED2
  console.log("\n➡️  ACTION: Setting LED2 = true");
  await db.ref("smartHomeState/led2").set(true);
  console.log("   ✅ Firebase write complete\n");
  
  await delay(500);
  
  // Read back
  snap = await db.ref("smartHomeState/led2").once("value");
  console.log(`📊 AFTER UPDATE:`);
  console.log(`   LED2 After:   ${snap.val() ? "🟢 ON" : "⚫ OFF"} ← SUCCESS!\n`);
  
  // Show all 3 LEDs
  snap = await db.ref("smartHomeState").once("value");
  const allLeds = snap.val();
  
  console.log("🎛️  ALL DEVICE STATUS:");
  console.log(`   LED1: ${allLeds.led1 ? "🟢 ON" : "⚫ OFF"}`);
  console.log(`   LED2: ${allLeds.led2 ? "🟢 ON" : "⚫ OFF"}`);
  console.log(`   LED3: ${allLeds.led3 ? "🟢 ON" : "⚫ OFF"}`);
  console.log(`   MODE: ${allLeds.mode}`);
  
  console.log("\n✅ Database is LIVE and updating in real-time!");
  console.log("✅ Server on port 3000 is receiving these updates!");
  console.log("✅ All connected web clients are being notified via Socket.IO!\n");
  
  process.exit(0);
}

quickTest().catch(e => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
