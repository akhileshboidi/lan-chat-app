import * as store from '../store.js';

export function renderBlockedPanel() {
    const list = document.getElementById('blocked-list');
    list.innerHTML = '';
    const blockedArray = Array.from(store.blockedIPs);
    if (blockedArray.length === 0) {
        list.innerHTML = '<li style="text-align:center; color:#999;">No blocked contacts</li>';
    } else {
        blockedArray.forEach(ip => {
            const name = store.conversations[ip]?.peerName || ip;
            const li = document.createElement('li');
            li.innerHTML = `<span>${name}</span> <button class="unblock-btn" data-ip="${ip}">Unblock</button>`;
            list.appendChild(li);
        });
        document.querySelectorAll('.unblock-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ip = e.target.dataset.ip;
                store.blockedIPs.delete(ip);
                store.saveBlockedIPs();
                renderBlockedPanel();
                import('./ui.js').then(m => {
                    m.renderContactList(store.peersList);
                    if (store.activePeerIP === ip) {
                        const blockBtn = document.getElementById('block-contact-btn');
                        if (blockBtn) blockBtn.textContent = 'Block';
                    }
                });
            });
        });
    }
}

export function updateBlockButtonText() {
    const blockBtn = document.getElementById('block-contact-btn');
    if (!blockBtn || !store.activePeerIP) return;
    if (store.blockedIPs.has(store.activePeerIP)) {
        blockBtn.textContent = 'Unblock';
    } else {
        blockBtn.textContent = 'Block';
    }
}