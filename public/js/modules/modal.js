// public/js/modules/modal.js
let modalResolve = null;

function showModal(message, title = 'Confirm', showInput = false, defaultValue = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const titleElem = document.getElementById('modal-title');
        const messageElem = document.getElementById('modal-message');
        const inputContainer = document.getElementById('modal-input-container');
        const inputField = document.getElementById('modal-input');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        const closeBtn = document.querySelector('.modal-close');

        titleElem.textContent = title;
        messageElem.textContent = message;
        if (showInput) {
            inputContainer.style.display = 'block';
            inputField.value = defaultValue;
            inputField.focus();
        } else {
            inputContainer.style.display = 'none';
        }

        const cleanup = () => {
            modal.style.display = 'none';
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKeyDown);
            modalResolve = null;
        };

        const onConfirm = () => {
            const value = showInput ? inputField.value.trim() : true;
            cleanup();
            resolve(value);
        };

        const onCancel = () => {
            cleanup();
            resolve(showInput ? null : false);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Enter') onConfirm();
            else if (e.key === 'Escape') onCancel();
        };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKeyDown);

        modal.style.display = 'flex';
    });
}

export async function confirmModal(message, title = 'Confirm') {
    return await showModal(message, title, false);
}

export async function promptModal(message, title = 'Input', defaultValue = '') {
    return await showModal(message, title, true, defaultValue);
}