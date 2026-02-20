const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { initDB, createSession, saveMessage, getHistory, getAllSessions, searchLogs, deleteSession } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ─── Available AI Models ──────────────────────────────────

const AVAILABLE_MODELS = [
    { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', description: 'Most capable OpenAI model' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', description: 'Fast & affordable' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', description: 'Excellent reasoning' },
    { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic', description: 'Fast & lightweight' },
    { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', provider: 'Google', description: 'Large context window' },
    { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5', provider: 'Google', description: 'Ultra-fast responses' },
    { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', provider: 'Meta', description: 'Open-source powerhouse' },
    { id: 'mistralai/mistral-large', name: 'Mistral Large', provider: 'Mistral', description: 'Strong multilingual' },
];

// ─── API Routes ───────────────────────────────────────────

// Create a new session (when user enters their name)
app.post('/api/session', async (req, res) => {
    try {
        const { userName } = req.body;
        if (!userName || !userName.trim()) {
            return res.status(400).json({ error: 'userName is required' });
        }
        const session = await createSession(userName.trim());
        console.log(`📋 New session: ${session.id} for "${userName.trim()}"`);
        res.json(session);
    } catch (err) {
        console.error('Error creating session:', err);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// Chat endpoint — receives message, logs it, calls n8n, logs response, returns it
app.post('/api/chat', async (req, res) => {
    try {
        const { sessionId, message, model } = req.body;
        if (!sessionId || !message) {
            return res.status(400).json({ error: 'sessionId and message are required' });
        }

        // Validate model if provided
        const selectedModel = model && AVAILABLE_MODELS.find(m => m.id === model)
            ? model
            : (process.env.DEFAULT_MODEL || 'openai/gpt-4o');

        // 1. Save user message to DB
        await saveMessage(sessionId, 'user', message);

        // 2. Get conversation history for context
        const history = await getHistory(sessionId);

        // 3. Call n8n webhook (or fallback to direct OpenRouter call)
        let aiResponse;
        try {
            aiResponse = await callN8N(message, history, selectedModel);
        } catch (n8nErr) {
            console.warn('⚠️  n8n webhook failed, falling back to direct OpenRouter call:', n8nErr.message);
            aiResponse = await callOpenRouterDirect(message, history, selectedModel);
        }

        // 4. Save assistant response to DB
        await saveMessage(sessionId, 'assistant', aiResponse);

        console.log(`💬 [${selectedModel}] Session ${sessionId}: "${message.substring(0, 50)}..." → response received`);
        res.json({ response: aiResponse, model: selectedModel });
    } catch (err) {
        console.error('Error in chat:', err);
        res.status(500).json({ error: 'Failed to process message' });
    }
});

// Get conversation history
app.get('/api/history/:sessionId', async (req, res) => {
    try {
        const history = await getHistory(req.params.sessionId);
        res.json(history);
    } catch (err) {
        console.error('Error getting history:', err);
        res.status(500).json({ error: 'Failed to get history' });
    }
});

// ─── Admin Authentication ─────────────────────────────────

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'cyber_admin_2026';
const adminTokens = new Set(); // In-memory token store

// Login endpoint — returns a token
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token = crypto.randomUUID();
        adminTokens.add(token);
        // Auto-expire token after 8 hours
        setTimeout(() => adminTokens.delete(token), 8 * 60 * 60 * 1000);
        console.log(`🔐 Admin login successful`);
        res.json({ token });
    } else {
        console.warn(`⚠️  Failed admin login attempt`);
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Middleware to verify admin token
function requireAdmin(req, res, next) {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token && adminTokens.has(token)) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized — admin login required' });
}

// Get all sessions (admin view — protected)
app.get('/api/sessions', requireAdmin, async (req, res) => {
    try {
        const sessions = await getAllSessions();
        res.json(sessions);
    } catch (err) {
        console.error('Error getting sessions:', err);
        res.status(500).json({ error: 'Failed to get sessions' });
    }
});

// Delete a session (admin — protected)
app.delete('/api/sessions/:id', requireAdmin, async (req, res) => {
    try {
        const deleted = await deleteSession(req.params.id);
        if (deleted) {
            console.log(`🗑️  Admin deleted session ${req.params.id}`);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Session not found' });
        }
    } catch (err) {
        console.error('Error deleting session:', err);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

// Get available AI models
app.get('/api/models', (req, res) => {
    res.json(AVAILABLE_MODELS);
});

// Search sessions and messages (admin search — protected)
app.get('/api/search', requireAdmin, async (req, res) => {
    try {
        const { userName, dateFrom, dateTo, content } = req.query;
        const results = await searchLogs({ userName, dateFrom, dateTo, content });
        res.json(results);
    } catch (err) {
        console.error('Error searching logs:', err);
        res.status(500).json({ error: 'Failed to search logs' });
    }
});

// Serve admin page (the page itself loads, but data requires auth)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'admin.html'));
});

// ─── n8n Webhook Call ─────────────────────────────────────

async function callN8N(message, history, model) {
    const webhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/cyber-chat';

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, model }),
    });

    if (!response.ok) {
        throw new Error(`n8n returned ${response.status}`);
    }

    const data = await response.json();
    return data.response || data.output || data.text || JSON.stringify(data);
}

// ─── Direct OpenRouter Fallback ───────────────────────────

const SYSTEM_PROMPT = `คุณคือ CyberGuard ผู้ช่วย AI ด้านความปลอดภัยทางไซเบอร์ที่เป็นมิตรและเข้าถึงได้ง่าย ภารกิจของคุณคือช่วยให้คนทั่วไปชาวไทยเข้าใจเรื่องความปลอดภัยทางไซเบอร์

กฎการตอบ:
- ตอบเป็นภาษาไทยเสมอ ไม่ว่าผู้ใช้จะถามเป็นภาษาอะไรก็ตาม
- อธิบายทุกอย่างด้วยภาษาไทยง่ายๆ ที่คนทั่วไปเข้าใจได้ ไม่ใช้ศัพท์เทคนิค
- หากต้องใช้คำศัพท์เทคนิค ให้อธิบายความหมายทันทีด้วยภาษาที่เข้าใจง่าย
- ใช้การเปรียบเทียบกับสิ่งของในชีวิตประจำวัน เช่น ประตูบ้าน กุญแจ ตู้จดหมาย
- พูดด้วยน้ำเสียงที่อบอุ่น เป็นกันเอง และให้กำลังใจ เพราะความปลอดภัยทางไซเบอร์อาจดูน่ากลัว
- ตอบให้กระชับ (2-4 ย่อหน้า เว้นแต่ผู้ใช้ต้องการรายละเอียดเพิ่มเติม)
- เมื่อให้คำแนะนำ ให้ใช้ขั้นตอนที่ชัดเจนและปฏิบัติได้จริง
- หากมีคำถามเกี่ยวกับสิ่งผิดกฎหมายหรืออันตราย ปฏิเสธอย่างสุภาพและเปลี่ยนเรื่อง
- ส่งเสริมนิสัยความปลอดภัยที่ดีโดยไม่ตัดสินผู้ใช้`;

async function callOpenRouterDirect(message, history, selectedModel) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

    const model = selectedModel || process.env.DEFAULT_MODEL || 'openai/gpt-4o';

    // Build messages array with history
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

    // Add recent conversation history (last 20 messages for context)
    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content });
    }

    // If the latest message isn't already included in history
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== message) {
        messages.push({ role: 'user', content: message });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'CyberGuard Chatbot',
        },
        body: JSON.stringify({
            model,
            messages,
            max_tokens: 1024,
            temperature: 0.7,
        }),
    });

    if (!response.ok) {
        const errData = await response.text();
        throw new Error(`OpenRouter error ${response.status}: ${errData}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'I apologize, but I could not generate a response. Please try again.';
}

// ─── Start Server ─────────────────────────────────────────

const PORT = process.env.PORT || 3000;

async function start() {
    try {
        await initDB();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🛡️  CyberGuard Backend running on http://localhost:${PORT}`);
            console.log(`📂 Frontend served at http://localhost:${PORT}`);
            console.log(`⚙️  n8n dashboard at http://localhost:5678\n`);
        });
    } catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
}

start();
