import { conversations, activePeerIP, saveConversations } from '../store.js';

const DB_NAME = 'WhatsAppClone';
const DB_VERSION = 2;
const STORE_NAME = 'files';
const TRANSFER_STORE = 'transfers';

export function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (event) => {
            console.error('❌ IndexedDB open error:', event.target.error);
            reject(event.target.error);
        };
        request.onsuccess = (event) => {
            console.log('✅ IndexedDB opened successfully');
            resolve(event.target.result);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'messageId' });
                console.log('✅ Object store created');
            }
            if (!db.objectStoreNames.contains(TRANSFER_STORE)) {
                db.createObjectStore(TRANSFER_STORE, { keyPath: 'messageId' });
                console.log('✅ Transfer store created');
            }
        };
    });
}

export async function saveFileToDB(messageId, blob, fileName, fileSize, senderIP) {
    console.log(`💾 Attempting to save file to IndexedDB: ${messageId}`);
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const fileData = {
                messageId,
                blob,
                fileName,
                fileSize,
                senderIP,
                timestamp: Date.now()
            };
            const request = store.put(fileData);

            request.onsuccess = () => {
                console.log(`✅ File put request successful: ${messageId}`);
            };

            tx.oncomplete = () => {
                console.log(`✅ Transaction complete for file: ${messageId}`);
                resolve(true);
            };

            tx.onerror = (e) => {
                console.error('❌ Transaction error:', e.target.error);
                reject(e.target.error);
            };

            request.onerror = (e) => {
                console.error('❌ Request error:', e.target.error);
                reject(e.target.error);
            };
        });
    } catch (error) {
        console.error('❌ Error in saveFileToDB:', error);
        return false;
    }
}

export async function getFileFromDB(messageId) {
    console.log(`🔍 Attempting to retrieve file from IndexedDB: ${messageId}`);
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(messageId);

            request.onsuccess = () => {
                if (request.result) {
                    console.log(`📂 File found in IndexedDB: ${messageId}`);
                } else {
                    console.log(`🔎 File not found in IndexedDB: ${messageId}`);
                }
                resolve(request.result);
            };

            request.onerror = (e) => {
                console.error('❌ Error getting file from IndexedDB:', e.target.error);
                resolve(null);
            };
        });
    } catch (error) {
        console.error('❌ Error in getFileFromDB:', error);
        return null;
    }
}

export async function deleteFileFromDB(messageId) {
    console.log(`🗑️ Attempting to delete file from IndexedDB: ${messageId}`);
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(messageId);

            tx.oncomplete = () => {
                console.log(`✅ File deleted from IndexedDB: ${messageId}`);
                resolve(true);
            };
            tx.onerror = (e) => {
                console.error('❌ Delete transaction error:', e.target.error);
                reject(e.target.error);
            };
            request.onerror = (e) => {
                console.error('❌ Delete request error:', e.target.error);
                reject(e.target.error);
            };
        });
    } catch (error) {
        console.error('❌ Error deleting file from IndexedDB:', error);
        return false;
    }
}

export async function restoreFilesFromDB() {
    console.log('🔄 Starting file restoration from IndexedDB...');
    try {
        const needsRestore = [];
        for (let ip in conversations) {
            for (let msg of conversations[ip].messages) {
                if (msg.type === 'file' && msg.needsRestore) {
                    needsRestore.push({ ip, msg });
                }
            }
        }
        console.log(`📊 Files to restore: ${needsRestore.length}`);

        for (let { ip, msg } of needsRestore) {
            const fileData = await getFileFromDB(msg.id);
            if (fileData && fileData.blob) {
                const url = URL.createObjectURL(fileData.blob);
                msg.url = url;
                msg.percent = 100;
                delete msg.needsRestore;
                console.log(`✅ Restored file: ${msg.id}`);
            } else {
                msg.fileDataLost = true;
                delete msg.needsRestore;
                console.log(`❌ File lost: ${msg.id}`);
            }
        }
        if (activePeerIP) {
            const { renderActiveConversation } = await import('./ui.js');
            renderActiveConversation();
        }
    } catch (error) {
        console.error('❌ Error restoring files:', error);
    }
}