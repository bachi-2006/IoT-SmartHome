// Replaced with user-provided ESP32 Smart Home sketch (Database secret auth)

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>

// ============================================================
// WIFI CONFIG
// ============================================================

#define WIFI_SSID "Bliss2_2G"
#define WIFI_PASSWORD "bliss2@123"

// ============================================================
// FIREBASE CONFIG
// ============================================================

#define DATABASE_URL "http://team14-iot-default-rtdb.firebaseio.com/"  // Use HTTP
#define DATABASE_SECRET "Cvs9G7AmoCuexP09PjQkHRoouBlm68ivrLqVAsHX"  // Paste your secret here

FirebaseData fbdo;
FirebaseData fbStream;
FirebaseAuth auth;
FirebaseConfig config;

// ============================================================
// GPIO
// ============================================================

#define LED1 2
#define LED2 4
#define LED3 5

// ============================================================
// STATE
// ============================================================

bool led1=false;
bool led2=false;
bool led3=false;
bool killSwitch=false;
String mode="normal";

unsigned long lastAnim=0;
int waveStep=0;
bool pulse=false;

// ============================================================
// STREAM CALLBACK
// ============================================================

void streamCallback(FirebaseStream data){
  
  Serial.println("\n[STREAM] ✓ Data received!");
  
  String path = data.dataPath();
  
  Serial.print("[PATH] ");
  Serial.println(path);

  // ROOT UPDATE (entire object)
  if(path == "/"){
    
    FirebaseJson *json = data.to<FirebaseJson *>();
    FirebaseJsonData jd;

    if(json->get(jd, "led1")){
      led1 = jd.to<bool>();
      Serial.print("  LED1: ");
      Serial.println(led1 ? "ON" : "OFF");
    }
    
    if(json->get(jd, "led2")){
      led2 = jd.to<bool>();
      Serial.print("  LED2: ");
      Serial.println(led2 ? "ON" : "OFF");
    }
    
    if(json->get(jd, "led3")){
      led3 = jd.to<bool>();
      Serial.print("  LED3: ");
      Serial.println(led3 ? "ON" : "OFF");
    }
    
    if(json->get(jd, "kill")){
      killSwitch = jd.to<bool>();
      Serial.print("  KILL: ");
      Serial.println(killSwitch ? "ON" : "OFF");
    }
    
    if(json->get(jd, "mode")){
      mode = jd.to<String>();
      Serial.print("  MODE: ");
      Serial.println(mode);
    }
  }

  // SINGLE FIELD UPDATE
  else if(path == "/led1"){
    led1 = data.to<bool>();
    Serial.println(led1 ? "  LED1: ON" : "  LED1: OFF");
  }
  else if(path == "/led2"){
    led2 = data.to<bool>();
    Serial.println(led2 ? "  LED2: ON" : "  LED2: OFF");
  }
  else if(path == "/led3"){
    led3 = data.to<bool>();
    Serial.println(led3 ? "  LED3: ON" : "  LED3: OFF");
  }
  else if(path == "/kill"){
    killSwitch = data.to<bool>();
    Serial.println(killSwitch ? "  KILL: ON" : "  KILL: OFF");
  }
  else if(path == "/mode"){
    mode = data.to<String>();
    Serial.print("  MODE: ");
    Serial.println(mode);
  }
}

void streamTimeoutCallback(bool timeout){
  if(timeout){
    Serial.println("[STREAM] ⚠ Timeout - will reconnect");
  }
}

// ============================================================
// WIFI CONNECT
// ============================================================

void connectWiFi(){

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("\n[WIFI] Connecting");

  int attempts = 0;
  while(WiFi.status() != WL_CONNECTED && attempts < 40){
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if(WiFi.status() == WL_CONNECTED){
    Serial.println(" ✓");
    Serial.print("[WIFI] IP: ");
    Serial.println(WiFi.localIP());
  }else{
    Serial.println(" ✗ FAILED!");
  }
}

// ============================================================
// FIREBASE INIT WITH DATABASE SECRET
// ============================================================

void initFirebase(){

  Serial.println("\n[FIREBASE] Initializing with secret...");

  // Set database URL
  config.database_url = DATABASE_URL;
  
  // Use legacy token (database secret)
  config.signer.tokens.legacy_token = DATABASE_SECRET;

  // Initialize
  Firebase.begin(&config, &auth);
  Firebase.reconnectNetwork(true);

  delay(1000);

  Serial.println("[FIREBASE] ✓ Ready (Authenticated)");
}

// ============================================================
// START STREAM
// ============================================================

void startStream(){

  Serial.println("\n[STREAM] Starting...");
  
  if(!Firebase.RTDB.beginStream(&fbStream, "/smartHomeState")){
    Serial.println("[STREAM] ✗ FAILED");
    Serial.print("[ERROR] ");
    Serial.println(fbStream.errorReason());
    return;
  }
  
  Serial.println("[STREAM] ✓ Connected");
  
  // Set callbacks
  Firebase.RTDB.setStreamCallback(&fbStream, streamCallback, streamTimeoutCallback);
}

// ============================================================
// HARDWARE ENGINE
// ============================================================

void hardwareEngine(){

  // Kill switch overrides everything
  if(killSwitch){
    digitalWrite(LED1, LOW);
    digitalWrite(LED2, LOW);
    digitalWrite(LED3, LOW);
    return;
  }

  // Normal mode
  if(mode == "normal"){
    digitalWrite(LED1, led1);
    digitalWrite(LED2, led2);
    digitalWrite(LED3, led3);
    return;
  }

  // Animation modes
  if(millis() - lastAnim < 200) return;
  lastAnim = millis();

  if(mode == "wave"){
    digitalWrite(LED1, waveStep==0);
    digitalWrite(LED2, waveStep==1);
    digitalWrite(LED3, waveStep==2);
    waveStep = (waveStep + 1) % 3;
  }

  else if(mode == "pulse"){
    pulse = !pulse;
    digitalWrite(LED1, pulse);
    digitalWrite(LED2, pulse);
    digitalWrite(LED3, pulse);
  }

  else if(mode == "disco"){
    digitalWrite(LED1, random(0,2));
    digitalWrite(LED2, random(0,2));
    digitalWrite(LED3, random(0,2));
  }
}

// ============================================================
// SETUP
// ============================================================

void setup(){

  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n═══════════════════════════════");
  Serial.println("  ESP32 Smart Home v1.0");
  Serial.println("  (Database Secret Auth)");
  Serial.println("═══════════════════════════════\n");

  // Setup pins
  pinMode(LED1, OUTPUT);
  pinMode(LED2, OUTPUT);
  pinMode(LED3, OUTPUT);
  
  digitalWrite(LED1, LOW);
  digitalWrite(LED2, LOW);
  digitalWrite(LED3, LOW);

  // Connect
  connectWiFi();
  
  if(WiFi.status() == WL_CONNECTED){
    initFirebase();
    delay(1000);
    startStream();
  }else{
    Serial.println("\n✗ Cannot start without WiFi!");
  }
  
  Serial.println("\n═══════════════════════════════");
  Serial.println("    System Ready");
  Serial.println("═══════════════════════════════\n");
}

// ============================================================
// LOOP
// ============================================================

void loop(){
  hardwareEngine();
  delay(10);
}
