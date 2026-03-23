import * as store from './store.js';
import { showToast } from './modules/notifications.js';
import { playNotificationSound, playSeenSound, setSoundMuted, isSoundMuted } from './modules/sounds.js';
import { initTheme } from './modules/theme.js';
import { confirmModal, promptModal } from './modules/modal.js';
import { renderBlockedPanel, updateBlockButtonText } from './modules/blocklist.js';
import { performSearch } from './modules/search.js';
import { addSystemMessageToConversation, formatBytes, generateMessageId, getTimestamp } from './modules/utils.js';
import { restoreFilesFromDB, deleteFileFromDB } from './modules/indexeddb.js';
import { sendNextChunk, CHUNK_SIZE, handleFileStart, handleFileChunk, handleFileEnd, pauseFile, resumeFile, cancelFile } from './modules/fileTransfer.js';
import { renderContactList, renderActiveConversation, updateFileMessage, markMessagesAsSeen, selectContact } from './modules/ui.js';
import { initContextMenu } from './modules/contextMenu.js';
import { initChatHeaderMenu } from './modules/chatHeaderMenu.js';

// Make socket globally available for modules that need it
const socket = io();
window.socket = socket;

// Get user data
const myName = localStorage.getItem('myName');
const myIP = localStorage.getItem('myIP');
if (!myName || !myIP) {
    window.location.href = 'index.html';
}
document.getElementById('myInfo').innerText = `${myName} (${myIP})`;

// Load stored data
store.loadConversations();
store.loadBlockedIPs();

// UI update callback
store.setOnStateChange(() => {
    renderContactList(store.peersList);
    if (store.activePeerIP) renderActiveConversation();
});

// Register with server (initial)
socket.emit('register', { name: myName, ip: myIP });

// ---------- NETWORK VALIDATION (must be on hostel WiFi: 192.168.x.x) ----------
let networkWarningToast = null;
let isCheckingNetwork = false;

function removeNetworkWarningToast() {
    if (networkWarningToast) {
        networkWarningToast.remove();
        networkWarningToast = null;
    }
}

function showNetworkWarningToast() {
    if (networkWarningToast) return;
    const toastDiv = document.createElement('div');
    toastDiv.className = 'toast toast-warning persistent';
    toastDiv.innerHTML = `⚠️ Please connect to the hostel WiFi (192.168.x.x) to use this app.<br><button class="toast-btn" style="background: none; border: 1px solid white; border-radius: 4px; padding: 4px 8px; margin-top: 5px; cursor: pointer;">Refresh</button>`;
    document.body.appendChild(toastDiv);
    setTimeout(() => toastDiv.classList.add('show'), 10);
    const btn = toastDiv.querySelector('.toast-btn');
    btn.addEventListener('click', () => {
        window.location.reload();
    });
    networkWarningToast = toastDiv;
}

async function checkNetworkAndProceed() {
    if (isCheckingNetwork) return;
    isCheckingNetwork = true;
    try {
        const response = await fetch('/myip');
        if (!response.ok) throw new Error('Server not reachable');
        const data = await response.json();
        const clientIP = data.ip;
        // Allow localhost for development, otherwise require 192.168.x.x
        const isHostelIP = /^192\.168\./.test(clientIP) || clientIP === 'localhost' || clientIP === '127.0.0.1';
        if (!isHostelIP) {
            showNetworkWarningToast();
            return false;
        }
        removeNetworkWarningToast();
        // If socket disconnected, reconnect
        if (socket.disconnected) {
            socket.connect();
        } else {
            // Already connected; ensure we are registered
            socket.emit('register', { name: myName, ip: myIP });
        }
        return true;
    } catch (err) {
        console.error('Network check failed', err);
        showNetworkWarningToast();
        return false;
    } finally {
        isCheckingNetwork = false;
    }
}

// ---------- PERSISTENT CONNECTION TOASTS ----------
let disconnectToast = null;
let offlineToast = null;

function removeDisconnectToast() {
    if (disconnectToast) {
        disconnectToast.remove();
        disconnectToast = null;
    }
}

function removeOfflineToast() {
    if (offlineToast) {
        offlineToast.remove();
        offlineToast = null;
    }
}

function showPersistentToast(type, message, buttonText, buttonAction) {
    if (type === 'disconnect') {
        if (disconnectToast) return;
        removeOfflineToast();
        const toastDiv = document.createElement('div');
        toastDiv.className = 'toast toast-warning persistent';
        toastDiv.innerHTML = `${message}<br><button class="toast-btn" style="background: none; border: 1px solid white; border-radius: 4px; padding: 4px 8px; margin-top: 5px; cursor: pointer;">${buttonText}</button>`;
        document.body.appendChild(toastDiv);
        setTimeout(() => toastDiv.classList.add('show'), 10);
        const btn = toastDiv.querySelector('.toast-btn');
        btn.addEventListener('click', () => {
            buttonAction();
            toastDiv.remove();
            disconnectToast = null;
        });
        disconnectToast = toastDiv;
    } else if (type === 'offline') {
        if (offlineToast) return;
        removeDisconnectToast();
        const toastDiv = document.createElement('div');
        toastDiv.className = 'toast toast-warning persistent';
        toastDiv.innerHTML = `${message}<br><button class="toast-btn" style="background: none; border: 1px solid white; border-radius: 4px; padding: 4px 8px; margin-top: 5px; cursor: pointer;">${buttonText}</button>`;
        document.body.appendChild(toastDiv);
        setTimeout(() => toastDiv.classList.add('show'), 10);
        const btn = toastDiv.querySelector('.toast-btn');
        btn.addEventListener('click', () => {
            buttonAction();
            toastDiv.remove();
            offlineToast = null;
        });
        offlineToast = toastDiv;
    }
}

// ---------- SOCKET HANDLERS ----------

// Override the default connect handler
socket.on('connect', () => {
    console.log('Socket connected – checking network');
    checkNetworkAndProceed();
});

socket.on('disconnect', () => {
    const serverIP = window.location.hostname;
    showPersistentToast('disconnect', `⚠️ Server disconnected. Server IP: ${serverIP}`, 'Refresh', () => {
        window.location.reload();
    });
});

socket.on('peer-list', (peers) => {
    const filteredPeers = peers.filter(p => p.ip !== myIP);
    const newOnlineIPs = new Set(filteredPeers.map(p => p.ip));

    for (let ip of newOnlineIPs) {
        if (!store.onlineIPs.has(ip)) {
            const peer = filteredPeers.find(p => p.ip === ip);
            if (peer && !store.blockedIPs.has(ip)) {
                addSystemMessageToConversation(ip, `<span class="status-dot online"></span> ${peer.name} is now online`, 'online');
                if (store.conversations[ip]) store.conversations[ip].peerName = peer.name;
            }
            if (store.activePeerIP === ip && !store.blockedIPs.has(ip)) {
                document.getElementById('contact-status').innerHTML = `<span class="status-dot online"></span> Online`;
            }
        }
    }
    for (let ip of store.onlineIPs) {
        if (!newOnlineIPs.has(ip)) {
            const peerName = store.conversations[ip]?.peerName || ip;
            addSystemMessageToConversation(ip, `<span class="status-dot offline"></span> ${peerName} went offline`, 'offline');
            if (store.activePeerIP === ip) {
                document.getElementById('contact-status').innerHTML = `<span class="status-dot offline"></span> Offline`;
            }
        }
    }
    store.onlineIPs.clear();
    newOnlineIPs.forEach(ip => store.onlineIPs.add(ip));
    store.peersList.length = 0;
    store.peersList.push(...filteredPeers);
    renderContactList(store.peersList);
});

// ---------- NETWORK STATUS MONITORING ----------
window.addEventListener('online', () => {
    console.log('Network is back online');
    removeOfflineToast();
    checkNetworkAndProceed();
});

window.addEventListener('offline', () => {
    removeNetworkWarningToast();
    showPersistentToast('offline', '⚠️ Network disconnected. Please check your connection.', 'Refresh', () => {
        window.location.reload();
    });
});

// ---------- THE REST OF YOUR CODE (unchanged) ----------
// The remaining code (socket handlers for messages, file transfers, UI events, etc.) stays exactly as before.
// I'll include it for completeness, but you should keep your existing code below this point.

socket.on('p2p-message', ({ message, from, fromIP, messageId, replyTo }) => {
    if (store.blockedIPs.has(fromIP)) return;
    if (!store.conversations[fromIP]) store.conversations[fromIP] = { messages: [], unread: 0, peerName: from };
    store.conversations[fromIP].messages.push({
        id: messageId,
        type: 'text',
        content: message,
        isOwn: false,
        delivered: true,
        seen: false,
        timestamp: getTimestamp(),
        replyTo,
        senderName: from,
        deleted: false
    });
    store.saveConversations();
    socket.emit('message-delivered', { targetIP: fromIP, messageId });

    if (store.activePeerIP !== fromIP) {
        playNotificationSound();
    }

    if (store.activePeerIP === fromIP) {
        renderActiveConversation();
        markMessagesAsSeen(fromIP);
    } else {
        store.conversations[fromIP].unread++;
        renderContactList(store.peersList);
    }
});

socket.on('message-delivered', ({ messageId }) => {
    const pending = store.pendingDelivery.get(messageId);
    if (pending) {
        const conv = store.conversations[pending.targetIP];
        if (conv) {
            const msg = conv.messages.find(m => m.id === messageId);
            if (msg) {
                msg.delivered = true;
                store.saveConversations();
                if (store.activePeerIP === pending.targetIP) renderActiveConversation();
            }
        }
        store.pendingDelivery.delete(messageId);
    }
});

socket.on('message-seen', ({ messageIds }) => {
    messageIds.forEach(messageId => {
        for (let ip in store.conversations) {
            const msg = store.conversations[ip].messages.find(m => m.id === messageId);
            if (msg && msg.isOwn) {
                msg.seen = true;
                store.saveConversations();
                if (store.activePeerIP === ip) renderActiveConversation();
                break;
            }
        }
    });
});

socket.on('delete-message', ({ messageId }) => {
    for (let ip in store.conversations) {
        const msg = store.conversations[ip].messages.find(m => m.id === messageId);
        if (msg) {
            msg.deleted = true;
            delete msg.deletedBy;
            store.saveConversations();
            if (store.activePeerIP === ip) renderActiveConversation();
            break;
        }
    }
});

// ---------- FILE TRANSFER (RECEIVER) ----------
socket.on('file-start', ({ name, size, from, fromIP, messageId }) => {
    if (store.blockedIPs.has(fromIP)) return;
    handleFileStart(socket, name, size, fromIP, messageId);
});

socket.on('file-chunk', ({ chunk, name, offset, messageId }) => {
    handleFileChunk(socket, chunk, name, offset, messageId);
});

socket.on('file-end', async ({ name, messageId }) => {
    await handleFileEnd(socket, name, messageId);
});

socket.on('file-cancel', ({ name, messageId }) => {
    if (store.sendingFiles[messageId]) {
        cancelFile(messageId);
    }
    if (store.receivingFiles[messageId]) {
        delete store.receivingFiles[messageId];
    }
});

socket.on('file-pause', ({ name, messageId }) => {
    if (store.sendingFiles[messageId]) {
        pauseFile(messageId);
    }
});

socket.on('file-resume', ({ name, messageId }) => {
    if (store.sendingFiles[messageId]) {
        resumeFile(messageId);
    }
});

socket.on('resume-file', ({ messageId, offset }) => {
    const sender = store.sendingFiles[messageId];
    if (sender && !sender.cancelled && sender.offset < sender.fileSize) {
        sender.offset = offset;
        sender.receiverReady = true;
        sender.startTime = Date.now();
        sendNextChunk(messageId);
        console.log(`Resumed sending file ${messageId} from offset ${offset}`);
    }
});

// ---------- FILE CHUNK ACK (SENDER) ----------
socket.on('file-chunk-ack', ({ name, offset: ackedOffset, messageId }) => {
    handleFileChunkAck(messageId, ackedOffset);
});

// ---------- UI EVENT HANDLERS ----------
document.getElementById('sendMsgBtn').addEventListener('click', sendMessage);
document.getElementById('msg').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

let replyToMessage = null;

function sendMessage() {
    if (!store.activePeerIP) {
        showToast('Select a contact first', 'warning');
        return;
    }
    if (!store.onlineIPs.has(store.activePeerIP)) {
        showToast('The recipient is offline. Please wait until they come online to send messages.', 'warning');
        return;
    }
    const input = document.getElementById('msg');
    const text = input.value.trim();
    if (!text) return;

    const messageId = generateMessageId();
    const messageData = { targetIP: store.activePeerIP, message: text, messageId };
    if (replyToMessage) {
        messageData.replyTo = {
            id: replyToMessage.id,
            content: replyToMessage.content,
            sender: replyToMessage.sender
        };
        replyToMessage = null;
        document.getElementById('reply-preview').style.display = 'none';
    }
    socket.emit('p2p-message', messageData);

    if (!store.conversations[store.activePeerIP]) {
        store.conversations[store.activePeerIP] = { messages: [], unread: 0, peerName: document.getElementById('active-contact-name').innerText };
    }
    store.conversations[store.activePeerIP].messages.push({
        id: messageId,
        type: 'text',
        content: text,
        isOwn: true,
        delivered: false,
        seen: false,
        timestamp: getTimestamp(),
        replyTo: messageData.replyTo,
        deleted: false,
        senderName: 'You'
    });
    store.saveConversations();

    store.pendingDelivery.set(messageId, { targetIP: store.activePeerIP, timestamp: Date.now() });

    renderActiveConversation();
    input.value = '';
}

// ---------- EMOJI PICKER ----------
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const emojis = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','💀','👻','👽','🤖','💩','😺','😸','😹','😻','😼','😽','🙀','😿','😾'];

emojis.forEach(emoji => {
    const span = document.createElement('span');
    span.textContent = emoji;
    span.addEventListener('click', () => {
        document.getElementById('msg').value += emoji;
        emojiPicker.style.display = 'none';
    });
    emojiPicker.appendChild(span);
});

emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'grid' : 'none';
});

document.addEventListener('click', (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) emojiPicker.style.display = 'none';
});

// ---------- FILE TRANSFER (SENDER) ----------
let selectedFiles = [];

document.getElementById('attach-btn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (e) => {
    selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
        document.getElementById('sendFileBtn').disabled = false;
        addSystemMessageToConversation(store.activePeerIP, `Selected ${selectedFiles.length} file(s)`);
    }
});

document.getElementById('sendFileBtn').addEventListener('click', () => {
    if (!store.activePeerIP) {
        showToast('Select a contact first', 'warning');
        return;
    }
    if (!store.onlineIPs.has(store.activePeerIP)) {
        showToast('The recipient is offline. Please wait until they come online to send files.', 'warning');
        return;
    }
    if (selectedFiles.length === 0) return;

    const targetIP = store.activePeerIP;
    selectedFiles.forEach(file => {
        const messageId = generateMessageId();
        if (!store.conversations[targetIP]) {
            store.conversations[targetIP] = { messages: [], unread: 0, peerName: document.getElementById('active-contact-name').innerText };
        }
        store.conversations[targetIP].messages.push({
            id: messageId,
            type: 'file',
            name: file.name,
            size: file.size,
            isOwn: true,
            delivered: false,
            seen: false,
            timestamp: getTimestamp(),
            percent: 0,
            deleted: false,
            senderName: 'You'
        });
        store.saveConversations();

        store.sendingFiles[messageId] = {
            targetIP,
            file,
            fileName: file.name,
            fileSize: file.size,
            offset: 0,
            paused: false,
            cancelled: false,
            startTime: null,
            receiverReady: false,
            messageId
        };

        socket.emit('file-start', { targetIP, name: file.name, size: file.size, messageId });
        console.log('📤 file-start sent', messageId);
    });

    renderActiveConversation();
    selectedFiles = [];
    document.getElementById('fileInput').value = '';
    document.getElementById('sendFileBtn').disabled = true;
});

socket.on('file-ready', ({ name, messageId }) => {
    const sender = store.sendingFiles[messageId];
    if (!sender || sender.cancelled) return;
    sender.receiverReady = true;
    sender.startTime = Date.now();
    sendNextChunk(messageId);
});

// ---------- MUTE BUTTON ----------
const muteToggle = document.getElementById('mute-toggle');
function updateMuteButton() {
    muteToggle.textContent = isSoundMuted() ? '🔇' : '🔊';
}
muteToggle.addEventListener('click', () => {
    setSoundMuted(!isSoundMuted());
    updateMuteButton();
    showToast(`Sound ${isSoundMuted() ? 'muted' : 'unmuted'}`, 'info');
});
updateMuteButton();

// ---------- BLOCK MANAGEMENT PANEL ----------
const blockedListBtn = document.getElementById('blocked-list-btn');
const blockedPanel = document.getElementById('blocked-panel');
const closeBlockedBtn = document.getElementById('close-blocked-panel');
if (blockedListBtn) {
    blockedListBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renderBlockedPanel();
        blockedPanel.style.display = 'block';
    });
}
if (closeBlockedBtn) {
    closeBlockedBtn.addEventListener('click', () => {
        blockedPanel.style.display = 'none';
    });
}
document.addEventListener('click', (e) => {
    if (blockedPanel && !blockedPanel.contains(e.target) && e.target !== blockedListBtn) {
        blockedPanel.style.display = 'none';
    }
});

// ---------- SEARCH ----------
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
let searchTimeout;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(searchInput.value), 300);
});
document.addEventListener('click', (e) => {
    if (!searchResults.contains(e.target) && e.target !== searchInput) {
        searchResults.style.display = 'none';
    }
});
searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) performSearch(searchInput.value);
});

// ---------- THEME ----------
initTheme();

// ---------- EVENT DELEGATION FOR MESSAGE MENU ----------
document.getElementById('chat-box').addEventListener('click', async (e) => {
    const btn = e.target.closest('.msg-menu-btn');
    if (btn) {
        const { handleMessageMenuClick } = await import('./modules/contextMenu.js');
        handleMessageMenuClick(btn, e);
    }
});

// ---------- CONTEXT MENU & CHAT HEADER MENU ----------
initContextMenu(socket, store, renderActiveConversation, renderContactList, addSystemMessageToConversation, confirmModal, promptModal, playSeenSound, updateBlockButtonText);
initChatHeaderMenu(socket, store, renderActiveConversation, renderContactList, renderBlockedPanel, confirmModal, promptModal, deleteFileFromDB);

// ---------- RESTORE FILES ----------
setTimeout(() => restoreFilesFromDB(), 100);