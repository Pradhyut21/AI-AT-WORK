# CollabFlow — AI Project Intelligence Platform for Distributed Teams

> Stop searching. Start knowing.

Built for **Microsoft Build AI Hackathon 2025** | Theme: **AI at Work: Productivity & Teamwork Reimagined**

**Live Demo URL:** [collabflow-wheat.vercel.app](https://collabflow-wheat.vercel.app/)

---

## What the Project Does

CollabFlow is an AI-powered project intelligence platform designed to eliminate context debt and alignment gaps in distributed teams.

1. **AI Meeting Analyzer**  
   Paste any meeting transcript or standup notes. Using Google Gemini 2.5 Flash, the platform automatically extracts all action items/tasks, key decisions, and blockers, and generates a structured, Slack-ready team standup brief.

2. **Manager Dashboard**  
   Provides project leaders with live sprint progress tracking, team member status indicators, Git commit feeds, and a daily executive AI project brief grounded directly in task completion metrics and submission histories.

3. **Developer Dashboard**  
   Empowers developers with AI-generated task descriptions (complete with acceptance criteria, complexity scores, and recommended owners), personal action-item checklists, and an integrated submission tracker to log code delivery.

---

## Architecture Flow

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

- `GEMINI_API_KEY`: Your Google Gemini API Key (required for live AI analysis and briefs).
- `PORT`: The port number on which the backend server will run (default is `8000`).
- `SECRET_KEY`: Used for session authentication signing.

---

*Stop searching. Start knowing.*
