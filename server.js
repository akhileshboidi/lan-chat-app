const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const os = require("os");
const portfinder = require("portfinder");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    maxHttpBufferSize: 1e8 // 100MB safety
});

app.use(express.static("public"));

// Helper to get server's LAN IP
function getServerLANIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

// Endpoint to get client's own IP
app.get("/myip", (req, res) => {
    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    let cleanIp = clientIp;
    if (clientIp.startsWith("::ffff:")) {
        cleanIp = clientIp.substring(7);
    }
    const interfaces = os.networkInterfaces();
    const serverIPs = [];
    for (const name in interfaces) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4') {
                serverIPs.push(net.address);
            }
        }
    }
    serverIPs.push('127.0.0.1', '::1');
    if (serverIPs.includes(cleanIp)) {
        const lanIP = getServerLANIP();
        return res.json({ ip: lanIP });
    }
    res.json({ ip: cleanIp });
});

let peers = {}; // socket.id -> { name, ip }
const MAX_PEERS = 50;

// File transfer concurrency control
let activeFileTransfers = 0;
const MAX_CONCURRENT_FILE_TRANSFERS = 3;
let pendingFileStarts = []; // each item: { socket, targetIP, name, size, messageId }

io.on("connection", (socket) => {
    console.log("Peer connected:", socket.id);

    socket.on("register", ({ name, ip }) => {
        // Check if maximum number of peers is already reached
        if (Object.keys(peers).length >= MAX_PEERS) {
            socket.emit("registration-failed", { reason: "Maximum number of users reached (50). Try again later." });
            return;
        }
        peers[socket.id] = { name, ip };
        io.emit("peer-list", Object.values(peers));
    });

    // ---------- CHAT MESSAGES ----------
    socket.on("p2p-message", ({ targetIP, message, messageId, replyTo }) => {
            console.log(`Server received p2p-message from ${peers[socket.id]?.ip} to ${targetIP}, replyTo:`, replyTo);
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("p2p-message", {
                message,
                from: peers[socket.id].name,
                fromIP: peers[socket.id].ip,
                messageId,
                replyTo
            });
        }
    });

    // Delivery acknowledgment
    socket.on("message-delivered", ({ targetIP, messageId }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("message-delivered", { messageId });
        }
    });

    // Message seen
    socket.on("message-seen", ({ targetIP, messageIds }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("message-seen", { messageIds });
        }
    });

    // Delete message for everyone
    socket.on("delete-message", ({ targetIP, messageId }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        const senderSocket = socket.id;
        if (targetSocket) {
            io.to(targetSocket).emit("delete-message", { messageId });
        }
        io.to(senderSocket).emit("delete-message", { messageId });
    });

    // ---------- FILE TRANSFER WITH CONCURRENCY LIMIT ----------
    socket.on("file-start", ({ targetIP, name, size, messageId }) => {
        // If we are already at the limit, queue this request
        if (activeFileTransfers >= MAX_CONCURRENT_FILE_TRANSFERS) {
            pendingFileStarts.push({ socket, targetIP, name, size, messageId });
            // Optionally notify sender that it's queued
            socket.emit("file-queued", { messageId });
            return;
        }

        // Otherwise forward immediately
        forwardFileStart(socket, targetIP, name, size, messageId);
    });

    function forwardFileStart(socket, targetIP, name, size, messageId) {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            activeFileTransfers++;
            io.to(targetSocket).emit("file-start", {
                name,
                size,
                from: peers[socket.id].name,
                fromIP: peers[socket.id].ip,
                messageId
            });
        } else {
            // Target not found – do not start transfer
            socket.emit("file-cancel", { messageId, reason: "Target not online" });
        }
    }

    socket.on("file-ready", ({ targetIP, name, messageId }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("file-ready", { name, messageId });
        }
    });

    socket.on("file-chunk", ({ targetIP, chunk, name, offset, messageId }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("file-chunk", { chunk, name, offset, messageId });
        }
    });

    socket.on("file-chunk-ack", ({ targetIP, name, offset, messageId }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("file-chunk-ack", { name, offset, messageId });
        }
    });

    socket.on("file-end", ({ targetIP, name, messageId }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("file-end", { name, messageId });
        }
        // Decrement active transfer count and process next pending
        activeFileTransfers--;
        processNextPendingFile();
    });

    socket.on("file-cancel", ({ targetIP, name, messageId }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("file-cancel", { name, messageId });
        }
        // Decrement active transfer count and process next pending
        activeFileTransfers--;
        processNextPendingFile();
    });

    socket.on("file-pause", ({ targetIP, name, messageId }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("file-pause", { name, messageId });
        }
    });

    socket.on("file-resume", ({ targetIP, name, messageId }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("file-resume", { name, messageId });
        }
    });

    socket.on("resume-file", ({ targetIP, messageId, offset }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("resume-file", { messageId, offset });
        }
    });

    socket.on("disconnect", () => {
        // Clean up any pending file-starts for this socket
        pendingFileStarts = pendingFileStarts.filter(p => p.socket.id !== socket.id);
        if (peers[socket.id]) {
            const disconnectedIP = peers[socket.id].ip;
            io.emit("peer-disconnected", disconnectedIP);
        }
        delete peers[socket.id];
        io.emit("peer-list", Object.values(peers));
    });
});

function processNextPendingFile() {
    if (pendingFileStarts.length === 0) return;
    if (activeFileTransfers >= MAX_CONCURRENT_FILE_TRANSFERS) return;

    const next = pendingFileStarts.shift();
    forwardFileStart(next.socket, next.targetIP, next.name, next.size, next.messageId);
}

// Helper to get local IP
function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

// Start server with fallback port
const DEFAULT_PORT = 5000;
portfinder.getPort({ port: DEFAULT_PORT }, (err, port) => {
    if (err) {
        console.error("Could not find a free port:", err);
        process.exit(1);
    }
    server.listen(port, "0.0.0.0", () => {
        const localIP = getLocalIP();
        console.log("=================================");
        console.log(`Server is running!`);
        console.log(`- Local access: http://localhost:${port}`);
        console.log(`- LAN access:   http://${localIP}:${port}`);
        console.log(`- MyIP endpoint: http://${localIP}:${port}/myip`);
        console.log("=================================");
    });
    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.error(`Port ${port} is already in use. Try a different port.`);
        } else {
            console.error("Server error:", err);
        }
        process.exit(1);
    });
});