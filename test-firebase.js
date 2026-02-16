// Test Firebase connectivity and database updates
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://team14-iot-default-rtdb.firebaseio.com/"
});

const db = admin.database();

async function testFirebase() {
  console.log("\n=== Testing Firebase Connection ===\n");
  
  try {
    // 1. Test read
    console.log("1️⃣ Reading database...");
    const snap = await db.ref("smartHomeState").once("value");
    if (snap.exists()) {
      console.log("✓ Data exists:");
      console.log(JSON.stringify(snap.val(), null, 2));
    } else {
      console.log("✗ No data at /smartHomeState");
      console.log("Creating default data...");
      
      const defaultState = {
        led1: false,
        led2: false,
        led3: false,
        timer: {
          active: false,
          duration: 0,
          remainingTime: 0,
          targetLeds: []
        },
        mode: "normal",
        kill: false
      };
      
      await db.ref("smartHomeState").set(defaultState);
      console.log("✓ Default data created!");
    }
    
    // 2. Test write
    console.log("\n2️⃣ Testing write operation...");
    await db.ref("smartHomeState/led1").set(true);
    console.log("✓ Wrote led1 = true");
    
    // 3. Test read back
    console.log("\n3️⃣ Reading back value...");
    const snap2 = await db.ref("smartHomeState/led1").once("value");
    console.log("✓ led1 = " + snap2.val());
    
    // 4. Test update
    console.log("\n4️⃣ Testing update operation...");
    await db.ref("smartHomeState").update({
      led1: false,
      led2: true,
      mode: "wave"
    });
    console.log("✓ Update successful");
    
    // 5. Read final state
    console.log("\n5️⃣ Final state:");
    const snap3 = await db.ref("smartHomeState").once("value");
    console.log(JSON.stringify(snap3.val(), null, 2));
    
    console.log("\n✅ All tests passed!");
    process.exit(0);
    
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    console.error(err);
    process.exit(1);
  }
}

testFirebase();
