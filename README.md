# CyberGuard — AI Cybersecurity Chatbot

A thesis-grade AI chatbot that helps everyday users understand cybersecurity in simple, plain language.

## Architecture

```
Frontend (HTML/CSS/JS) → Express API → n8n Workflow → OpenRouter → AI Response
                              ↕
                         PostgreSQL (session + message logs)
```

## Quick Start

### Prerequisites
- **Docker Desktop** (for PostgreSQL + n8n)
- **Node.js 18+**
- **OpenRouter API Key** ([openrouter.ai](https://openrouter.ai))

### 1. Start Database & n8n
```bash
docker compose up -d
```

### 2. Configure Environment
Copy `.env.example` to `.env` and set your `OPENROUTER_API_KEY`:
```bash
cp .env.example .env
# Edit .env and set your OPENROUTER_API_KEY
```

### 3. Install & Start Backend
```bash
cd backend
npm install
npm start
```

### 4. Open the App
Navigate to **http://localhost:3000** in your browser.

### 5. Set Up n8n Workflow
1. Open **http://localhost:5678** (n8n dashboard)
2. Click **"Import from file"** and select `n8n-workflow.json`
3. In the **Call OpenRouter** node, update the Authorization header with your API key
4. **Activate** the workflow

> **Note:** The app will fallback to direct OpenRouter calls if n8n is not configured, so this step is optional.

## Features

| Feature | Description |
|---------|-------------|
| 🤖 Multi-Model AI | Switch between GPT-4o, Claude, Gemini, Llama, Mistral in real-time |
| 💬 Thai Language | All responses in simple Thai, no technical jargon |
| 🔄 Session Persistence | Refresh the page and your chat is preserved |
| 📊 Admin Dashboard | View all sessions and messages at `/admin` |
| 🔔 Toast Notifications | Elegant error/success feedback (no more alert popups) |
| 🛡️ n8n Integration | Workflow automation with fallback to direct API |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | HTML + CSS + JavaScript |
| Backend API | Node.js + Express |
| Database | PostgreSQL 16 |
| Workflow | n8n |
| AI Gateway | OpenRouter (GPT-4o, Claude, Gemini, Llama, Mistral) |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/session` | POST | Create session (requires `userName`) |
| `/api/chat` | POST | Send message (requires `sessionId`, `message`, optional `model`) |
| `/api/history/:sessionId` | GET | Get conversation history |
| `/api/sessions` | GET | List all sessions |
| `/api/models` | GET | List available AI models |
| `/admin` | GET | Admin analytics dashboard |

## AI Models

The chatbot supports switching between multiple AI providers through OpenRouter:

| Model | Provider | Best For |
|-------|----------|----------|
| GPT-4o | OpenAI | Most capable, general use |
| GPT-4o Mini | OpenAI | Fast & affordable |
| Claude 3.5 Sonnet | Anthropic | Excellent reasoning |
| Claude 3 Haiku | Anthropic | Fast & lightweight |
| Gemini Pro 1.5 | Google | Large context window |
| Gemini Flash 1.5 | Google | Ultra-fast responses |
| Llama 3.1 70B | Meta | Open-source powerhouse |
| Mistral Large | Mistral | Strong multilingual |

Users can switch models from the dropdown in the chat header. The selection is saved in localStorage.
