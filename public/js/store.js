// public/js/store.js
// Central state and persistence

export let peersList = [];
export let onlineIPs = new Set();
export let conversations = {};
export let activePeerIP = null;
export let sendingFiles = {};
export let receivingFiles = {};
export let pendingDelivery = new Map();
export let blockedIPs = new Set();

export let onStateChange = null;

export function setOnStateChange(callback) {
    onStateChange = callback;
}

export function updateState() {
    if (onStateChange) onStateChange();
}

// Setters for read‑only exports
export function setActivePeerIP(ip) {
    activePeerIP = ip;
    updateState();
}

export function clearActivePeerIP() {
    activePeerIP = null;
    updateState();
}

export function loadConversations() {
    const saved = localStorage.getItem('conversations');
    if (saved) {
        try {
            const loaded = JSON.parse(saved);
            // Clear existing and replace
            for (let key in conversations) delete conversations[key];
            Object.assign(conversations, loaded);
            for (let ip in conversations) {
                conversations[ip].messages.forEach(msg => {
                    if (msg.type === 'file' && msg.url) {
                        delete msg.url;
                        msg.needsRestore = true;
                    }
                });
            }
        } catch (e) {
            console.error('Failed to load conversations', e);
        }
    }
}

export function saveConversations() {
    const toSave = {};
    for (let ip in conversations) {
        toSave[ip] = {
            ...conversations[ip],
            messages: conversations[ip].messages.map(msg => {
                if (msg.type === 'file' && msg.url) {
                    const { url, ...rest } = msg;
                    return { ...rest, needsRestore: true };
                }
                return msg;
            })
        };
    }
    localStorage.setItem('conversations', JSON.stringify(toSave));
}

export function loadBlockedIPs() {
    const blockedSaved = localStorage.getItem('blockedIPs');
    if (blockedSaved) {
        try {
            const arr = JSON.parse(blockedSaved);
            blockedIPs.clear();
            arr.forEach(ip => blockedIPs.add(ip));
        } catch (e) {
            console.error('Failed to load blockedIPs', e);
        }
    }
}

export function saveBlockedIPs() {
    localStorage.setItem('blockedIPs', JSON.stringify(Array.from(blockedIPs)));
}