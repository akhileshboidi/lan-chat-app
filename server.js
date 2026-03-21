// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const os = require("os");
const portfinder = require("portfinder");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    maxHttpBufferSize: 1e8
});

app.use(express.static("public"));

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

let peers = {};

io.on("connection", (socket) => {
    console.log("Peer connected:", socket.id);

    socket.on("register", ({ name, ip }) => {
        peers[socket.id] = { name, ip };
        io.emit("peer-list", Object.values(peers));
    });

    socket.on("p2p-message", ({ targetIP, message, messageId, replyTo }) => {
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

    socket.on("message-delivered", ({ targetIP, messageId }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("message-delivered", { messageId });
        }
    });

    socket.on("message-seen", ({ targetIP, messageIds }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("message-seen", { messageIds });
        }
    });

// Delete message for everyone (broadcast to both sender and receiver)
socket.on("delete-message", ({ targetIP, messageId }) => {
    const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
    const senderSocket = socket.id;
    const deletedByIP = peers[socket.id]?.ip; // the deleter's IP

    if (targetSocket) {
        io.to(targetSocket).emit("delete-message", { messageId, deletedBy: deletedByIP });
    }
    io.to(senderSocket).emit("delete-message", { messageId, deletedBy: deletedByIP });
});

    socket.on("file-start", ({ targetIP, name, size, messageId }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("file-start", {
                name,
                size,
                from: peers[socket.id].name,
                fromIP: peers[socket.id].ip,
                messageId
            });
        }
    });

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
    });

    socket.on("file-cancel", ({ targetIP, name, messageId }) => {
        const targetSocket = Object.keys(peers).find(id => peers[id].ip === targetIP);
        if (targetSocket) {
            io.to(targetSocket).emit("file-cancel", { name, messageId });
        }
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
        if (peers[socket.id]) {
            const disconnectedIP = peers[socket.id].ip;
            io.emit("peer-disconnected", disconnectedIP);
        }
        delete peers[socket.id];
        io.emit("peer-list", Object.values(peers));
    });
});

const DEFAULT_PORT = 5000;
portfinder.getPort({ port: DEFAULT_PORT }, (err, port) => {
    if (err) {
        console.error("Could not find a free port:", err);
        process.exit(1);
    }
    server.listen(port, "0.0.0.0", () => {
        const localIP = getServerLANIP();
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