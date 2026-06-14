# CollabFlow — AI Project Intelligence Platform for Distributed Teams

> Stop searching. Start knowing.

**Microsoft Build AI Hackathon 2025 | Theme: AI at Work**

## Live Demo
https://collabflow-wheat.vercel.app/

---

## What it does

CollabFlow eliminates the biggest hidden cost in distributed teamwork —
the hours lost every week to missed context, forgotten decisions, and
tasks that fell through the cracks after a call. Three AI-powered layers
fix this permanently.

**AI Meeting Analyzer**
Paste any meeting transcript. Gemini 2.5 Flash extracts every task,
decision, and blocker in validated structured JSON using native JSON
Schema Output Mode — then generates a complete Slack-ready standup
brief in seconds.

**Manager Dashboard**
Live sprint progress, team member status, GitHub commit feed, and a
daily AI brief grounded in real task and submission data — not a
generic summary.

**Developer Dashboard**
AI-generated task descriptions, personal submission tracker, and
individual action items so nothing falls through the cracks.

---

## Architecture

```
Meeting Transcript / Team Data
       ↓
FastAPI Backend (Python + Uvicorn)
       ↓
Gemini 2.5 Flash API (JSON Schema Mode)
       ↓
Structured Tasks + Decisions + Standup Brief
       ↓
Manager Dashboard / Developer Dashboard / Slack Brief
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **LLM** | Google Gemini 2.5 Flash API (JSON Schema Output Mode) |
| **Backend** | Python + FastAPI + Uvicorn |
| **Frontend** | HTML5 + CSS3 (Vanilla CSS) + JavaScript (ES6+) |
| **Database** | SQLite |
| **Deployment** | Vercel (Production Live) |

---

## Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/Pradhyut21/AI-AT-WORK
```

### 2. Configure environment variables
Create a `.env` file from the template:
```bash
cp .env.example .env
```
Open the `.env` file and insert your `GEMINI_API_KEY`.

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Run the local development server
```bash
uvicorn backend.server:app --reload
```

---

## Environment Variables

- `GEMINI_API_KEY`: Your Google Gemini API Key.
- `PORT`: Server port (default: 8000).
- `SECRET_KEY`: Used for session authentication.

---

*Stop searching. Start knowing.*
