// public/js/modules/search.js
import * as store from '../store.js';
import { selectContact } from './ui.js';

const searchResults = document.getElementById('search-results');

export function performSearch(query) {
    if (!query.trim()) {
        searchResults.style.display = 'none';
        return;
    }
    const results = [];
    const lowerQuery = query.toLowerCase();

    for (let ip in store.conversations) {
        const peerName = store.conversations[ip].peerName || ip;
        for (let msg of store.conversations[ip].messages) {
            if (msg.type === 'text' && msg.content && msg.content.toLowerCase().includes(lowerQuery)) {
                results.push({
                    peerIP: ip,
                    peerName,
                    msgId: msg.id,
                    text: msg.content,
                    sender: msg.senderName || (msg.isOwn ? 'You' : 'Unknown'),
                    timestamp: msg.timestamp
                });
            } else if (msg.type === 'file' && msg.name && msg.name.toLowerCase().includes(lowerQuery)) {
                results.push({
                    peerIP: ip,
                    peerName,
                    msgId: msg.id,
                    text: `📁 ${msg.name}`,
                    sender: msg.senderName || (msg.isOwn ? 'You' : 'Unknown'),
                    timestamp: msg.timestamp
                });
            }
        }
    }

    if (results.length === 0) {
        searchResults.innerHTML = '<div style="padding: 8px; text-align: center;">No results</div>';
        searchResults.style.display = 'block';
        return;
    }

    let html = '';
    results.slice(0, 20).forEach(r => {
        html += `<div class="search-result-item" data-ip="${r.peerIP}" data-msgid="${r.msgId}" style="padding: 8px; border-bottom: 1px solid #eee; cursor: pointer;">
            <div><strong>${r.peerName}</strong> · ${r.sender}</div>
            <div style="font-size: 0.9em;">${r.text.substring(0, 50)}${r.text.length > 50 ? '…' : ''}</div>
            <div style="font-size: 0.7em; color: #999;">${r.timestamp}</div>
        </div>`;
    });
    searchResults.innerHTML = html;
    searchResults.style.display = 'block';

    document.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const ip = item.dataset.ip;
            const msgId = item.dataset.msgid;
            selectContact(ip, store.conversations[ip]?.peerName || ip);
            setTimeout(() => {
                const msgElement = document.querySelector(`[data-msgid="${msgId}"]`).closest('.message');
                if (msgElement) {
                    msgElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    msgElement.style.backgroundColor = '#fff3cd';
                    setTimeout(() => msgElement.style.backgroundColor = '', 2000);
                }
            }, 200);
            searchResults.style.display = 'none';
            document.getElementById('search-input').value = '';
        });
    });
}