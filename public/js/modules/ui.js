import * as store from '../store.js';
import { formatBytes, getTimestamp } from './utils.js';
import { playSeenSound } from './sounds.js';

export function renderContactList(peers) {
    const list = document.getElementById('contact-list');
    list.innerHTML = '';
    const filteredPeers = peers.filter(p => !store.blockedIPs.has(p.ip) && p.ip !== localStorage.getItem('myIP'));
    filteredPeers.forEach(peer => {
        const li = document.createElement('li');
        li.setAttribute('data-ip', peer.ip);
        if (store.activePeerIP === peer.ip) li.classList.add('active');

        const conv = store.conversations[peer.ip];
        const unread = conv ? conv.unread : 0;

        const avatar = document.createElement('div');
        avatar.className = 'contact-avatar';
        avatar.textContent = peer.name.charAt(0).toUpperCase();

        const infoDiv = document.createElement('div');
        infoDiv.className = 'contact-info';
        infoDiv.innerHTML = `
            <span class="contact-name">${peer.name}</span>
            <span class="contact-ip">${peer.ip}</span>
            <span class="contact-status"><span class="status-dot online"></span> Online</span>
        `;

        const hasSender = Object.values(store.sendingFiles).some(s => s.targetIP === peer.ip && !s.cancelled);
        const hasReceiver = Object.values(store.receivingFiles).some(r => r.senderIP === peer.ip && !r.cancelled);
        if (hasSender || hasReceiver) {
            const transferSpan = document.createElement('span');
            transferSpan.className = 'transfer-icon';
            transferSpan.textContent = hasSender ? '⬆️' : '⬇️';
            infoDiv.appendChild(transferSpan);
        }

        li.appendChild(avatar);
        li.appendChild(infoDiv);

        if (unread) {
            const badge = document.createElement('span');
            badge.className = 'unread-badge';
            badge.textContent = unread;
            li.appendChild(badge);
        }

        li.addEventListener('click', () => selectContact(peer.ip, peer.name));
        list.appendChild(li);
    });
}

export function renderActiveConversation() {
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = '';
    if (!store.activePeerIP || !store.conversations[store.activePeerIP]) return;

    const conv = store.conversations[store.activePeerIP];
    conv.messages.forEach(msg => {
        const div = document.createElement('div');
        const additionalClass = msg.deleted ? ' deleted' : '';
        div.className = `message ${msg.isOwn ? 'own' : 'other'}${additionalClass}`;
        div.dataset.msgid = msg.id;

        let contentHtml = '';

        if (msg.type === 'system') {
            div.className = `system-message ${msg.systemType || ''}`;
            contentHtml = msg.content;
        } else {
            let statusHtml = '';
            if (msg.isOwn) {
                if (msg.seen) statusHtml = '<span class="tick seen">✓✓</span>';
                else if (msg.delivered) statusHtml = '<span class="tick delivered">✓✓</span>';
                else statusHtml = '<span class="tick sent">✓</span>';
            }

            // DEBUG: Log replyTo
            if (msg.replyTo) {
                console.log('Reply found for message', msg.id, msg.replyTo);
            }

            // Build reply indicator first
            if (msg.replyTo) {
                const sender = msg.replyTo.sender === 'You' ? 'You' : msg.replyTo.sender;
                contentHtml += `<div class="reply-indicator"><span>↪️ ${sender}: ${msg.replyTo.content}</span></div>`;
            }

            // Main message content
            if (msg.type === 'text') {
                if (msg.deleted) {
                    let deleteText = msg.isOwn ? 'You deleted this message' : `This message was deleted`;
                    contentHtml += `${deleteText} ${statusHtml}<div class="timestamp">${msg.timestamp}</div>`;
                } else {
                    contentHtml += `${msg.content} ${statusHtml}<div class="timestamp">${msg.timestamp}</div>`;
                }
            } else if (msg.type === 'file') {
                if (msg.deleted) {
                    let deleteText = msg.isOwn ? 'You deleted this file' : `This file was deleted`;
                    contentHtml += `${deleteText} ${statusHtml}<div class="timestamp">${msg.timestamp}</div>`;
                } else {
                    let fileContent = `📁 ${msg.name}`;
                    if (msg.url) {
                        fileContent += `<br><a href="${msg.url}" download="${msg.name}" class="download-link">📥 Download (${formatBytes(msg.size)})</a>`;
                    } else if (msg.needsRestore) {
                        fileContent += ` <span class="file-expired">(restoring...)</span>`;
                    } else if (msg.fileDataLost) {
                        fileContent += ` <span class="file-expired">(expired, file not available after reload)</span>`;
                    } else {
                        const percent = msg.percent || 0;
                        const speed = msg.speed ? formatBytes(msg.speed) + '/s' : '';
                        fileContent += `
                            <div class="file-progress">
                                <progress value="${percent}" max="100"></progress>
                                <span class="file-speed">${percent}% ${speed}</span>
                            </div>`;
                        if (msg.isOwn && store.sendingFiles[msg.id]) {
                            const fileState = store.sendingFiles[msg.id];
                            fileContent += `
                                <div class="file-controls">
                                    <button class="pause-file" data-id="${msg.id}" ${fileState.paused ? 'style="display:none;"' : ''}>⏸️</button>
                                    <button class="resume-file" data-id="${msg.id}" ${!fileState.paused ? 'style="display:none;"' : ''}>▶️</button>
                                    <button class="cancel-file" data-id="${msg.id}">❌</button>
                                </div>`;
                        }
                    }
                    contentHtml += `${fileContent} ${statusHtml}<div class="timestamp">${msg.timestamp}</div>`;
                }
            }
        }

        div.innerHTML = contentHtml;

        // Add menu button separately (does not need to be in innerHTML)
        if (msg.type !== 'system' && !msg.deleted) {
            const menuBtn = document.createElement('span');
            menuBtn.className = 'msg-menu-btn';
            menuBtn.textContent = '⋮';
            menuBtn.dataset.msgId = msg.id;
            menuBtn.dataset.msgIsOwn = msg.isOwn;
            menuBtn.dataset.msgContent = msg.content || '';
            menuBtn.dataset.msgName = msg.name || '';
            menuBtn.dataset.msgSize = msg.size || '';
            menuBtn.dataset.msgSender = msg.isOwn ? 'You' : (msg.senderName || 'Unknown');
            div.appendChild(menuBtn);
        }

        chatBox.appendChild(div);
    });

    // Attach event listeners for file controls (they are re‑added on every render)
    document.querySelectorAll('.pause-file').forEach(btn => {
        btn.addEventListener('click', (e) => {
            import('./fileTransfer.js').then(m => m.pauseFile(e.target.dataset.id));
        });
    });
    document.querySelectorAll('.resume-file').forEach(btn => {
        btn.addEventListener('click', (e) => {
            import('./fileTransfer.js').then(m => m.resumeFile(e.target.dataset.id));
        });
    });
    document.querySelectorAll('.cancel-file').forEach(btn => {
        btn.addEventListener('click', (e) => {
            import('./fileTransfer.js').then(m => m.cancelFile(e.target.dataset.id));
        });
    });

    chatBox.scrollTop = chatBox.scrollHeight;
}

export function updateFileMessage(peerIP, messageId, updates) {
    const conv = store.conversations[peerIP];
    if (!conv) return;
    const msgIndex = conv.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    Object.assign(conv.messages[msgIndex], updates);
    store.saveConversations();
    if (store.activePeerIP === peerIP) {
        renderActiveConversation();
    }
}

export function markMessagesAsSeen(peerIP) {
    const conv = store.conversations[peerIP];
    if (!conv) return;
    const unseenMessageIds = [];
    conv.messages.forEach(msg => {
        if (!msg.isOwn && !msg.seen) {
            msg.seen = true;
            unseenMessageIds.push(msg.id);
        }
    });
    if (unseenMessageIds.length > 0) {
        store.saveConversations();
        if (store.activePeerIP === peerIP) renderActiveConversation();
        const socket = window.socket;
        if (socket) socket.emit('message-seen', { targetIP: peerIP, messageIds: unseenMessageIds });
        playSeenSound();
    }
}

export function selectContact(ip, name) {
    if (store.activePeerIP === ip) return;
    store.setActivePeerIP(ip);
    document.getElementById('active-contact-name').innerText = name;
    const blockBtn = document.getElementById('block-contact-btn');
    if (blockBtn) {
        if (store.blockedIPs.has(ip)) blockBtn.textContent = 'Unblock';
        else blockBtn.textContent = 'Block';
    }

    const isOnline = store.onlineIPs.has(ip);
    document.getElementById('contact-status').innerHTML = isOnline
        ? `<span class="status-dot online"></span> Online`
        : `<span class="status-dot offline"></span> Offline`;

    markMessagesAsSeen(ip);

    if (store.conversations[ip]) store.conversations[ip].unread = 0;
    store.saveConversations();

    renderActiveConversation();
    renderContactList(store.peersList);
    document.getElementById('msg').focus();
}