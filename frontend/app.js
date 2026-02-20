/* ═══════════════════════════════════════════════════
   CyberGuard — Frontend Chat Application Logic (Thai)
   ═══════════════════════════════════════════════════ */

const API_BASE = window.location.origin;

// ─── State ──────────────────────────────────────
let sessionId = null;
let userName = '';
let isProcessing = false;
let selectedModel = 'openai/gpt-4o';

// ─── DOM Elements ───────────────────────────────
const welcomeScreen = document.getElementById('welcome-screen');
const chatScreen = document.getElementById('chat-screen');
const nameInput = document.getElementById('user-name');
const startBtn = document.getElementById('start-btn');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const sidebar = document.getElementById('sidebar');
const userAvatar = document.getElementById('user-avatar');
const userDisplayName = document.getElementById('user-display-name');
const modelSelect = document.getElementById('model-select');
const toastContainer = document.getElementById('toast-container');

// ─── Toast Notification System ──────────────────

const TOAST_ICONS = {
    error: '❌',
    success: '✅',
    warning: '⚠️',
    info: '💡',
};

function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
        <span>${message}</span>
    `;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

// ─── Model Switcher ─────────────────────────────

async function loadModels() {
    try {
        const res = await fetch(`${API_BASE}/api/models`);
        if (!res.ok) throw new Error('Failed to load models');
        const models = await res.json();

        modelSelect.innerHTML = '';
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.name} — ${m.description}`;
            opt.title = `${m.provider}: ${m.description}`;
            modelSelect.appendChild(opt);
        });

        // Restore saved model preference
        const savedModel = localStorage.getItem('cyberguard_model');
        if (savedModel && models.find(m => m.id === savedModel)) {
            selectedModel = savedModel;
            modelSelect.value = savedModel;
        } else {
            selectedModel = models[0]?.id || 'openai/gpt-4o';
        }
    } catch (err) {
        console.warn('Could not load models:', err);
    }
}

function changeModel(modelId) {
    selectedModel = modelId;
    localStorage.setItem('cyberguard_model', modelId);
    const modelName = modelSelect.options[modelSelect.selectedIndex]?.textContent.split(' — ')[0] || modelId;
    showToast(`เปลี่ยนเป็นโมเดล ${modelName}`, 'info', 2500);
}

// ─── Session Persistence (localStorage) ─────────

function saveSession() {
    localStorage.setItem('cyberguard_session', JSON.stringify({ sessionId, userName }));
}

function clearSession() {
    localStorage.removeItem('cyberguard_session');
    localStorage.removeItem('cyberguard_model');
}

async function tryRestoreSession() {
    const saved = localStorage.getItem('cyberguard_session');
    if (!saved) return false;

    try {
        const data = JSON.parse(saved);
        if (!data.sessionId || !data.userName) return false;

        // Test if the session is still valid by fetching history
        const res = await fetch(`${API_BASE}/api/history/${data.sessionId}`);
        if (!res.ok) {
            clearSession();
            return false;
        }

        const history = await res.json();
        sessionId = data.sessionId;
        userName = data.userName;

        // Switch to chat screen
        userAvatar.textContent = userName.charAt(0).toUpperCase();
        userDisplayName.textContent = userName;
        welcomeScreen.classList.remove('active');
        chatScreen.classList.add('active');

        // Show restored banner
        const banner = document.createElement('div');
        banner.className = 'restored-banner';
        banner.innerHTML = `🔄 ยินดีต้อนรับกลับมา ${userName}! กำลังโหลดประวัติการสนทนา...`;
        chatMessages.appendChild(banner);

        // Restore messages from history
        if (history.length > 0) {
            history.forEach(msg => addMessage(msg.role, msg.content, false));
        } else {
            // If no messages yet, show welcome
            addWelcomeMessage();
        }

        // Remove banner after messages load
        setTimeout(() => banner.remove(), 2000);

        showToast(`เซสชันของ ${userName} ถูกกู้คืนแล้ว`, 'success', 3000);
        messageInput.focus();
        return true;
    } catch (err) {
        console.warn('Session restore failed:', err);
        clearSession();
        return false;
    }
}

// ─── Welcome / Session ─────────────────────────

nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startChat();
});

async function startChat() {
    const name = nameInput.value.trim();
    if (!name) {
        nameInput.focus();
        nameInput.style.borderColor = '#ef4444';
        setTimeout(() => { nameInput.style.borderColor = ''; }, 1500);
        return;
    }

    startBtn.disabled = true;
    startBtn.querySelector('span').textContent = 'กำลังเริ่ม...';

    try {
        const res = await fetch(`${API_BASE}/api/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userName: name }),
        });

        if (!res.ok) throw new Error('Failed to create session');

        const data = await res.json();
        sessionId = data.id;
        userName = name;

        // Save session to localStorage
        saveSession();

        // Update UI
        userAvatar.textContent = name.charAt(0).toUpperCase();
        userDisplayName.textContent = name;

        // Switch screens
        welcomeScreen.classList.remove('active');
        chatScreen.classList.add('active');

        // Show Thai welcome message
        addWelcomeMessage();
        messageInput.focus();
    } catch (err) {
        console.error('Session error:', err);
        startBtn.disabled = false;
        startBtn.querySelector('span').textContent = 'เริ่มสนทนา';
        showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบว่า backend server กำลังทำงานอยู่', 'error', 5000);
    }
}

function addWelcomeMessage() {
    const welcomeMsg = [
        `สวัสดีครับ/ค่ะ ${userName}! 👋 ฉันชื่อ **CyberGuard** ผู้ช่วย AI ด้านความปลอดภัยทางไซเบอร์ของคุณ`,
        'คุณสามารถถามเรื่องความปลอดภัยทางไซเบอร์ได้ทุกอย่าง ฉันจะอธิบายด้วยภาษาไทยง่ายๆ ไม่มีศัพท์เทคนิคที่ซับซ้อน!',
        'ลองถามอะไรแบบนี้ได้เลย:\n• "ฟิชชิ่งคืออะไร?"\n• "ตั้งรหัสผ่านที่แข็งแกร่งยังไง?"\n• "WiFi สาธารณะใช้ได้ปลอดภัยไหม?"'
    ].join('\n\n');
    addMessage('assistant', welcomeMsg, false);
}

// ─── Chat ───────────────────────────────────────

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// Auto-resize textarea
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
});

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || isProcessing || !sessionId) return;

    isProcessing = true;
    sendBtn.disabled = true;

    // Add user message
    addMessage('user', text);
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Show typing indicator
    const typingEl = showTypingIndicator();

    try {
        const res = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, message: text, model: selectedModel }),
        });

        if (!res.ok) throw new Error('Chat request failed');

        const data = await res.json();
        removeTypingIndicator(typingEl);
        addMessage('assistant', data.response);
    } catch (err) {
        console.error('Chat error:', err);
        removeTypingIndicator(typingEl);
        addMessage('assistant', '⚠️ ขณะนี้มีปัญหาในการเชื่อมต่อ ลองใหม่อีกครั้ง');
        showToast('ไม่สามารถส่งข้อความได้ กรุณาลองใหม่', 'error', 4000);
    } finally {
        isProcessing = false;
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

// ─── Message Rendering ──────────────────────────

function addMessage(role, content, animate = true) {
    const wrapper = document.createElement('div');
    wrapper.className = `message ${role}`;
    if (!animate) wrapper.style.animation = 'none';

    const avatarChar = role === 'assistant' ? '🛡' : userName.charAt(0).toUpperCase();

    wrapper.innerHTML = `
    <div class="message-avatar">${avatarChar}</div>
    <div class="message-content">${formatMarkdown(content)}</div>
  `;

    chatMessages.appendChild(wrapper);
    scrollToBottom();
}

function formatMarkdown(text) {
    let html = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
        .replace(/^[•\-]\s+(.+)$/gm, '<li>$1</li>')
        .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
        .replace(/\n\n+/g, '</p><p>')
        .replace(/\n/g, '<br>');

    return `<p>${html}</p>`;
}

function showTypingIndicator() {
    const el = document.createElement('div');
    el.className = 'message assistant';
    el.innerHTML = `
    <div class="message-avatar">🛡</div>
    <div class="message-content">
      <div class="typing-indicator">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    </div>
  `;
    chatMessages.appendChild(el);
    scrollToBottom();
    return el;
}

function removeTypingIndicator(el) {
    if (el && el.parentNode) {
        el.parentNode.removeChild(el);
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ─── Sidebar ────────────────────────────────────

function toggleSidebar() {
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
    } else {
        sidebar.classList.toggle('collapsed');
    }
}

function askSuggestion(btn) {
    const text = btn.textContent.replace(/^[^\s]+\s/, '');
    messageInput.value = text;
    messageInput.focus();
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('mobile-open');
    }
    sendMessage();
}

function newChat() {
    clearSession();
    window.location.reload();
}

// ─── Init ───────────────────────────────────────

(async function init() {
    // Load available AI models
    await loadModels();

    // Try to restore previous session
    const restored = await tryRestoreSession();
    if (!restored) {
        nameInput.focus();
    }
})();
