import { confirmModal, promptModal } from './modal.js';
import { showToast } from './notifications.js';
import { addSystemMessageToConversation } from './utils.js';

let socket;
let store;
let renderActiveConversation;
let renderContactList;
let renderBlockedPanel;
let confirmModalFn;
let promptModalFn;
let deleteFileFromDB;

export function initChatHeaderMenu(socketRef, storeRef, renderActiveFn, renderContactListFn, renderBlockedPanelFn, confirmFn, promptFn, deleteFileFn) {
    socket = socketRef;
    store = storeRef;
    renderActiveConversation = renderActiveFn;
    renderContactList = renderContactListFn;
    renderBlockedPanel = renderBlockedPanelFn;
    confirmModalFn = confirmFn;
    promptModalFn = promptFn;
    deleteFileFromDB = deleteFileFn;

    const chatMenuBtn = document.getElementById('chat-menu-btn');
    const chatMenuDropdown = document.getElementById('chat-menu-dropdown');

    chatMenuDropdown.innerHTML = `
        <button id="edit-name-btn">Edit name</button>
        <button id="block-contact-btn">Block</button>
        <hr>
        <button id="clear-chat-btn">Clear chat</button>
    `;

    chatMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chatMenuDropdown.style.display = chatMenuDropdown.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', () => {
        chatMenuDropdown.style.display = 'none';
    });

    document.getElementById('edit-name-btn').addEventListener('click', async () => {
        if (!store.activePeerIP) return;
        const currentName = store.conversations[store.activePeerIP]?.peerName || store.activePeerIP;
        const newName = await promptModalFn('Enter new name for this contact:', 'Edit Name', currentName);
        if (newName && newName.trim()) {
            store.conversations[store.activePeerIP].peerName = newName.trim();
            document.getElementById('active-contact-name').innerText = newName.trim();
            store.saveConversations();
            renderContactList(store.peersList);
            renderBlockedPanel();
        }
        chatMenuDropdown.style.display = 'none';
    });

    document.getElementById('block-contact-btn').addEventListener('click', async () => {
        if (!store.activePeerIP) return;
        const peerName = store.conversations[store.activePeerIP]?.peerName || store.activePeerIP;
        const isBlocked = store.blockedIPs.has(store.activePeerIP);
        const action = isBlocked ? 'unblock' : 'block';
        const confirmed = await confirmModalFn(`Are you sure you want to ${action} ${peerName}?`, `${action.charAt(0).toUpperCase() + action.slice(1)} Contact`);
        if (!confirmed) return;

        if (isBlocked) {
            store.blockedIPs.delete(store.activePeerIP);
            addSystemMessageToConversation(store.activePeerIP, `🔓 You unblocked ${peerName}`, 'info');
            renderContactList(store.peersList);
        } else {
            store.blockedIPs.add(store.activePeerIP);
            addSystemMessageToConversation(store.activePeerIP, `🔒 You blocked ${peerName}`, 'info');
            store.clearActivePeerIP();
            document.getElementById('active-contact-name').innerText = 'Select a contact';
            document.getElementById('contact-status').innerHTML = '';
            renderActiveConversation();
            renderContactList(store.peersList);
        }
        store.saveBlockedIPs();
        chatMenuDropdown.style.display = 'none';
    });

    document.getElementById('clear-chat-btn').addEventListener('click', async () => {
        if (!store.activePeerIP) return;
        const confirmed = await confirmModalFn('Clear all messages with this contact? This will also delete any shared files permanently.', 'Clear Chat');
        if (confirmed) {
            const conv = store.conversations[store.activePeerIP];
            if (conv) {
                for (const msg of conv.messages) {
                    if (msg.type === 'file' && msg.id) {
                        await deleteFileFromDB(msg.id);
                    }
                }
                conv.messages = [];
                conv.unread = 0;
                store.saveConversations();
                renderActiveConversation();
                renderContactList(store.peersList);
            }
        }
        chatMenuDropdown.style.display = 'none';
    });
}