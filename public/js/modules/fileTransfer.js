import * as store from '../store.js';
import { updateFileMessage, renderActiveConversation, renderContactList } from './ui.js';
import { saveFileToDB } from './indexeddb.js';
import { formatBytes, getTimestamp } from './utils.js';

export const CHUNK_SIZE = 64 * 1024;

export function sendNextChunk(messageId) {
    const sender = store.sendingFiles[messageId];
    if (!sender || sender.paused || sender.cancelled || !sender.receiverReady) return;
    if (sender.offset >= sender.fileSize) return;

    const chunk = sender.file.slice(sender.offset, sender.offset + CHUNK_SIZE);
    const reader = new FileReader();
    reader.onload = (e) => {
        window.socket.emit('file-chunk', {
            targetIP: sender.targetIP,
            chunk: e.target.result,
            name: sender.fileName,
            offset: sender.offset,
            messageId
        });
        const percent = Math.min(100, Math.floor((sender.offset / sender.fileSize) * 100));
        const elapsed = (Date.now() - sender.startTime) / 1000;
        const speed = sender.offset / elapsed;
        updateFileMessage(sender.targetIP, messageId, { percent, speed });
        console.log('📦 chunk sent', sender.offset, 'for', messageId);
    };
    reader.readAsArrayBuffer(chunk);
}

export function handleFileStart(socket, name, size, fromIP, messageId) {
    if (!store.conversations[fromIP]) store.conversations[fromIP] = { messages: [], unread: 0, peerName: store.peersList.find(p => p.ip === fromIP)?.name || 'Unknown' };
    store.receivingFiles[messageId] = {
        senderIP: fromIP,
        fileName: name,
        totalSize: size,
        receivedSize: 0,
        chunks: [],
        cancelled: false
    };
    store.conversations[fromIP].messages.push({
        id: messageId,
        type: 'file',
        name: name,
        size: size,
        isOwn: false,
        delivered: true,
        seen: false,
        timestamp: getTimestamp(),
        percent: 0,
        deleted: false,
        senderName: store.conversations[fromIP].peerName
    });
    store.saveConversations();
    if (store.activePeerIP === fromIP) {
        renderActiveConversation();
    } else {
        store.conversations[fromIP].unread++;
        renderContactList(store.peersList);
    }
    socket.emit('file-ready', { targetIP: fromIP, name, messageId });
}

export function handleFileChunk(socket, chunk, name, offset, messageId) {
    const receiver = store.receivingFiles[messageId];
    if (!receiver || receiver.cancelled) return;
    receiver.chunks.push(chunk);
    receiver.receivedSize += chunk.byteLength;
    const percent = Math.min(100, Math.floor((receiver.receivedSize / receiver.totalSize) * 100));
    updateFileMessage(receiver.senderIP, messageId, { percent });
    socket.emit('file-chunk-ack', { targetIP: receiver.senderIP, name, offset, messageId });
}

export async function handleFileEnd(socket, name, messageId) {
    const receiver = store.receivingFiles[messageId];
    if (!receiver || receiver.cancelled) return;
    const blob = new Blob(receiver.chunks);
    const url = URL.createObjectURL(blob);
    const saved = await saveFileToDB(messageId, blob, receiver.fileName, receiver.totalSize, receiver.senderIP);
    if (!saved) console.warn('⚠️ File could not be saved to IndexedDB');
    const conv = store.conversations[receiver.senderIP];
    if (conv) {
        const msg = conv.messages.find(m => m.id === messageId);
        if (msg) {
            msg.url = url;
            msg.percent = 100;
            delete msg.needsRestore;
            store.saveConversations();
        }
    }
    if (store.activePeerIP === receiver.senderIP) renderActiveConversation();
    delete store.receivingFiles[messageId];
    renderContactList(store.peersList);
    console.log('✅ file-end processed', messageId);
}

export function pauseFile(messageId) {
    const sender = store.sendingFiles[messageId];
    if (sender && !sender.cancelled) {
        sender.paused = true;
        window.socket.emit('file-pause', { targetIP: sender.targetIP, name: sender.fileName, messageId });
        updateFileMessage(sender.targetIP, messageId, {});
    }
}

export function resumeFile(messageId) {
    const sender = store.sendingFiles[messageId];
    if (sender && !sender.cancelled) {
        sender.paused = false;
        window.socket.emit('file-resume', { targetIP: sender.targetIP, name: sender.fileName, messageId });
        updateFileMessage(sender.targetIP, messageId, {});
        sendNextChunk(messageId);
    }
}

export function cancelFile(messageId) {
    const sender = store.sendingFiles[messageId];
    if (sender && !sender.cancelled) {
        sender.cancelled = true;
        window.socket.emit('file-cancel', { targetIP: sender.targetIP, name: sender.fileName, messageId });
        delete store.sendingFiles[messageId];
        updateFileMessage(sender.targetIP, messageId, { percent: 0, speed: 'Cancelled' });
        renderContactList(store.peersList);
    }
}

export function updateFileProgress(messageId, percent, speed) {
    for (let ip in store.conversations) {
        const msg = store.conversations[ip].messages.find(m => m.id === messageId);
        if (msg) {
            msg.percent = percent;
            if (speed !== undefined) msg.speed = speed;
            if (store.activePeerIP === ip) {
                const progressDiv = document.getElementById(`progress-${messageId}`);
                if (progressDiv) {
                    const progress = progressDiv.querySelector('progress');
                    if (progress) progress.value = percent;
                    const speedSpan = progressDiv.querySelector('.file-speed');
                    if (speedSpan) speedSpan.textContent = percent + '%' + (speed ? ' ' + formatBytes(speed) + '/s' : '');
                }
            }
            break;
        }
    }
}