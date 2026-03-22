/* ═══════════════════════════════════════════════════
   CyberChat — Frontend Chat Application Logic (Thai)
   ═══════════════════════════════════════════════════ */

const API_BASE = window.location.origin;

// ─── State ──────────────────────────────────────
let sessionId = null;
let userName = '';
let isProcessing = false;

// ─── DOM Elements ───────────────────────────────
const welcomeScreen = document.getElementById('welcome-screen');
const chatScreen = document.getElementById('chat-screen');
const nameInput = document.getElementById('user-name');
const startBtn = document.getElementById('start-btn');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const sidebar = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const userAvatar = document.getElementById('user-avatar');
const userDisplayName = document.getElementById('user-display-name');
const toastContainer = document.getElementById('toast-container');
const sessionList = document.getElementById('session-list');

// ─── Toast Notification System ──────────────────

const TOAST_ICONS = {
    error: '❌',
    success: '✅',
    warning: '⚠️',
    info: '💡',
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
        <span>${escapeHtml(message)}</span>
    `;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

// ─── Sidebar Toggle ─────────────────────────────

if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', function (e) {
        e.preventDefault();
        const isMobile = window.innerWidth <= 1024;

        if (isMobile) {
            const isOpen = sidebar.classList.contains('mobile-open');
            if (isOpen) {
                closeSidebar();
            } else {
                openSidebar();
            }
        } else {
            sidebar.classList.toggle('collapsed');
        }
    });
}

if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', function (e) {
        e.preventDefault();
        closeSidebar();
    });
}

function openSidebar() {
    sidebar.classList.add('mobile-open');
    if (sidebarBackdrop) {
        sidebarBackdrop.classList.add('active');
    }
    // Prevent background scrolling on iOS
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    sidebar.classList.remove('mobile-open');
    if (sidebarBackdrop) {
        sidebarBackdrop.classList.remove('active');
    }
    // Restore background scrolling
    document.body.style.overflow = '';
}


function saveSession() {
    localStorage.setItem('cyberguard_session', JSON.stringify({ sessionId, userName }));
    localStorage.setItem('cyberguard_username', userName);
}

function clearSession() {
    localStorage.removeItem('cyberguard_session');
}

function fullLogout() {
    clearSession();
    localStorage.removeItem('cyberguard_username');
    window.location.reload();
}

async function tryRestoreSession() {
    const saved = localStorage.getItem('cyberguard_session');

    // Case 1: Full session exists — try to restore it
    if (saved) {
        try {
            const data = JSON.parse(saved);
            if (data.sessionId && data.userName) {
                const res = await fetch(`${API_BASE}/api/history/${data.sessionId}`);
                if (res.ok) {
                    const history = await res.json();
                    sessionId = data.sessionId;
                    userName = data.userName;

                    enterChatScreen();

                    // Show restored banner
                    const banner = document.createElement('div');
                    banner.className = 'restored-banner';
                    banner.innerHTML = '🔄 ยินดีต้อนรับกลับมา ' + userName + '! กำลังโหลดประวัติการสนทนา...';
                    chatMessages.appendChild(banner);

                    if (history.length > 0) {
                        history.forEach(function (msg) { addMessage(msg.role, msg.content, false); });
                    } else {
                        addWelcomeMessage();
                    }

                    setTimeout(function () { banner.remove(); }, 2000);
                    showToast('เซสชันของ ' + userName + ' ถูกกู้คืนแล้ว', 'success', 3000);
                    messageInput.focus();
                    return true;
                }
            }
        } catch (err) {
            console.warn('Session restore failed:', err);
        }
        clearSession();
    }

    // Case 2: No active session but we remember the username — auto-start new session
    const savedName = localStorage.getItem('cyberguard_username');
    if (savedName) {
        try {
            const res = await fetch(API_BASE + '/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userName: savedName }),
            });
            if (res.ok) {
                const data = await res.json();
                sessionId = data.id;
                userName = savedName;
                saveSession();
                enterChatScreen();
                addWelcomeMessage();
                showToast('ยินดีต้อนรับกลับ ' + userName + '!', 'success', 3000);
                messageInput.focus();
                return true;
            }
        } catch (err) {
            console.warn('Auto-session creation failed:', err);
        }
    }

    return false;
}

function enterChatScreen() {
    userAvatar.textContent = userName.charAt(0).toUpperCase();
    userDisplayName.textContent = userName;
    welcomeScreen.classList.remove('active');
    chatScreen.classList.add('active');
    loadSessions(); // Load active sessions into the sidebar
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

        // Switch screens
        enterChatScreen();

        // Show Thai welcome message
        addWelcomeMessage();
        messageInput.focus();
    } catch (err) {
        console.error('Session error:', err);
        startBtn.disabled = false;
        startBtn.querySelector('span').textContent = 'เริ่มสนทนา';

        if (err.message.includes('MAX_SESSIONS_REACHED')) {
            showToast('คุณมีเซสชันสูงสุด 3 แชทแล้ว กรุณาลบแชทเก่าออกก่อน', 'error', 5000);
        } else {
            showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบว่า backend server กำลังทำงานอยู่', 'error', 5000);
        }
    }
}

function addWelcomeMessage() {
    const welcomeMsg = [
        `สวัสดีครับ/ค่ะ ${userName}! 👋 ฉันชื่อ **CyberChat** ผู้ช่วย AI ด้านความปลอดภัยทางไซเบอร์ของคุณ`,
        'คุณสามารถถามเรื่องความปลอดภัยทางไซเบอร์ได้ทุกอย่าง ฉันจะอธิบายด้วยภาษาไทยง่ายๆ ไม่มีศัพท์เทคนิคที่ซับซ้อน!',
        'ลองถามอะไรแบบนี้ได้เลย:\n• "ถ้าได้รับ SMS แปลกๆ จากธนาคาร ควรทำยังไง?"\n• "ตั้งรหัสผ่านยังไงให้คนอื่นเดาไม่ได้?"\n• "ใช้ WiFi ฟรีตามร้านกาแฟ อันตรายไหม?"'
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
            body: JSON.stringify({ sessionId, message: text }),
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
    // Escape HTML entities first to prevent XSS, then apply markdown
    let html = escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
        .replace(/^[•\-]\s+(.+)$/gm, '<li>$1</li>')
        .replace(/((?:&lt;li&gt;.*&lt;\/li&gt;\n?)+)/g, '<ul>$1</ul>')
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
    if (window.innerWidth <= 1024) {
        closeSidebar();
    }
    sendMessage();
}

let refreshCooldownTimer = null;

async function refreshSuggestions() {
    const btn = document.getElementById('refresh-suggestions-btn');
    const container = document.getElementById('suggested-questions');
    if (!btn || !container) return;

    // Prevent double-clicking or during cooldown
    if (btn.classList.contains('spinning')) return;
    if (btn.classList.contains('cooldown')) {
        const match = btn.title.match(/\d+/);
        const secs = match ? match[0] : '...';
        showToast(`กรุณารอ ${secs} วินาทีก่อนรีเฟรชอีกครั้ง`, 'warning', 2000);
        return;
    }

    btn.classList.add('spinning');

    try {
        const res = await fetch(`${API_BASE}/api/suggestions`);

        if (res.status === 429) {
            const data = await res.json();
            showToast(data.message || 'กรุณารอสักครู่ก่อนรีเฟรชอีกครั้ง', 'warning', 3000);
            startCooldown(btn, data.retryAfter || 30);
            return;
        }

        if (!res.ok) throw new Error('Failed to fetch suggestions');

        const suggestions = await res.json();

        // Clear existing and render new suggestions
        container.innerHTML = '';
        suggestions.forEach(item => {
            const button = document.createElement('button');
            button.className = 'suggestion-btn';
            button.textContent = `${item.emoji} ${item.text}`;
            button.onclick = function () { askSuggestion(this); };
            container.appendChild(button);
        });

        showToast('คำถามแนะนำถูกรีเฟรชแล้ว', 'success', 2000);
        startCooldown(btn, 30);
    } catch (err) {
        console.error('Error refreshing suggestions:', err);
        showToast('ไม่สามารถรีเฟรชคำถามได้ ลองใหม่อีกครั้ง', 'error', 3000);
    } finally {
        btn.classList.remove('spinning');
    }
}

function startCooldown(btn, seconds) {
    btn.classList.add('cooldown');
    btn.style.opacity = '0.4';
    btn.title = `รอ ${seconds} วินาที`;

    if (refreshCooldownTimer) clearInterval(refreshCooldownTimer);

    let remaining = seconds;
    refreshCooldownTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(refreshCooldownTimer);
            refreshCooldownTimer = null;
            btn.classList.remove('cooldown');
            btn.style.opacity = '';
            btn.title = 'รีเฟรชคำถามแนะนำ';
        } else {
            btn.title = `รอ ${remaining} วินาที`;
        }
    }, 1000);
}

// ─── Session Management ─────────────────────────

async function loadSessions() {
    if (!userName) return;
    try {
        const res = await fetch(`${API_BASE}/api/sessions/user/${userName}`);
        if (!res.ok) throw new Error('Failed to load sessions');
        const sessions = await res.json();

        sessionList.innerHTML = '';

        sessions.forEach((s, index) => {
            const item = document.createElement('div');
            item.className = `session-item ${s.id === sessionId ? 'active' : ''}`;

            // Format time or use generic name
            const label = `แชท ${sessions.length - index} (${s.message_count} ข้อความ)`;

            item.innerHTML = `
                <div class="session-item-name" title="${label}">${label}</div>
                <button class="session-delete-btn" title="ลบเซสชัน" onclick="event.stopPropagation(); deleteUserSession('${s.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            `;

            item.addEventListener('click', () => switchSession(s.id));
            sessionList.appendChild(item);
        });

    } catch (err) {
        console.error('Error loading sessions:', err);
    }
}

async function switchSession(newSessionId) {
    if (newSessionId === sessionId) return;

    try {
        const res = await fetch(`${API_BASE}/api/history/${newSessionId}`);
        if (!res.ok) throw new Error('Failed to fetch history');

        const history = await res.json();
        sessionId = newSessionId;
        saveSession();

        // Clear UI and render history
        chatMessages.innerHTML = '';

        if (history.length > 0) {
            history.forEach(msg => { addMessage(msg.role, msg.content, false); });
        } else {
            addWelcomeMessage();
        }

        scrollToBottom();
        loadSessions(); // Refresh UI to highlight active

        if (window.innerWidth <= 1024) {
            closeSidebar();
        }
    } catch (err) {
        console.error('Error switching session:', err);
        showToast('ไม่สามารถสลับแชทได้', 'error');
    }
}

async function deleteUserSession(idToDelete) {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบแชทนี้?')) return;

    try {
        const res = await fetch(`${API_BASE}/api/sessions/${idToDelete}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userName }),
        });
        if (!res.ok) throw new Error('Failed to delete');

        if (idToDelete === sessionId) {
            // Deleted current session, switch back to welcome screen or another session
            const remainRes = await fetch(`${API_BASE}/api/sessions/user/${userName}`);
            const remaining = await remainRes.json();

            if (remaining.length > 0) {
                switchSession(remaining[0].id);
            } else {
                newChat(); // No sessions left
            }
        } else {
            // Just refresh list
            loadSessions();
        }
        showToast('ลบแชทสำเร็จ', 'success');
    } catch (err) {
        console.error('Error deleting session:', err);
        showToast('ไม่สามารถลบแชทได้', 'error');
    }
}

async function newChat() {
    if (!userName) return;

    try {
        const res = await fetch(`${API_BASE}/api/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userName }),
        });

        const data = await res.json();

        if (!res.ok) {
            if (data.error === 'MAX_SESSIONS_REACHED') {
                showToast('คุณมีเซสชันสูงสุด 3 แชทแล้ว กรุณาลบแชทเก่าออกก่อน', 'error', 5000);
            } else {
                throw new Error('Failed to create session');
            }
            return;
        }

        sessionId = data.id;
        saveSession();
        chatMessages.innerHTML = '';
        addWelcomeMessage();
        loadSessions();

        if (window.innerWidth <= 1024) {
            closeSidebar();
        }
    } catch (err) {
        console.error('New chat error:', err);
        showToast('ไม่สามารถสร้างแชทใหม่ได้', 'error');
    }
}

// ─── Init ───────────────────────────────────────

(async function init() {
    // Try to restore previous session
    const restored = await tryRestoreSession();
    if (!restored) {
        nameInput.focus();
    }
})();
