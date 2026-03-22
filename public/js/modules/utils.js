import { conversations, saveConversations, updateState } from '../store.js';

export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function generateMessageId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

export function addSystemMessageToConversation(peerIP, msg, type = '') {
    if (!conversations[peerIP]) {
        conversations[peerIP] = { messages: [], unread: 0, peerName: 'Unknown' };
    }
    conversations[peerIP].messages.push({
        id: generateMessageId(),
        type: 'system',
        content: msg,
        systemType: type,
        timestamp: getTimestamp()
    });
    saveConversations();
    updateState();
}