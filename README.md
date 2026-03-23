# 🚀 LAN Chat App

A real-time **peer-to-peer LAN chat application** built using **Node.js, Express, and Socket.IO**.
Supports messaging, file sharing, and multiple users over the same WiFi network.


## 📌 Features

* 💬 Real-time messaging
* 📁 File transfer (pause/resume supported)
* 👥 Multiple users on same network
* 🔔 Notifications & sounds
* 🚫 Block users
* 🌙 Theme support
* 🔄 Auto reconnect

---

## 🛠️ Requirements

Make sure you have installed:

* Node.js (v16 or above)
* npm

Check installation:


node -v
npm -v

## ⚙️ Setup & Run

### 1️⃣ Clone the repository

git clone https://github.com/akhileshboidi/lan-chat-app.git
cd lan-chat-app

### 2️⃣ Install dependencies

npm install

### 3️⃣ Start the server

node server.js

### 4️⃣ Server Output Example

You will see something like:

Server is running!

* Local access: http://localhost:5000
* LAN access:   http://YOUR_IP:5000

---

## 🌐 How to Use

### 🧑‍💻 On your device:

👉 http://localhost:5000

---

### 📱 For friends (same WiFi):

👉 http://YOUR_IP:5000

Example:
👉 http://10.52.200.177:5000

---

## ⚠️ Important Notes

* All users must be connected to the **same WiFi / hotspot**
* Do NOT use `localhost` for other devices
* Use the **LAN IP shown in terminal**

## 📂 Project Structure
project/
├── server.js                          # Node.js server (with concurrency limits)
├── package.json                       # Node dependencies
├── public/
│   ├── index.html                     # Login page (always asks for credentials)
│   ├── app.html                       # Main chat interface
│   ├── css/
│   │   └── app.css                    # All styles (including dark mode, toasts, modals)
│   ├── js/
│   │   ├── main.js                    # Entry point (socket events, UI initialisation)
│   │   ├── store.js                   # Global state (conversations, peers, etc.)
│   │   └── modules/
│   │       ├── utils.js               # Utility functions (formatBytes, timestamps, etc.)
│   │       ├── notifications.js       # Toast notifications
│   │       ├── sounds.js              # Sound control (mute, play)
│   │       ├── modal.js               # Custom modal (confirm/prompt)
│   │       ├── theme.js               # Dark/light mode toggle
│   │       ├── blocklist.js           # Blocked contacts management
│   │       ├── search.js              # Message search
│   │       ├── indexeddb.js           # IndexedDB operations (file persistence)
│   │       ├── fileTransfer.js        # File sending/receiving (with retry & rate limiting)
│   │       ├── ui.js                  # Rendering of contact list and messages
│   │       ├── contextMenu.js         # Right‑click / three‑dots message menu
│   │       └── chatHeaderMenu.js      # Three‑dots menu in chat header (edit name, block, clear)
│   └── whatsapp-web-notification.mp3  # Notification sound (optional)
│   └── whatsapp-seen-notification.mp3 # Seen sound (optional)
└── uploads/                           # Created automatically by server for received files

## 🧪 Testing Tips

Try these scenarios:

* Multiple users chatting simultaneously
* Sending large files
* Disconnect & reconnect WiFi
* Pause/resume file transfer

## ⚡ Quick Start (One Command)

npm install && node server.js

Enjoy chatting on LAN 🎉
