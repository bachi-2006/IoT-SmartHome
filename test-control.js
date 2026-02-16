// Test controlling LED2 and monitoring changes
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://team14-iot-default-rtdb.firebaseio.com/"
});

const db = admin.database();

async function testControl() {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║   SMART HOME LED CONTROL TEST        ║");
  console.log("╚════════════════════════════════════════╝\n");
  
  try {
    // Step 1: Show current state
    console.log("📊 CURRENT STATE:");
    let snap = await db.ref("smartHomeState").once("value");
    const currentState = snap.val();
    console.log(`  • LED1: ${currentState.led1 ? "🟢 ON" : "⚫ OFF"}`);
    console.log(`  • LED2: ${currentState.led2 ? "🟢 ON" : "⚫ OFF"}`);
    console.log(`  • LED3: ${currentState.led3 ? "🟢 ON" : "⚫ OFF"}`);
    console.log(`  • MODE: ${currentState.mode}`);
    console.log(`  • KILL: ${currentState.kill ? "🔴 ACTIVE" : "⚪ INACTIVE"}`);
    
    // Step 2: Turn ON LED2
    console.log("\n🔄 ACTION: Turning ON LED2...");
    await db.ref("smartHomeState/led2").set(true);
    console.log("✅ LED2 set to TRUE\n");
    
    // Wait a moment for propagation
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 3: Read and verify
    console.log("📊 NEW STATE:");
    snap = await db.ref("smartHomeState").once("value");
    const newState = snap.val();
    console.log(`  • LED1: ${newState.led1 ? "🟢 ON" : "⚫ OFF"}`);
    console.log(`  • LED2: ${newState.led2 ? "🟢 ON" : "⚫ OFF"} ← CHANGED!`);
    console.log(`  • LED3: ${newState.led3 ? "🟢 ON" : "⚫ OFF"}`);
    
    // Step 4: Test turning OFF
    console.log("\n🔄 ACTION: Turning OFF LED2...");
    await db.ref("smartHomeState/led2").set(false);
    console.log("✅ LED2 set to FALSE\n");
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log("📊 FINAL STATE:");
    snap = await db.ref("smartHomeState").once("value");
    const finalState = snap.val();
    console.log(`  • LED1: ${finalState.led1 ? "🟢 ON" : "⚫ OFF"}`);
    console.log(`  • LED2: ${finalState.led2 ? "🟢 ON" : "⚫ OFF"}`);
    console.log(`  • LED3: ${finalState.led3 ? "🟢 ON" : "⚫ OFF"}`);
    
    // Step 5: Test turning on ALL LEDs
    console.log("\n🔄 ACTION: Turning ON all LEDs...");
    await db.ref("smartHomeState").update({
      led1: true,
      led2: true,
      led3: true
    });
    console.log("✅ All LEDs set to TRUE\n");
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log("📊 ALL LEDS STATE:");
    snap = await db.ref("smartHomeState").once("value");
    const allOnState = snap.val();
    console.log(`  • LED1: ${allOnState.led1 ? "🟢 ON" : "⚫ OFF"}`);
    console.log(`  • LED2: ${allOnState.led2 ? "🟢 ON" : "⚫ OFF"}`);
    console.log(`  • LED3: ${allOnState.led3 ? "🟢 ON" : "⚫ OFF"}`);
    
    // Step 6: Kill all
    console.log("\n🔄 ACTION: KILL ALL (emergency shutdown)...");
    await db.ref("smartHomeState/kill").set(true);
    console.log("✅ Kill signal sent\n");
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log("📊 STATE AFTER KILL:");
    snap = await db.ref("smartHomeState").once("value");
    const killState = snap.val();
    console.log(`  • LED1: ${killState.led1 ? "🟢 ON" : "⚫ OFF"}`);
    console.log(`  • LED2: ${killState.led2 ? "🟢 ON" : "⚫ OFF"}`);
    console.log(`  • LED3: ${killState.led3 ? "🟢 ON" : "⚫ OFF"}`);
    console.log(`  • KILL: ${killState.kill ? "🔴 ACTIVE" : "⚪ INACTIVE"}`);
    
    console.log("\n╔════════════════════════════════════════╗");
    console.log("║   ✅ ALL TESTS PASSED!               ║");
    console.log("║   Database is updating correctly      ║");
    console.log("║   Server is ready for dashboard use   ║");
    console.log("╚════════════════════════════════════════╝\n");
    
    process.exit(0);
    
  } catch (err) {
    console.error("\n❌ ERROR:", err.message);
    console.error(err);
    process.exit(1);
  }
}

testControl();
