const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://team14-iot-default-rtdb.firebaseio.com/'
});

const db = admin.database();

console.log('\n╔════════════════════════════════════════╗');
console.log('║  🔧 PRODUCTION SETUP VERIFICATION    ║');
console.log('╚════════════════════════════════════════╝\n');

async function verify() {
  try {
    // 1. Test Firebase connection
    console.log('📡 Testing Firebase connection...');
    const testRef = db.ref('.info/connected');
    const snapshot = await testRef.once('value');
    
    if (snapshot.val() === true) {
      console.log('✅ Firebase connection successful\n');
    } else {
      console.log('❌ Firebase connection failed\n');
      process.exit(1);
    }

    // 2. Set up production database structure
    console.log('🏗️  Setting up production database structure...');
    const productionState = {
      led1: false,
      led2: false,
      led3: false,
      mode: 'normal',
      kill: false
    };

    await db.ref('smartHomeState').set(productionState);
    console.log('✅ Database initialized with:\n');
    console.log('   smartHomeState/');
    console.log('   ├── led1: false');
    console.log('   ├── led2: false');
    console.log('   ├── led3: false');
    console.log('   ├── mode: "normal"');
    console.log('   └── kill: false\n');

    // 3. Verify data was written
    console.log('✔️  Verifying data...');
    const verify = await db.ref('smartHomeState').once('value');
    const data = verify.val();
    
    console.log('✅ Database verified:\n');
    console.log('   Current State:');
    console.log(`   - LED1: ${data.led1 ? '✓ ON' : '✗ OFF'}`);
    console.log(`   - LED2: ${data.led2 ? '✓ ON' : '✗ OFF'}`);
    console.log(`   - LED3: ${data.led3 ? '✓ ON' : '✗ OFF'}`);
    console.log(`   - Mode: ${data.mode}`);
    console.log(`   - Kill: ${data.kill ? '🔴 ACTIVE' : '🟢 NORMAL'}\n`);

    // 4. Instructions
    console.log('╔════════════════════════════════════════╗');
    console.log('║  🚀 NEXT STEPS                        ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log('1️⃣  Upload ESP32 firmware:');
    console.log('   → Open: ESP32_PRODUCTION.ino');
    console.log('   → Select: Board: ESP32 Dev Module');
    console.log('   → Click: Upload\n');

    console.log('2️⃣  Open website (no server needed):');
    console.log('   → Open: public/index-production.html');
    console.log('   → In: Browser (Chrome, Firefox, Safari)\n');

    console.log('3️⃣  Test the system:');
    console.log('   → Click LED buttons');
    console.log('   → Check ESP32 serial monitor');
    console.log('   → Verify LEDs turn ON/OFF\n');

    console.log('📖 Read: PRODUCTION_ARCHITECTURE.md\n');

    console.log('╔════════════════════════════════════════╗');
    console.log('║  ✅ SETUP COMPLETE                    ║');
    console.log('╚════════════════════════════════════════╝\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verify();
