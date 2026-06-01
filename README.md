# NEXUS — AI Context Engine for Distributed Teams

> Stop searching. Start knowing.

Built for Microsoft Build AI Hackathon 2025 | Theme: AI at Work: Productivity & Teamwork Reimagined

---

## What it does

NEXUS eliminates context debt in distributed teams. It continuously ingests team 
communication across Slack, Jira, GitHub, and Outlook, builds a semantic knowledge 
graph, and lets anyone ask natural language questions with source-cited answers — 
plus a personalized AI morning brief delivered every morning.

## Live Demo
[your-deployed-url]

## Video
[your-loom-url]

---

## The Three Agents

**Ingestion Agent** — polls all connected tools, extracts decisions, blockers, 
owners, and deadlines, embeds them, and stores in the knowledge graph.

**Retrieval Agent** — handles user questions using RAG. Returns a direct answer 
with a blue source citation badge linking to the original message or document.

**Brief Agent** — runs every morning per user, scans overnight activity, and 
generates a personalized action summary.

---

## Architecture
Slack / Jira / GitHub / Outlook
↓
Ingestion Agent
↓
Knowledge Graph (SQLite + Embeddings)
↙        ↘
Retrieval       Brief
Agent         Agent
↓             ↓
Chat UI         Email

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | OpenAI GPT-4o |
| Backend | Python + FastAPI |
| Frontend | HTML + CSS + JavaScript |
| Database | SQLite |
| Server | Node.js (app.js) |

## Setup

```bash
# Clone
git clone https://github.com/Pradhyut21/Collabflow

# Create env file
cp .env.example .env
# Add your API keys to .env

# Install Python packages
pip install -r requirements.txt

# Start (Windows)
start.bat
```

## Environment Variables
OPENAI_API_KEY=
PORT=5174
SECRET_KEY=

## Team
Pradhyut21
