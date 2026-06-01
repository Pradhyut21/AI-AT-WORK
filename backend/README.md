# CollabFlow Backend

SETUP (one time):

```powershell
cd "D:\MICRO SOFT\collabflow"
pip install -r requirements.txt
```

Add your `ANTHROPIC_API_KEY` to `.env`.

START THE APP:

Double-click `start.bat`

OR

```powershell
cd "D:\MICRO SOFT\collabflow"
python backend\server.py
```

OPEN IN BROWSER:

```text
http://127.0.0.1:8000/index.html
```

DEMO LOGINS:

- manager@collabflow.ai / demo123
- dev@collabflow.ai / demo123
- qa@collabflow.ai / demo123
- client@collabflow.ai / demo123

GITHUB (optional, skip for demo):

Set `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, and `GIT_WORKTREE` in `.env`.

```powershell
$env:GITHUB_TOKEN="github_pat_..."
$env:GITHUB_OWNER="your-org-or-user"
$env:GITHUB_REPO="your-repo"
$env:GIT_WORKTREE="D:\path\to\your\repo"
python backend\server.py
```

The `/api/github/pull` and `/api/github/push` endpoints run git commands in `GIT_WORKTREE`. Only use a repo path you trust.
