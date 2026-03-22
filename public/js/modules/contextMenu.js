import { showToast } from './notifications.js';
import { generateMessageId, getTimestamp } from './utils.js';

let socket;
let store;
let renderActiveConversation;
let renderContactList;
let addSystemMessageToConversation;
let confirmModalFn;
let promptModalFn;
let playSeenSound;
let updateBlockButtonText;

const contextMenu = document.getElementById('message-context-menu');
const contextReplyBtn = document.querySelector('.context-reply');
const contextForwardBtn = document.querySelector('.context-forward');
const contextDeleteMeBtn = document.querySelector('.context-delete-me');
const contextDeleteEveryoneBtn = document.querySelector('.context-delete-everyone');

export function initContextMenu(socketRef, storeRef, renderActiveFn, renderContactListFn, addSystemMessageFn, confirmFn, promptFn, seenSoundFn, updateBlockBtnFn) {
    socket = socketRef;
    store = storeRef;
    renderActiveConversation = renderActiveFn;
    renderContactList = renderContactListFn;
    addSystemMessageToConversation = addSystemMessageFn;
    confirmModalFn = confirmFn;
    promptModalFn = promptFn;
    playSeenSound = seenSoundFn;
    updateBlockButtonText = updateBlockBtnFn;
}

function deleteMessageLocally(peerIP, messageId) {
    const conv = store.conversations[peerIP];
    if (!conv) return false;
    const index = conv.messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
        conv.messages.splice(index, 1);
        store.saveConversations();
        if (store.activePeerIP === peerIP) renderActiveConversation();
        renderContactList(store.peersList);
        return true;
    }
    return false;
}

export function handleMessageMenuClick(btn, e) {
    e.stopPropagation();
    const rect = btn.getBoundingClientRect();
    const messageDiv = btn.closest('.message');
    const isOwn = messageDiv.classList.contains('own');

    contextMenu.style.display = 'block';
    contextMenu.style.visibility = 'hidden';
    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    contextMenu.style.visibility = 'visible';

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left;
    if (isOwn) {
        left = rect.left - menuWidth + btn.offsetWidth;
        if (left < 10) left = rect.left;
    } else {
        left = rect.left;
        if (left + menuWidth > viewportWidth - 10) {
            left = rect.left - menuWidth + btn.offsetWidth;
        }
    }
    left = Math.max(10, Math.min(left, viewportWidth - menuWidth - 10));

    let top = rect.bottom + 5;
    if (top + menuHeight > viewportHeight - 10) {
        top = rect.top - menuHeight - 5;
    }
    top = Math.max(10, Math.min(top, viewportHeight - menuHeight - 10));

    contextMenu.style.position = 'fixed';
    contextMenu.style.top = top + 'px';
    contextMenu.style.left = left + 'px';
    contextMenu.style.display = 'block';

    contextMenu.dataset.msgId = btn.dataset.msgId;
    contextMenu.dataset.msgIsOwn = btn.dataset.msgIsOwn;

    const deleteEveryoneBtn = document.querySelector('.context-delete-everyone');
    deleteEveryoneBtn.style.display = btn.dataset.msgIsOwn === 'true' ? 'block' : 'none';
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu') && !e.target.closest('.msg-menu-btn')) {
        contextMenu.style.display = 'none';
        const deleteEveryoneBtn = document.querySelector('.context-delete-everyone');
        if (deleteEveryoneBtn) deleteEveryoneBtn.style.display = 'block';
    }
});

contextDeleteMeBtn.addEventListener('click', () => {
    const msgId = contextMenu.dataset.msgId;
    if (!msgId) return;
    for (let ip in store.conversations) {
        const msg = store.conversations[ip].messages.find(m => m.id === msgId);
        if (msg) {
            deleteMessageLocally(ip, msgId);
            break;
        }
    }
    contextMenu.style.display = 'none';
});

contextDeleteEveryoneBtn.addEventListener('click', () => {
    const msgId = contextMenu.dataset.msgId;
    if (!msgId) return;
    for (let ip in store.conversations) {
        const msg = store.conversations[ip].messages.find(m => m.id === msgId);
        if (msg) {
            const otherIP = msg.isOwn ? ip : msg.senderIP;
            socket.emit('delete-message', { targetIP: otherIP, messageId: msgId });
            break;
        }
    }
    contextMenu.style.display = 'none';
});

let replyToMessage = null;

contextReplyBtn.addEventListener('click', () => {
    const msgId = contextMenu.dataset.msgId;
    if (!msgId) return;
    for (let ip in store.conversations) {
        const msg = store.conversations[ip].messages.find(m => m.id === msgId);
        if (msg) {
            const sender = msg.isOwn ? 'You' : (msg.senderName || 'Unknown');
            replyToMessage = {
                id: msg.id,
                content: msg.type === 'text' ? msg.content : `📁 ${msg.name}`,
                sender: sender,
                type: msg.type
            };
            const replyPreview = document.getElementById('reply-preview');
            const replyText = document.getElementById('reply-text');
            replyText.textContent = `Replying to ${sender}: ${replyToMessage.content.substring(0, 30)}${replyToMessage.content.length > 30 ? '…' : ''}`;
            replyPreview.style.display = 'block';
            break;
        }
    }
    contextMenu.style.display = 'none';
});

document.getElementById('cancel-reply').addEventListener('click', () => {
    replyToMessage = null;
    document.getElementById('reply-preview').style.display = 'none';
});

// Forward
contextForwardBtn.addEventListener('click', () => {
    const msgId = contextMenu.dataset.msgId;
    if (!msgId) return;
    let messageData = null;
    for (let ip in store.conversations) {
        const msg = store.conversations[ip].messages.find(m => m.id === msgId);
        if (msg) {
            messageData = msg;
            break;
        }
    }
    if (!messageData) return;

    const forwardList = document.getElementById('forward-contact-list');
    forwardList.innerHTML = '';
    const availablePeers = store.peersList.filter(p => !store.blockedIPs.has(p.ip) && p.ip !== localStorage.getItem('myIP') && p.ip !== store.activePeerIP);
    availablePeers.forEach(peer => {
        const li = document.createElement('li');
        li.textContent = `${peer.name} (${peer.ip})`;
        li.dataset.ip = peer.ip;
        li.dataset.name = peer.name;
        li.addEventListener('click', () => {
            forwardMessageTo(messageData, peer.ip, peer.name);
            document.getElementById('forward-selector').style.display = 'none';
        });
        forwardList.appendChild(li);
    });
    document.getElementById('forward-selector').style.display = 'block';
    contextMenu.style.display = 'none';
});

document.getElementById('cancel-forward').addEventListener('click', () => {
    document.getElementById('forward-selector').style.display = 'none';
});

function forwardMessageTo(msg, targetIP, targetName) {
    if (msg.type === 'text') {
        const newMsgId = generateMessageId();
        socket.emit('p2p-message', { targetIP, message: msg.content, messageId: newMsgId });

        if (!store.conversations[targetIP]) {
            store.conversations[targetIP] = { messages: [], unread: 0, peerName: targetName };
        }
        store.conversations[targetIP].messages.push({
            id: newMsgId,
            type: 'text',
            content: msg.content,
            isOwn: true,
            delivered: false,
            seen: false,
            timestamp: getTimestamp(),
            forwardedFrom: msg.senderName || msg.sender,
            senderName: 'You'
        });
        store.saveConversations();
        if (store.activePeerIP === targetIP) renderActiveConversation();
    } else if (msg.type === 'file') {
        showToast('File forwarding not yet implemented', 'warning');
    }
}