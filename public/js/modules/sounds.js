let soundMuted = localStorage.getItem('soundMuted') === 'true';

export function setSoundMuted(muted) {
    soundMuted = muted;
    localStorage.setItem('soundMuted', soundMuted);
}

export function isSoundMuted() {
    return soundMuted;
}

function playSound(soundFile, volume = 0.5) {
    if (soundMuted) return;
    const audio = new Audio(soundFile);
    audio.volume = volume;
    audio.play().catch(e => console.log('Sound play blocked:', e));
}

export function playNotificationSound() {
    playSound('/whatsapp-web-notification.mp3', 0.5);
}

export function playSeenSound() {
    playSound('/whatsapp-seen-notification.mp3', 0.3);
}