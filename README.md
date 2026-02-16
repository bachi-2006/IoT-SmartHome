# ⚡ Smart Home Global Control System

Cloud-connected IoT system where a web application controls ESP32 hardware through Firebase Realtime Database. This project provides a production-ready, globally accessible platform to control appliances, view real-time status, switch modes, and trigger emergency kills from anywhere in the world.

---

## 🚀 Quick Start (5 Minutes)

### 1. Prerequisites
- **Node.js**: v14 or later.
- **Firebase Project**: Create a project in the [Firebase Console](https://console.firebase.google.com/).
- **Service Account Key**: Download `serviceAccountKey.json` from Project Settings > Service Accounts and place it in the root directory.

### 2. Setup & Installation
```bash
# Navigate to project
cd smarthome-node

# Install dependencies
npm install

# Create a .env file (optional)
# FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com/
# SERVICE_ACCOUNT=./serviceAccountKey.json
# PORT=3000

# Update Database URL in server.js (if not using .env)
# databaseURL: "https://YOUR_PROJECT_NAME-default-rtdb.firebaseio.com/"

# Start the server
npm start
```
The server will run at [http://localhost:3000](http://localhost:3000).

### 3. Access Dashboard
Open [http://localhost:3000](http://localhost:3000) to see the futuristic neon dashboard.
- **Green "ONLINE" indicator**: Confirms Socket.IO connection.
- **Toggle Switches**: Control LED1, LED2, and LED3 in real-time.
- **Mode Selector**: Choose between Normal, Wave, Pulse, and Disco.
- **Kill Switch**: Emergency stop for all devices.

---

## 🏗️ System Architecture

The system follows a "Single Source of Truth" philosophy using Firebase.

```
User Browser (Web SDK) ←→ Node.js Server (Admin SDK) ←→ Firebase Realtime DB ←→ ESP32 (IoT Device)
```

### Core Components
- **Backend (Node.js)**: Express + Socket.IO (handles timers and state synchronization).
- **Frontend (HTML/CSS/JS)**: Futuristic Iron Man-style neon theme with real-time updates.
- **Database (Firebase)**: Persistent cloud-based state management with real-time sync.
- **IoT (ESP32)**: Direct Firebase integration for low-latency physical device control.

---

## 🔥 Firebase Setup Guide

1. **Create Database**: Enable "Realtime Database" in the Firebase Console.
2. **Security Rules**: Use "Test Mode" for fast setup or restricted rules for production:
   ```json
   {
     "rules": {
       "smartHomeState": { ".read": true, ".write": true }
     }
   }
   ```
3. **Database URL**: Update `databaseURL` in `server.js` with your actual URL.
4. **Initial Structure**:
   ```json
   {
     "smartHomeState": {
       "led1": false,
       "led2": false,
       "led3": false,
       "mode": "normal",
       "kill": false,
       "timer": { "active": false, "duration": 0, "remainingTime": 0, "targetLeds": [] }
     }
   }
   ```

---

## 📱 ESP32 Integration & Fixes

### Setup Instructions
1. **Library**: Install "Firebase Arduino Client Library for ESP32" by Mobizt in Arduino IDE.
2. **Credentials**: Update `WIFI_SSID`, `WIFI_PASSWORD`, `API_KEY`, and `DATABASE_URL` in your `.ino` file.
3. **GPIO Pins**: Default mapping is LED1=GPIO2, LED2=GPIO4, LED3=GPIO5.

### Critical Performance & Sync Notes
- **Path Mismatch**: Your database uses `/smartHomeState/`. Ensure your ESP32 reads from `/smartHomeState/led1`, NOT just `/led1`.
- **Kill Flag**: If `kill` is `true`, the ESP32 will force all LEDs OFF immediately.
- **Polling Interval**: Reduce `delay(3000)` to `delay(1000)` (or use a non-blocking timer) for a real-time feel.
- **Animations**: Modes like Wave, Pulse, and Disco require the ESP32 to execute specific patterns based on the `mode` string.

---

## 📡 API & Event Reference

### Socket.IO Events
- **Client → Server**:
  - `toggleLED`: Toggle a specific LED (`"led1"`, `"led2"`, `"led3"`).
  - `startTimer`: `{ duration: seconds, targetLeds: ["led1", ...] }`.
  - `cancelTimer`: Stop any active countdown.
  - `setMode`: Select between `"normal"`, `"wave"`, `"pulse"`, `"disco"`.
  - `killAll`: Activate emergency shutdown.
- **Server → Client**:
  - `stateUpdate`: Complete current state object whenever any change occurs.

---

## 📁 Project Structure
- `server.js`: Node.js server (Express + Socket.IO + Firebase Admin).
- `public/`: Served frontend files (index.html).
- `esp32/firmware.ino`: IoT device controller sketch.
- `package.json`: NPM dependencies (express, firebase-admin, socket.io).
- `serviceAccountKey.json`: (Not included) Your private Firebase key.

---

## ✅ Implementation Status
- [x] Firebase Realtime Database integration with Node.js & ESP32.
- [x] Futuristic Neon UI with responsive dashboard.
- [x] 3-device status reporting and control.
- [x] Animation mode engine (Wave, Pulse, Disco).
- [x] Emergency Kill Switch functionality.
- [x] Auto-off Timer system with live countdown.
- [x] Multi-device synchronization across multiple browsers.

---

## 🛡️ Security & Performance
- **Latency**: Target sub-300ms synchronization across the ecosystem.
- **Security**: Current development uses Admin SDK; production should implement Firebase Auth.
- **Testing**: Open multiple browser tabs to witness instant synchronization.

---

## 📞 Support and Reference
For detailed API docs, see the code comments in `server.js`. For production architecture deep-dives, refer to the "Zero Complexity" cloud model directly syncing via Firebase.

**Built with ⚡ for global smart home control.**
