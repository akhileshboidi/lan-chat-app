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
├── server.js
├── package.json
├── public/
│   ├── index.html
│   ├── app.html
│   ├── css/
│   │   └── app.css
│   ├── js/
│   │   ├── main.js
│   │   ├── store.js
│   │   └── modules/
│   │       ├── utils.js
│   │       ├── notifications.js
│   │       ├── sounds.js
│   │       ├── modal.js
│   │       ├── theme.js
│   │       ├── blocklist.js
│   │       ├── search.js
│   │       ├── indexeddb.js
│   │       ├── fileTransfer.js
│   │       ├── ui.js
│   │       ├── contextMenu.js
│   │       └── chatHeaderMenu.js
│   └── whatsapp-web-notification.mp3
│   └── whatsapp-seen-notification.mp3
└── uploads/

## 🧪 Testing Tips

Try these scenarios:

* Multiple users chatting simultaneously
* Sending large files
* Disconnect & reconnect WiFi
* Pause/resume file transfer

## ⚡ Quick Start (One Command)

npm install && node server.js

Enjoy chatting on LAN 🎉
