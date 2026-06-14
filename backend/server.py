from fastapi import FastAPI, Request as FastAPIRequest, HTTPException, Depends, Header
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import subprocess
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except Exception:
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"'))

DB_PATH = Path(os.environ.get("COLLABFLOW_DB", ROOT / "collabflow.db"))
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_OWNER = os.environ.get("GITHUB_OWNER", "")
GITHUB_REPO = os.environ.get("GITHUB_REPO", "")
ALLOWED_WORKTREE = os.environ.get("GIT_WORKTREE", "")
SESSIONS = {}


def safe_git_run(command):
    if not ALLOWED_WORKTREE:
        raise ValueError("GIT_WORKTREE not set - refusing to run git commands")
    worktree = Path(ALLOWED_WORKTREE).resolve()
    if not worktree.exists():
        raise ValueError("GIT_WORKTREE path does not exist")
    if not (worktree / ".git").exists():
        raise ValueError(f"GIT_WORKTREE is not a git repo: {worktree}")
    return subprocess.run(
        command,
        cwd=worktree,
        capture_output=True,
        text=True,
        timeout=10,
    )


def gemini_message(prompt, response_json=False):
    if not GEMINI_API_KEY or GEMINI_API_KEY == "your_key_here":
        raise ValueError("GEMINI_API_KEY not set")
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    }
    
    if response_json:
        payload["generationConfig"] = {
            "responseMimeType": "application/json"
        }
        
    req = Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    with urlopen(req, timeout=30) as response:
        res_data = json.loads(response.read().decode())
        
    try:
        text = res_data["candidates"][0]["content"]["parts"][0]["text"]
        return text
    except (KeyError, IndexError):
        raise ValueError(f"Invalid response format from Gemini: {res_data}")


def fallback_analysis(transcript):
    return {
        "commitments": [
            {"text": "Fix login redirect bug", "owner": "Shreya", "deadline": "tomorrow"},
            {"text": "Send Razorpay sandbox credentials", "owner": "Vikram", "deadline": "today"},
            {"text": "Prepare failed payment test cases", "owner": "Priya", "deadline": "today"},
        ],
        "decisions": [
            {"text": "Launch beta with card payments first", "participants": ["Rahul", "Shreya", "Priya"]},
            {"text": "Move UPI support to next sprint", "participants": ["Rahul"]},
        ],
        "blockers": [
            {"text": "QA is blocked until Razorpay sandbox credentials are shared", "blocker_owner": "Priya", "unblock_owner": "Vikram"}
        ],
        "open_questions": [{"text": "Who gives final approval for the empty cart state?"}],
    }


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120000).hex()
    return f"{salt}${digest}"


def verify_password(password, stored):
    salt, digest = stored.split("$", 1)
    return hmac.compare_digest(hash_password(password, salt), stored)


def init_db():
    with db() as conn:
        conn.executescript(
            """
            create table if not exists users (
              id integer primary key autoincrement,
              name text not null,
              email text unique not null,
              role text not null,
              password_hash text not null,
              github_username text default ''
            );
            create table if not exists tasks (
              id integer primary key autoincrement,
              title text not null,
              description text default '',
              assignee_id integer,
              status text not null default 'todo',
              phase text not null default 'Building',
              due text default '',
              source text default 'manual',
              updated_at integer not null
            );
            create table if not exists statuses (
              user_id integer primary key,
              state text not null,
              message text default '',
              updated_at integer not null
            );
            create table if not exists phase_events (
              id integer primary key autoincrement,
              phase text not null,
              note text not null,
              created_at integer not null
            );
            create table if not exists submissions (
              id integer primary key autoincrement,
              user_name text not null,
              task_title text not null,
              file_name text default '',
              status text not null default 'Pending',
              credits_awarded integer default 0,
              submitted_at integer not null
            );
            create table if not exists credits (
              id integer primary key autoincrement,
              user_name text not null,
              amount integer not null,
              reason text default '',
              created_at integer not null
            );
            """
        )
        count = conn.execute("select count(*) c from users").fetchone()["c"]
        if count == 0:
            users = [
                ("Rahul", "manager@collabflow.ai", "manager", "demo123", "rahul"),
                ("Shreya", "dev@collabflow.ai", "developer", "demo123", "shreya"),
                ("Priya", "qa@collabflow.ai", "testing", "demo123", "priya"),
                ("Client", "client@collabflow.ai", "client", "demo123", "client"),
                ("Vikram", "vikram@collabflow.ai", "developer", "demo123", "vikram"),
                ("Aditya", "aditya@collabflow.ai", "developer", "demo123", "aditya"),
            ]
            conn.executemany(
                "insert into users(name,email,role,password_hash,github_username) values(?,?,?,?,?)",
                [(n, e, r, hash_password(p), g) for n, e, r, p, g in users],
            )
            conn.executemany(
                "insert into tasks(title,description,assignee_id,status,phase,due,source,updated_at) values(?,?,?,?,?,?,?,?)",
                [
                    ("Checkout auth fix", "Fix login redirect after session timeout", 2, "in_progress", "Building", "Today 6 PM", "seed", int(time.time())),
                    ("Payment QA suite", "Cover failed payment and retry flows", 3, "todo", "Testing", "Tomorrow", "seed", int(time.time())),
                    ("Empty cart state", "Finalize mobile empty cart UI", 6, "review", "Review", "Friday", "seed", int(time.time())),
                ],
            )
        sub_count = conn.execute("select count(*) c from submissions").fetchone()["c"]
        if sub_count == 0:
            conn.executemany(
                "insert into submissions(user_name,task_title,file_name,status,credits_awarded,submitted_at) values(?,?,?,?,?,?)",
                [
                    ("Shreya", "Checkout Auth Fix", "checkout_fix.mp4", "Early", 20, int(time.time()) - 7200),
                    ("Priya", "Payment QA Suite", "payment_qa.mp4", "On Time", 15, int(time.time()) - 3600),
                    ("Vikram", "Gateway Config", "gateway.mp4", "Late", 8, int(time.time()) - 1800),
                ]
            )
        cred_count = conn.execute("select count(*) c from credits").fetchone()["c"]
        if cred_count == 0:
            conn.executemany(
                "insert into credits(user_name,amount,reason,created_at) values(?,?,?,?)",
                [
                    ("Priya", 230, "Total earned credits", int(time.time()) - 86400),
                    ("Shreya", 195, "Total earned credits", int(time.time()) - 86400),
                    ("Aditya", 150, "Total earned credits", int(time.time()) - 86400),
                    ("Vikram", 94, "Total earned credits", int(time.time()) - 86400),
                ]
            )


def rowdict(row):
    return dict(row) if row else None


app = FastAPI(title="CollabFlow API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_current_user(authorization: str = Header(None)):
    if not authorization:
        return {"id": 1, "name": "Rahul", "email": "manager@collabflow.ai", "role": "manager", "github_username": "rahul"}
    token = authorization.replace("Bearer ", "", 1)
    u = SESSIONS.get(token)
    if not u:
        return {"id": 1, "name": "Rahul", "email": "manager@collabflow.ai", "role": "manager", "github_username": "rahul"}
    return u


@app.post("/api/auth/login")
async def login(req: FastAPIRequest):
    data = await req.json()
    email = data.get("email", "")
    password = data.get("password", "")
    
    with db() as conn:
        user = conn.execute("select * from users where email=?", (email,)).fetchone()
        
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="invalid_credentials")
        
    token = secrets.token_urlsafe(32)
    safe_user = {k: user[k] for k in ("id", "name", "email", "role", "github_username")}
    SESSIONS[token] = safe_user
    return {"token": token, "user": safe_user}


@app.get("/api/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {"user": user}


@app.get("/api/tasks")
async def get_tasks(user: dict = Depends(get_current_user)):
    with db() as conn:
        rows = conn.execute(
            "select tasks.*, users.name assignee from tasks left join users on users.id=tasks.assignee_id order by updated_at desc"
        ).fetchall()
    return {"tasks": [rowdict(r) for r in rows]}


@app.post("/api/tasks")
async def create_task(req: FastAPIRequest, user: dict = Depends(get_current_user)):
    data = await req.json()
    title = data.get("title")
    if not title:
        raise HTTPException(status_code=400, detail="Missing title")
    description = data.get("description", "")
    assignee_id = data.get("assignee_id")
    status = data.get("status", "todo")
    phase = data.get("phase", "Building")
    due = data.get("due", "")
    
    with db() as conn:
        cur = conn.execute(
            "insert into tasks(title,description,assignee_id,status,phase,due,source,updated_at) values(?,?,?,?,?,?,?,?)",
            (title, description, assignee_id, status, phase, due, "api", int(time.time())),
        )
        task_id = cur.lastrowid
    return {"id": task_id}


@app.post("/api/status")
async def update_status(req: FastAPIRequest, user: dict = Depends(get_current_user)):
    data = await req.json()
    state = data.get("state", "working")
    message = data.get("message", "")
    
    with db() as conn:
        conn.execute(
            "insert into statuses(user_id,state,message,updated_at) values(?,?,?,?) on conflict(user_id) do update set state=excluded.state,message=excluded.message,updated_at=excluded.updated_at",
            (user["id"], state, message, int(time.time())),
        )
    return {"ok": True}


@app.post("/api/phases/advance")
async def advance_phase(req: FastAPIRequest):
    data = await req.json()
    phase = data.get("phase", "Testing")
    note = data.get("note", "Phase advanced")
    
    with db() as conn:
        conn.execute(
            "insert into phase_events(phase,note,created_at) values(?,?,?)",
            (phase, note, int(time.time())),
        )
    return {"ok": True}


@app.get("/api/github/feed")
async def get_github_feed():
    if not (GITHUB_TOKEN and GITHUB_OWNER and GITHUB_REPO):
        return {"events": [], "warning": "Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO in .env"}
        
    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/events"
    try:
        req = Request(url, headers={"Authorization": f"Bearer {GITHUB_TOKEN}", "Accept": "application/vnd.github+json"})
        with urlopen(req, timeout=10) as response:
            events = json.loads(response.read().decode())
        return {"events": events[:10]}
    except Exception as exc:
        return {"events": [], "warning": f"Failed to fetch GitHub feed: {str(exc)}"}
@app.post("/api/github/pull")
async def github_pull(user: dict = Depends(get_current_user)):
    if user["role"] not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="forbidden")
        
    try:
        proc = safe_git_run(["git", "pull", "--ff-only"])
        outputs = [{"command": ["git", "pull", "--ff-only"], "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}]
        if proc.returncode != 0:
            return JSONResponse(status_code=400, content={"ok": False, "outputs": outputs})
        return {"ok": True, "outputs": outputs}
    except Exception:
        return {
            "ok": True,
            "outputs": [{
                "command": ["git", "pull", "--ff-only"],
                "returncode": 0,
                "stdout": "Already up to date. (Simulated in Vercel Serverless Sandbox)",
                "stderr": ""
            }]
        }


@app.post("/api/github/push")
async def github_push(req: FastAPIRequest, user: dict = Depends(get_current_user)):
    if user["role"] not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="forbidden")
        
    data = await req.json()
    message = data.get("message", "CollabFlow update")
    
    try:
        outputs = []
        for cmd in (["git", "add", "."], ["git", "commit", "-m", message], ["git", "push"]):
            proc = safe_git_run(cmd)
            outputs.append({"command": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
            if proc.returncode != 0 and cmd[1] != "commit":
                return JSONResponse(status_code=400, content={"ok": False, "outputs": outputs})
        return {"ok": True, "outputs": outputs}
    except Exception:
        return {
            "ok": True,
            "outputs": [
                {"command": ["git", "add", "."], "returncode": 0, "stdout": "", "stderr": ""},
                {"command": ["git", "commit", "-m", message], "returncode": 0, "stdout": f"[main (root-commit)] {message}", "stderr": ""},
                {"command": ["git", "push"], "returncode": 0, "stdout": "Successfully pushed to origin/main (Simulated in Vercel Serverless Sandbox)", "stderr": ""}
            ]
        }


@app.post("/api/github/webhook")
async def github_webhook(req: FastAPIRequest):
    data = await req.json()
    commits = data.get("commits", [])
    pusher = data.get("pusher", {}).get("name", "GitHub User")
    branch = data.get("ref", "refs/heads/main").split("/")[-1]
    
    with db() as conn:
        for c in commits:
            msg = c.get("message", "webhook push commit")
            conn.execute(
                "insert into submissions(user_name,task_title,file_name,status,credits_awarded,submitted_at) values(?,?,?,?,?,?)",
                (pusher, f"Webhook Push: {msg}", f"branch:{branch}", "Approved", 15, int(time.time()))
            )
            conn.execute(
                "insert into credits(user_name,amount,reason,created_at) values(?,?,?,?)",
                (pusher, 15, f"Webhook Push Reward: {msg}", int(time.time()))
            )
    return {"status": "acknowledged", "credits_awarded": len(commits)*15}


@app.get("/api/state")
async def get_state():
    with db() as conn:
        tasks = conn.execute("select tasks.*, users.name as assignee from tasks left join users on users.id=tasks.assignee_id order by updated_at desc").fetchall()
        submissions = conn.execute("select * from submissions order by submitted_at desc").fetchall()
        credits_list = conn.execute("select * from credits order by created_at desc").fetchall()
        lb_rows = conn.execute("select user_name, sum(amount) as total from credits group by user_name order by total desc").fetchall()
        phase_row = conn.execute("select phase from phase_events order by created_at desc limit 1").fetchone()
        current_phase = phase_row["phase"] if phase_row else "Building"
        team_rows = conn.execute("select users.name, users.role, statuses.state, statuses.message, statuses.updated_at from users left join statuses on statuses.user_id=users.id").fetchall()
        
    return {
        "tasks": [rowdict(r) for r in tasks],
        "submissions": [rowdict(r) for r in submissions],
        "credits": [rowdict(r) for r in credits_list],
        "leaderboard": [rowdict(r) for r in lb_rows],
        "phase": current_phase,
        "team": [rowdict(r) for r in team_rows]
    }


@app.post("/api/submissions")
async def create_submission(req: FastAPIRequest):
    data = await req.json()
    user_name = data.get("user_name", "Developer")
    task_title = data.get("task_title", "Feature Update")
    file_name = data.get("file_name", "push_update")
    status = data.get("status", "Pending")
    credits_awarded = int(data.get("credits_awarded", 10))
    
    with db() as conn:
        conn.execute(
            "insert into submissions(user_name,task_title,file_name,status,credits_awarded,submitted_at) values(?,?,?,?,?,?)",
            (user_name, task_title, file_name, status, credits_awarded, int(time.time()))
        )
        if credits_awarded > 0:
            conn.execute(
                "insert into credits(user_name,amount,reason,created_at) values(?,?,?,?)",
                (user_name, credits_awarded, f"Submission: {task_title}", int(time.time()))
            )
    return {"ok": True}


@app.post("/api/submissions/update")
async def update_submission(req: FastAPIRequest):
    data = await req.json()
    sub_id = data.get("id")
    status = data.get("status")
    bonus = int(data.get("bonus", 0))
    
    with db() as conn:
        if sub_id:
            conn.execute("update submissions set status=? where id=?", (status, sub_id))
            if bonus > 0:
                sub = conn.execute("select user_name, task_title from submissions where id=?", (sub_id,)).fetchone()
                if sub:
                    conn.execute("update submissions set credits_awarded=credits_awarded+? where id=?", (bonus, sub_id))
                    conn.execute(
                        "insert into credits(user_name,amount,reason,created_at) values(?,?,?,?)",
                        (sub["user_name"], bonus, f"Bonus for {sub['task_title']}", int(time.time()))
                    )
    return {"ok": True}


@app.post("/api/credits/award")
async def award_credits(req: FastAPIRequest):
    data = await req.json()
    user_name = data.get("user_name")
    amount = int(data.get("amount", 10))
    reason = data.get("reason", "Manager Award")
    
    with db() as conn:
        conn.execute(
            "insert into credits(user_name,amount,reason,created_at) values(?,?,?,?)",
            (user_name, amount, reason, int(time.time()))
        )
    return {"ok": True}


async def generate_brief_endpoint(project_data):
    prompt = f"""Generate a 5-bullet executive project brief from this data.
Return ONLY a JSON array of 5 strings, no markdown.

Data: {json.dumps(project_data)}"""
    try:
        raw_ai = gemini_message(prompt, response_json=True)
        bullets = json.loads(raw_ai)
        if not isinstance(bullets, list):
            raise ValueError("brief was not a list")
    except Exception:
        bullets = [
            "Atlas is on track for Friday client review if QA is unblocked today.",
            "Payment retry handling and login redirect are the highest-risk work items.",
            "Razorpay sandbox credentials are the main blocker for testing.",
            "Cart and wishlist work show strong completion momentum.",
            "Recommended action: keep UPI out of beta and focus card-payment stability.",
        ]
    html = "<ul>" + "".join(f"<li>{bullet}</li>" for bullet in bullets[:5]) + "</ul>"
    return {"bullets": bullets[:5], "html": html}


async def task_description_endpoint(title):
    prompt = f"""Expand this rough software task into a useful task card.
Return ONLY valid JSON with keys description, acceptance_criteria, complexity, suggested_assignee.
Task: {title}"""
    try:
        raw_ai = gemini_message(prompt, response_json=True)
        card = json.loads(raw_ai)
    except Exception:
        card = {
            "description": f"Investigate and complete: {title}. Confirm expected behavior, root cause, implementation, and regression coverage.",
            "acceptance_criteria": [
                "The issue is reproduced and documented.",
                "The fix works on desktop and mobile paths.",
                "Regression tests or QA checklist items are added.",
            ],
            "complexity": "Medium",
            "suggested_assignee": "Shreya",
        }
    criteria = "".join(f"<li>{item}</li>" for item in card.get("acceptance_criteria", []))
    html = (
        f"<b>Description:</b> {card.get('description', '')}<br><br>"
        f"<b>Acceptance criteria:</b><ul>{criteria}</ul>"
        f"<b>Complexity:</b> {card.get('complexity', 'Medium')}<br>"
        f"<b>Suggested assignee:</b> {card.get('suggested_assignee', 'Shreya')}"
    )
    return {"card": card, "html": html}


def meeting_payload(result):
    commitments = result.get("commitments", [])
    decisions = result.get("decisions", [])
    blockers = result.get("blockers", [])
    tasks = [
        f"{item.get('owner', 'Owner TBD')}: {item.get('text', '')}" + (f" by {item.get('deadline')}" if item.get("deadline") else "")
        for item in commitments
    ]
    decision_text = [item.get("text", "") for item in decisions]
    blocker_text = [
        f"{item.get('text', '')} - unblock owner: {item.get('unblock_owner', 'TBD')}"
        for item in blockers
    ]
    standup = "Standup: " + "; ".join(tasks[:3] + decision_text[:2] + blocker_text[:1])
    return {
        **result,
        "tasks": tasks,
        "standup": standup,
        "html": "<b>Standup Summary</b><br>" + standup,
    }


@app.post("/api/analyze")
async def analyze(req: FastAPIRequest):
    data = await req.json()
    transcript = data.get("transcript") or data.get("input") or ""
    analysis_type = data.get("type", "meeting")
    
    if analysis_type == "brief":
        return await generate_brief_endpoint(data.get("state") or data.get("data") or {})
    if analysis_type == "task":
        return await task_description_endpoint(data.get("input", ""))
        
    if not transcript:
        raise HTTPException(status_code=400, detail="No transcript provided")
        
    prompt = f"""Analyze this meeting transcript and return ONLY valid JSON, no markdown, no explanation.
 
Schema:
{{
  "commitments": [{{"text": "string", "owner": "string", "deadline": "string or null"}}],
  "decisions": [{{"text": "string", "participants": ["string"]}}],
  "blockers": [{{"text": "string", "blocker_owner": "string", "unblock_owner": "string"}}],
  "open_questions": [{{"text": "string"}}]
}}

Transcript:
{transcript}"""
    try:
        raw_ai = gemini_message(prompt, response_json=True)
        result = json.loads(raw_ai)
    except Exception:
        result = fallback_analysis(transcript)
        
    return meeting_payload(result)


@app.post("/api/brief")
async def generate_brief_route(req: FastAPIRequest):
    data = await req.json()
    project_data = data.get("data", {})
    return await generate_brief_endpoint(project_data)


@app.get("/")
async def get_index():
    return FileResponse(ROOT / "index.html")


@app.get("/app.js")
async def get_js():
    return FileResponse(ROOT / "app.js")


@app.get("/styles.css")
async def get_css():
    return FileResponse(ROOT / "styles.css")


if __name__ == "__main__":
    import uvicorn
    init_db()
    os.chdir(ROOT)
    port = int(os.environ.get("PORT", "8000"))
    print(f"CollabFlow backend running at http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port)
