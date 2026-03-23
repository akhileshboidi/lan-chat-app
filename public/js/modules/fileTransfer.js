// public/js/modules/fileTransfer.js
import * as store from '../store.js';
import { updateFileMessage, renderActiveConversation, renderContactList } from './ui.js';
import { saveFileToDB } from './indexeddb.js';
import { formatBytes, getTimestamp } from './utils.js';

export const CHUNK_SIZE = 64 * 1024; // 64KB
const MIN_DELAY = 15; // milliseconds between chunks (adjust based on network)
const MAX_RETRIES = 3;
const RETRY_DELAY = 200; // initial retry delay in ms

export function sendNextChunk(messageId) {
    const sender = store.sendingFiles[messageId];
    if (!sender || sender.paused || sender.cancelled || !sender.receiverReady) return;
    if (sender.offset >= sender.fileSize) return;

    // If we are currently waiting for a retry timeout, don't send yet
    if (sender.retryTimeoutId) return;

    const chunk = sender.file.slice(sender.offset, sender.offset + CHUNK_SIZE);
    const reader = new FileReader();
    reader.onload = (e) => {
        // Send chunk
        window.socket.emit('file-chunk', {
            targetIP: sender.targetIP,
            chunk: e.target.result,
            name: sender.fileName,
            offset: sender.offset,
            messageId
        });
        // Record that we sent this chunk (for retry)
        sender.lastSentOffset = sender.offset;
        sender.lastSentTime = Date.now();
        // Start a retry timer – if we don't receive ACK within a timeout, resend
        if (sender.retryTimer) clearTimeout(sender.retryTimer);
        sender.retryTimer = setTimeout(() => {
            if (!sender.cancelled && !sender.paused && sender.receiverReady && sender.offset === sender.lastSentOffset) {
                console.log(`Retrying chunk at offset ${sender.offset} for ${messageId}`);
                sendNextChunk(messageId); // resend
            }
        }, RETRY_DELAY);
        // Update progress optimistically (sender side)
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
        cancelled: false,
        retryCount: 0
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
    // Check if this chunk is the expected one (could be duplicate due to retry)
    if (offset === receiver.receivedSize) {
        receiver.chunks.push(chunk);
        receiver.receivedSize += chunk.byteLength;
        const percent = Math.min(100, Math.floor((receiver.receivedSize / receiver.totalSize) * 100));
        updateFileMessage(receiver.senderIP, messageId, { percent });
    } else {
        // Possibly out of order or duplicate; ignore.
        console.log(`Ignoring chunk at offset ${offset}, expected ${receiver.receivedSize}`);
    }
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
        if (sender.retryTimer) clearTimeout(sender.retryTimer);
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
        if (sender.retryTimer) clearTimeout(sender.retryTimer);
        window.socket.emit('file-cancel', { targetIP: sender.targetIP, name: sender.fileName, messageId });
        delete store.sendingFiles[messageId];
        updateFileMessage(sender.targetIP, messageId, { percent: 0, speed: 'Cancelled' });
        renderContactList(store.peersList);
    }
}

// This function is called when we receive an ACK from the receiver.
// It will update the offset, then schedule the next chunk with a delay.
export function handleFileChunkAck(messageId, ackedOffset) {
    const sender = store.sendingFiles[messageId];
    if (!sender || sender.cancelled) return;

    // Clear the retry timer for this chunk
    if (sender.retryTimer) clearTimeout(sender.retryTimer);

    if (ackedOffset === sender.offset) {
        sender.offset += CHUNK_SIZE;
        const percent = Math.min(100, Math.floor((sender.offset / sender.fileSize) * 100));
        const elapsed = (Date.now() - sender.startTime) / 1000;
        const speed = sender.offset / elapsed;
        updateFileMessage(sender.targetIP, messageId, { percent, speed });

        if (sender.offset < sender.fileSize) {
            // Wait a small delay before sending the next chunk to avoid flooding
            setTimeout(() => sendNextChunk(messageId), MIN_DELAY);
        } else {
            // File finished – mark as delivered
            updateFileMessage(sender.targetIP, messageId, { percent: 100, speed, delivered: true });
            window.socket.emit('file-end', { targetIP: sender.targetIP, name: sender.fileName, messageId });
            delete store.sendingFiles[messageId];
        }
    } else {
        // Unexpected ACK – ignore (should not happen)
        console.warn(`ACK offset mismatch: got ${ackedOffset}, expected ${sender.offset}`);
    }
}