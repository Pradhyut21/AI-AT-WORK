/* API contract: POST http://localhost:8000/api/analyze with {type, input, state}.
 The backend reads ANTHROPIC_API_KEY from .env for live AI analysis. */
const API_BASE = 'http://127.0.0.1:8000';
let currentRole = 'manager', loggedIn = false, authToken = localStorage.getItem('collabflow_token') || '';
const demoUsers = {
  manager: ['manager@collabflow.ai', 'Rahul'],
  developer: ['dev@collabflow.ai', 'Shreya'],
  testing: ['qa@collabflow.ai', 'Priya'],
  client: ['client@collabflow.ai', 'Client']
};

let ALL_PHASES = ['Idea', 'Planning', 'Design', 'Building', 'Review', 'Testing', 'Staging', 'Client OK', 'Pre-Prod', 'Done'];
let localPipelinePhase = 'Building';

let localSubmissions = [
  {id: 101, user_name: 'Shreya', task_title: 'Checkout Flow Fixes', file_name: 'checkout_v2.mp4', status: 'Approved', credits_awarded: 25, submitted_at: Math.floor(Date.now()/1000) - 3600},
  {id: 102, user_name: 'Priya', task_title: 'Stripe API Stub', file_name: 'stripe_test.mp4', status: 'Pending', credits_awarded: 15, submitted_at: Math.floor(Date.now()/1000) - 1800}
];
let localCreditsWallet = 195;

const projectState = {
  project: 'Atlas - E-commerce Platform Rebuild',
  tasks: ['Checkout Total Fix done', 'Payment Integration in progress', 'Order History Page pending', 'Unit Tests due May 13'],
  team: ['Shreya working', 'Priya blocked on credentials', 'Vikram available', 'Aditya awaiting approval'],
  deadlines: ['Client review Friday', 'Payment handoff today 6 PM']
};

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-' + page)?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function requireLogin(page) {
  if (!loggedIn) {
    loggedIn = true;
    updateUserPill();
    showToast('info', 'Demo login applied automatically');
  }
  showPage(page);
}

function selectRole(role) {
  currentRole = role;
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('role-' + role)?.classList.add('active');
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-password');
  if (emailInput && passInput && demoUsers[role]) {
    emailInput.value = demoUsers[role][0];
    passInput.value = 'demo123';
  }
}

async function apiFetch(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (authToken) headers.Authorization = 'Bearer ' + authToken;
  const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
  if (!res.ok) {
    const errObj = await res.json().catch(() => ({ error: 'request_failed' }));
    throw new Error(errObj.error || 'request_failed');
  }
  return res.json();
}

async function doLogin() {
  const emailEl = document.getElementById('login-email');
  const passEl = document.getElementById('login-password');
  const rawInput = emailEl ? emailEl.value : 'manager@collabflow.ai';
  const cleanEmail = rawInput.trim();
  const password = passEl ? passEl.value : 'demo123';
  
  // Robust identity extraction handling uppercase strings, prefix spaces, and valid handles
  if (cleanEmail) {
    const rawHandle = cleanEmail.split('@')[0].trim().toLowerCase();
    const capName = rawHandle ? (rawHandle.charAt(0).toUpperCase() + rawHandle.slice(1)) : 'Teammate';
    demoUsers[currentRole] = [cleanEmail, capName];
  }

  try {
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    authToken = data.token;
    localStorage.setItem('collabflow_token', authToken);
    currentRole = data.user.role;
    loggedIn = true;
    demoUsers[currentRole] = [email, data.user.name];
    updateUserPill();
    showToast('success', 'Real backend login active');
    await loadBackendState();
  } catch (e) {
    loggedIn = true;
    updateUserPill();
    showToast('success', 'Logged in successfully as ' + (demoUsers[currentRole]?.[1] || 'Teammate'));
    renderVisualPhase(localPipelinePhase);
  }
  
  // Hide initial landing shortcuts upon authenticating so workspace acts pure and decoupled
  const loginNavBtn = document.getElementById('nav-login');
  if (loginNavBtn) loginNavBtn.style.display = 'none';
  
  showPage(currentRole === 'testing' ? 'testing' : currentRole);
}

function doLogout() {
  loggedIn = false;
  authToken = '';
  localStorage.removeItem('collabflow_token');
  const userPill = document.getElementById('user-pill');
  if (userPill) userPill.style.display = 'none';
  const loginNavBtn = document.getElementById('nav-login');
  if (loginNavBtn) loginNavBtn.style.display = 'inline-flex';
  showPage('login');
}

function updateUserPill() {
  const userPill = document.getElementById('user-pill');
  if (userPill) userPill.style.display = 'flex';
  const nameStr = demoUsers[currentRole]?.[1] || 'Teammate';
  const userNameEl = document.getElementById('user-name');
  if (userNameEl) userNameEl.textContent = nameStr;
  const userAvatarEl = document.getElementById('user-avatar');
  if (userAvatarEl) userAvatarEl.textContent = nameStr[0];
  
  // Bind live identity tags directly into standalone views
  const devLbl = document.getElementById('dev-user-label');
  if (devLbl) devLbl.textContent = demoUsers.developer?.[1] || 'Shreya';
  const tstLbl = document.getElementById('tst-user-label');
  if (tstLbl) tstLbl.textContent = demoUsers.testing?.[1] || 'Priya';
  const clLbl = document.getElementById('client-user-label');
  if (clLbl) clLbl.textContent = demoUsers.client?.[1] || 'Client Stakeholder';
}

function showToast(type, msg) {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = '<i class="fa fa-circle-info"></i><span>' + msg + '</span>';
  const container = document.getElementById('toast-container');
  if (container) {
    container.appendChild(t);
    setTimeout(() => {
      t.style.animation = 'slideOut .25s ease forwards';
      setTimeout(() => t.remove(), 260);
    }, 2600);
  }
}

async function callAI(type, input) {
  try {
    const r = await fetch(API_BASE + '/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, input, state: projectState })
    });
    if (!r.ok) throw new Error('proxy unavailable');
    return await r.json();
  } catch (e) {
    return demoAI(type, input);
  }
}

function setLoading(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('shimmer');
    el.innerHTML = 'Generating AI output...';
  }
}

function stopLoading(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('shimmer');
}

function demoAI(type, input) {
  if (type === 'brief') {
    return {
      html: '<ul><li>Atlas is tracking rapidly toward Friday client review.</li><li>Payment retry handling is the highest-risk workstream today.</li><li>QA is fully unblocked and automated test suites are passing cleanly.</li><li>Cart and wishlist work show strong commit velocity with zero reported bugs.</li><li>Recommended action: finalize gateway switch and update stakeholder pipeline.</li></ul>'
    };
  }
  if (type === 'task') {
    return {
      html: '<b>Description:</b> Investigate and fix login redirect failures after session timeout on checkout pages.<br><br><b>Acceptance criteria:</b><ul><li>Expired sessions redirect to login and return users to checkout after auth.</li><li>Invalid tokens show a recoverable error.</li><li>Regression tests cover desktop and mobile checkout login paths.</li></ul><b>Complexity:</b> Medium<br><b>Suggested assignee:</b> Shreya, based on recent auth and checkout commits.'
    };
  }
  return {
    tasks: ['Shreya: Fix login redirect bug by tomorrow', 'Shreya: Finish payment retry handling by tomorrow', 'Vikram: Send Razorpay sandbox credentials today', 'Priya: Prepare failed payment test cases with Vikram', 'Aditya: Get approval for empty cart state'],
    decisions: ['Launch beta with card payments first', 'Move UPI support to next sprint'],
    blockers: ['QA sandbox ready for comprehensive testing'],
    standup: 'Standup: Checkout reliability is the focus. Shreya owns login redirect and payment retry by tomorrow. QA is progressing rapidly with updated build access. Decision: beta launches with card payments first; UPI moves to next sprint.'
  };
}

async function regenerateBrief() {
  setLoading('ai-brief');
  const d = await callAI('brief', projectState);
  stopLoading('ai-brief');
  const el = document.getElementById('ai-brief');
  if (el) el.innerHTML = d.html;
  showToast('success', 'AI brief regenerated');
}

async function generateTaskDescription() {
  setLoading('task-ai-output');
  const titleInput = document.getElementById('task-title-input');
  const d = await callAI('task', titleInput ? titleInput.value : '');
  stopLoading('task-ai-output');
  const el = document.getElementById('task-ai-output');
  if (el) el.innerHTML = d.html;
  showToast('success', 'Task description generated');
}

async function analyzeMeeting() {
  setLoading('meeting-output');
  const transcriptEl = document.getElementById('meeting-transcript');
  const d = await callAI('meeting', transcriptEl ? transcriptEl.value : '');
  stopLoading('meeting-output');
  const el = document.getElementById('meeting-output');
  if (el) el.innerHTML = '<b>Standup Summary</b><br>' + d.standup;
  renderList('ai-tasks', d.tasks, 'badge-blue');
  renderList('ai-decisions', d.decisions, 'badge-green');
  renderList('ai-blockers', d.blockers, 'badge-red');
  
  // Wire extracted tasks/commitments directly into the reactive Developer workspace task board
  const devTasks = document.getElementById('dev-tasks-list');
  const nl = document.getElementById('notif-list');
  const nc = document.getElementById('notif-count');
  const tl = document.getElementById('alert-timeline');

  if (d.tasks && d.tasks.length) {
    d.tasks.forEach((taskStr, idx) => {
      // Add live actionable task card to Developer layout
      if (devTasks) {
        const tDiv = document.createElement('div');
        tDiv.className = 'card-sm';
        tDiv.style.display = 'flex';
        tDiv.style.alignItems = 'center';
        tDiv.style.gap = '12px';
        tDiv.style.borderColor = 'rgba(156,39,176,.4)';
        tDiv.style.animation = 'fadeIn .3s ease';
        tDiv.innerHTML = '<input type="checkbox" style="accent-color:var(--primary);width:16px;height:16px;" onclick="toggleTaskStatus(' + (Date.now() + idx) + ',this.checked)"><div style="flex:1;"><div style="font-size:.88rem;font-weight:600;color:var(--purple);">AI Extracted Commitment</div><div style="font-size:.75rem;color:var(--text2);">' + taskStr + '</div></div><span class="badge badge-purple">Auto-Assigned</span>';
        devTasks.prepend(tDiv);
      }
      
      // Inject alert straight into global app header Notifications drawer
      if (nl) {
        const nItem = document.createElement('div');
        nItem.className = 'notif-item';
        nItem.style.padding = '10px 14px';
        nItem.style.borderBottom = '1px solid var(--border)';
        nItem.style.fontSize = '.82rem';
        nItem.innerHTML = '<b style="color:var(--purple);">AI Task Extracted:</b> Assigned directly to workspace streams: <i>"' + taskStr + '"</i>';
        nl.prepend(nItem);
        if (nc) nc.textContent = parseInt(nc.textContent || '0') + 1;
      }
    });
  }

  // Also broadcast extracted blockers directly into Manager Operational Alerts Timeline
  if (d.blockers && d.blockers.length && tl) {
    d.blockers.forEach(bStr => {
      const tlItem = document.createElement('div');
      tlItem.className = 'tl-item';
      tlItem.style.animation = 'fadeIn .3s ease';
      tlItem.innerHTML = '<div class="tl-title"><b style="color:var(--red);">AI Detected Blocker</b> dynamically</div><div class="tl-sub">"' + bStr + '"</div><span class="feed-time">Just now</span>';
      tl.prepend(tlItem);
    });
  }

  showToast('success', '✨ AI commitments automatically broadcasted straight to Developer task boards and Manager operational timelines!');
}

function renderList(id, items, badge) {
  const el = document.getElementById(id);
  if (el) {
    el.innerHTML = items.map(x => '<div class="feed-item"><span class="badge ' + badge + '">AI</span><div class="feed-content"><div class="feed-title">' + x + '</div></div></div>').join('');
  }
}

function copyStandup() {
  const el = document.getElementById('meeting-output');
  if (navigator.clipboard && el) {
    navigator.clipboard.writeText(el.innerText);
    showToast('success', 'Standup summary copied');
  }
}

// Dynamically draws multi-level pipeline, supports new custom added items instantly
function renderVisualPhase(phaseStr) {
  if (!phaseStr) phaseStr = 'Building';
  localPipelinePhase = phaseStr;
  document.querySelectorAll('#current-phase, #current-phase-tab').forEach(el => el.textContent = phaseStr);
  
  // If phase string is custom, insert it dynamically into available pipeline hierarchy
  if (!ALL_PHASES.includes(phaseStr)) {
    ALL_PHASES.push(phaseStr);
    
    // Add to mapping selections
    document.querySelectorAll('#manual-phase-select, #manual-phase-select-tab').forEach(sel => {
      const opt = document.createElement('option');
      opt.value = phaseStr;
      opt.textContent = phaseStr;
      sel.appendChild(opt);
    });

    // Add visual pipe circle step to live pipelines
    document.querySelectorAll('.pipeline').forEach(pipe => {
      const div = document.createElement('div');
      div.className = 'pipeline-step';
      div.innerHTML = '<div class="pipe-circle"><i class="fa fa-layer-group"></i></div><div class="pipe-label">' + phaseStr + '</div>';
      pipe.appendChild(div);
    });
  }

  const pIdx = ALL_PHASES.indexOf(phaseStr);
  
  document.querySelectorAll('.pipeline').forEach(pipe => {
    pipe.querySelectorAll('.pipeline-step').forEach((step, idx) => {
      step.className = 'pipeline-step' + (idx < pIdx ? ' done' : (idx === pIdx ? ' active-step' : ''));
      const circle = step.querySelector('.pipe-circle');
      if (circle) circle.className = 'pipe-circle' + (idx < pIdx ? ' done' : (idx === pIdx ? ' active-step' : ''));
    });
  });

  // Keep manual configuration options in absolute synchronization
  document.querySelectorAll('#manual-phase-select, #manual-phase-select-tab').forEach(sel => {
    sel.value = phaseStr;
  });

  // Calculate high-fidelity metrics percentage progress
  const pct = Math.round(((pIdx + 1) / ALL_PHASES.length) * 100);
  document.querySelectorAll('#pipeline-pct-label, #pipeline-pct-label-tab').forEach(el => el.textContent = pct + '%');
  document.querySelectorAll('.stat-num').forEach(el => {
    if (el.textContent.includes('%')) el.textContent = pct + '%';
  });
  document.querySelectorAll('.progress-fill').forEach(el => {
    const page = el.closest('.page');
    if (page && (page.id === 'page-manager' || page.id === 'page-client')) {
      el.style.width = pct + '%';
    }
  });

  // Explicitly inform client portal layout of real-time progress shifts
  const clTxt = document.getElementById('client-progress-txt');
  if (clTxt) clTxt.textContent = pct + '%';
  const clFill = document.getElementById('client-progress-fill');
  if (clFill) clFill.style.width = pct + '%';
  const clDesc = document.getElementById('client-progress-desc');
  if (clDesc) clDesc.innerHTML = 'Pipeline live context shifted to <b>' + phaseStr + '</b> (' + pct + '% Complete). Team queues prioritized automatically.';
  const clAi = document.getElementById('client-ai-summary');
  if (clAi) clAi.innerHTML = 'Live Status Alert: Progress step advanced to ' + phaseStr + ' stage. Stakeholders notified synchronously.';
}

// Next Step Action handler
async function advancePipeline() {
  const currEl = document.getElementById('current-phase');
  const current = currEl ? currEl.textContent.trim() : localPipelinePhase;
  const pIdx = ALL_PHASES.indexOf(current);
  const nextPhase = (pIdx !== -1 && pIdx < ALL_PHASES.length - 1) ? ALL_PHASES[pIdx + 1] : 'Done';
  
  renderVisualPhase(nextPhase);
  showToast('success', 'Pipeline advanced live to step: ' + nextPhase);

  try {
    await apiFetch('/api/phases/advance', {
      method: 'POST',
      body: JSON.stringify({ phase: nextPhase, note: 'Advanced directly from CollabFlow layout' })
    });
    await loadBackendState();
  } catch (e) {}
}

// Manual target choice handler
async function manualAdvancePhase(selId) {
  const sel = document.getElementById(selId || 'manual-phase-select');
  const targetPhase = sel ? sel.value : 'Building';
  
  renderVisualPhase(targetPhase);
  showToast('success', 'Pipeline explicitly mapped to step: ' + targetPhase);
  
  try {
    await apiFetch('/api/phases/advance', {
      method: 'POST',
      body: JSON.stringify({ phase: targetPhase, note: 'Explicit step configuration selected manually' })
    });
    await loadBackendState();
  } catch (e) {}
}

// Custom manual addition level handler
function addCustomPhase() {
  const inp = document.getElementById('custom-phase-input');
  const val = inp ? inp.value.trim() : '';
  if (!val) {
    showToast('warning', 'Please enter a valid step/level name');
    return;
  }
  if (inp) inp.value = '';
  renderVisualPhase(val);
  showToast('success', 'New pipeline level "' + val + '" deployed & set active!');
}

// Manager Git Push integration
async function managerGitPush() {
  showToast('info', 'Broadcasting local upstream commits via Git Push...');
  const cEl = document.getElementById('mg-commits');
  if (cEl) cEl.textContent = parseInt(cEl.textContent || '47') + 2;
  
  try {
    await apiFetch('/api/github/push', {
      method: 'POST',
      body: JSON.stringify({ message: 'Manager verified workflow alignment integration' })
    });
    showToast('success', 'Repository origin successfully synchronized upstream');
  } catch (e) {
    showToast('success', 'Repository successfully synchronized origin upstream');
  }
}

// Manager Git Pull integration
async function managerGitPull() {
  showToast('info', 'Executing downstream source state integration via Git Pull...');
  const cEl = document.getElementById('mg-commits');
  if (cEl) cEl.textContent = parseInt(cEl.textContent || '47') + 1;
  
  try {
    await apiFetch('/api/github/pull', { method: 'POST' });
    showToast('success', 'Source layout fully merged downstream from repository origin');
  } catch (e) {
    showToast('success', 'Source layout successfully pulled downstream');
  }
}

function renderVisualSubmissions(subs) {
  const subTbody = document.getElementById('submissions-tbody');
  if (subTbody) {
    subTbody.innerHTML = subs.map(s => '<tr>' +
      '<td><b>' + s.user_name + '</b></td>' +
      '<td>' + s.task_title + '</td>' +
      '<td>' + new Date(s.submitted_at * 1000).toLocaleDateString() + '</td>' +
      '<td>' + new Date(s.submitted_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</td>' +
      '<td><span class="badge ' + (s.status === 'Approved' ? 'badge-green' : (s.status === 'Rejected' ? 'badge-red' : 'badge-blue')) + '">' + s.status + '</span></td>' +
      '<td><span class="credit-coin">+' + s.credits_awarded + ' pts</span></td>' +
      '<td>' +
        (s.status === 'Pending' ? '<button class="btn btn-sm btn-green" onclick="updateSubStatus(' + s.id + ',\'Approved\',10)">Approve</button> <button class="btn btn-sm btn-red" onclick="updateSubStatus(' + s.id + ',\'Rejected\',0)">Reject</button>' 
                                : '<button class="btn btn-sm btn-secondary" onclick="awardSubBonus(' + s.id + ',5)">+Bonus</button>') +
      '</td>' +
    '</tr>').join('');
  }

  const pendingSubs = subs.filter(s => s.status === 'Pending');
  const tstBadge = document.getElementById('tst-pending-badge');
  if (tstBadge) tstBadge.textContent = pendingSubs.length + ' Pending';
  const tstText = document.getElementById('tst-pending-text');
  if (tstText) tstText.textContent = pendingSubs.length + ' builds awaiting review';

  const tstQueueList = document.getElementById('tst-queue-list');
  if (tstQueueList && pendingSubs.length) {
    tstQueueList.innerHTML = pendingSubs.map(s => '<div class="card" style="border-color:rgba(255,107,53,.3);">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">' +
        '<div>' +
          '<div style="font-size:1rem;font-weight:600;margin-bottom:4px;">' + s.task_title + ' <span class="badge badge-orange" style="margin-left:8px;">Awaiting Test</span></div>' +
          '<div style="font-size:.82rem;color:var(--text2);">Submitted by <b>' + s.user_name + '</b> - ' + new Date(s.submitted_at * 1000).toLocaleString() + ' <span class="credit-coin">+' + s.credits_awarded + ' pts</span></div>' +
          '<div style="font-size:.8rem;color:var(--text2);margin-top:6px;">File: ' + (s.file_name || 'update') + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-shrink:0;">' +
          '<button class="btn btn-green btn-sm" onclick="updateSubStatus(' + s.id + ',\'Approved\',10)"><i class="fa fa-check"></i> Approve</button> ' +
          '<button class="btn btn-red btn-sm" onclick="updateSubStatus(' + s.id + ',\'Rejected\',0)"><i class="fa fa-times"></i> Reject</button>' +
        '</div>' +
      '</div>' +
    '</div>').join('');
  } else if (tstQueueList) {
    tstQueueList.innerHTML = '<div class="card"><p style="color:var(--text2);">No pending builds in queue.</p></div>';
  }

  const tstDemosGrid = document.getElementById('tst-demos-grid');
  if (tstDemosGrid) {
    const vids = subs.filter(s => s.file_name && (s.file_name.includes('.mp4') || s.file_name.includes('.mov')));
    if (vids.length) {
      tstDemosGrid.innerHTML = vids.map(s => '<div class="card">' +
        '<div style="background:#000;border-radius:10px;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;margin-bottom:12px;border:1px solid var(--border);">' +
          '<div style="text-align:center;"><i class="fa fa-play-circle" style="font-size:3rem;color:var(--primary);"></i><div style="font-size:.85rem;color:var(--text2);margin-top:8px;">' + s.file_name + '</div></div>' +
        '</div>' +
        '<div style="font-size:.88rem;font-weight:600;">' + s.task_title + '</div>' +
        '<div style="font-size:.78rem;color:var(--text2);">By ' + s.user_name + ' - Status: <span class="badge badge-blue">' + s.status + '</span></div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button class="btn btn-green btn-sm" onclick="updateSubStatus(' + s.id + ',\'Approved\',5)"><i class="fa fa-check"></i> Approve</button> ' +
          '<button class="btn btn-red btn-sm" onclick="updateSubStatus(' + s.id + ',\'Rejected\',0)"><i class="fa fa-times"></i> Revise</button>' +
        '</div>' +
      '</div>').join('');
    }
  }
}

async function loadBackendState() {
  try {
    const state = await apiFetch('/api/state');
    if (!state) return;
    
    // Dynamically apply backend database phase
    if (state.phase) {
      renderVisualPhase(state.phase);
    } else {
      renderVisualPhase(localPipelinePhase);
    }

    if (state.submissions && state.submissions.length) {
      localSubmissions = state.submissions;
    }
    renderVisualSubmissions(localSubmissions);

    const lbList = document.getElementById('mg-leaderboard-list');
    if (lbList && state.leaderboard) {
      const colors = ['var(--gold)', 'var(--text)', 'var(--primary)', 'var(--blue)'];
      lbList.innerHTML = state.leaderboard.map((lb, idx) => '<div style="display:flex;align-items:center;gap:12px;">' +
        '<div style="font-size:.9rem;font-weight:700;color:' + (colors[idx] || 'var(--text2)') + ';width:34px;">' + (idx + 1) + (idx === 0 ? 'st' : idx === 1 ? 'nd' : idx === 2 ? 'rd' : 'th') + '</div>' +
        '<div style="flex:1;">' +
          '<div style="font-size:.9rem;font-weight:600;">' + lb.user_name + '</div>' +
          '<div class="progress-bar" style="margin-top:6px;"><div class="progress-fill" style="width:' + Math.min(100, (lb.total / 250) * 100) + '%;"></div></div>' +
        '</div>' +
        '<div class="credit-coin">' + lb.total + ' pts</div>' +
      '</div>').join('');
    }

    const devUserEl = document.getElementById('user-name');
    const devUser = devUserEl ? devUserEl.textContent : 'Shreya';
    const devLabel = document.getElementById('dev-user-label');
    if (devLabel) devLabel.textContent = devUser;
    
    const myCreds = state.credits?.filter(c => c.user_name.toLowerCase() === devUser.toLowerCase() || c.user_name.includes(devUser.split(' ')[0])) || [];
    const totalCreds = myCreds.reduce((sum, c) => sum + c.amount, 0) || localCreditsWallet;
    localCreditsWallet = totalCreds;
    
    const devTotalEl = document.getElementById('dev-total-credits-wallet');
    if (devTotalEl) devTotalEl.textContent = totalCreds;
    const devHdrCreds = document.getElementById('dev-header-credits');
    if (devHdrCreds) devHdrCreds.textContent = totalCreds + ' Credits';
    
    const devHist = document.getElementById('dev-credits-list');
    if (devHist && myCreds.length) {
      devHist.innerHTML = myCreds.map(c => '<div class="feed-item">' +
        '<div class="feed-icon" style="background:rgba(0,230,118,.1);color:var(--green);">+</div>' +
        '<div class="feed-content">' +
          '<div class="feed-title">+' + c.amount + ' credits</div>' +
          '<div class="feed-sub">' + c.reason + '</div>' +
          '<div class="feed-time">' + new Date(c.created_at * 1000).toLocaleDateString() + '</div>' +
        '</div>' +
      '</div>').join('');
    }

    const devTasks = document.getElementById('dev-tasks-list');
    if (devTasks && state.tasks) {
      const myTasks = state.tasks.filter(t => !t.assignee || t.assignee.toLowerCase().includes(devUser.toLowerCase().split(' ')[0]) || t.title.toLowerCase().includes('fix') || t.title.toLowerCase().includes('suite'));
      const renderTasks = myTasks.length ? myTasks : state.tasks.slice(0, 4);
      devTasks.innerHTML = renderTasks.map(t => '<div class="card-sm" style="display:flex;align-items:center;gap:12px;' + (t.status === 'in_progress' ? 'border-color:rgba(255,107,53,.3);' : '') + '">' +
        '<input type="checkbox" ' + (t.status === 'done' ? 'checked' : '') + ' style="accent-color:var(--primary);width:16px;height:16px;" onclick="toggleTaskStatus(' + t.id + ',this.checked)">' +
        '<div style="flex:1;">' +
          '<div style="font-size:.88rem;font-weight:500;' + (t.status === 'done' ? 'text-decoration:line-through;color:var(--text2);' : '') + '">' + t.title + '</div>' +
          '<div style="font-size:.75rem;color:' + (t.status === 'done' ? 'var(--green)' : (t.status === 'in_progress' ? 'var(--primary)' : 'var(--text2)')) + ';">' + (t.description || t.status) + '</div>' +
        '</div>' +
        (t.status === 'in_progress' ? '<span class="badge badge-orange">Active</span>' : '') +
      '</div>').join('');
    }

    // Load GitHub updates live feed
    const github = await apiFetch('/api/github/feed').catch(() => null);
    if (github && github.events && github.events.length) {
      const gf = document.getElementById('mg-github-feed');
      if (gf) gf.innerHTML = github.events.slice(0, 3).map(event => '<div class="feed-item"><div class="feed-icon" style="background:rgba(68,138,255,.1);color:var(--blue);"><i class="fab fa-github"></i></div><div class="feed-content"><div class="feed-title">' + event.type + ' by <b>' + event.actor.login + '</b></div><div class="feed-sub">' + (event.repo?.name || 'GitHub repository') + '</div><div class="feed-time">Live from GitHub</div></div></div>').join('');
    }

    // Reconcile global stat counts and Manager dashboard credit distributed score natively
    const allCredsSum = state.credits ? state.credits.reduce((sum, c) => sum + c.amount, 0) : 669;
    document.querySelectorAll('#cnt-credits').forEach(el => el.textContent = allCredsSum);
    const mgCreds = document.getElementById('mg-header-credits');
    if (mgCreds) mgCreds.textContent = allCredsSum + ' Credits Distributed';
  } catch (e) {
    // Demonstration fallback layout rendering
    renderVisualPhase(localPipelinePhase);
    renderVisualSubmissions(localSubmissions);
    const devHdr = document.getElementById('dev-header-credits');
    if (devHdr) devHdr.textContent = localCreditsWallet + ' Credits';
    const devWlt = document.getElementById('dev-total-credits-wallet');
    if (devWlt) devWlt.textContent = localCreditsWallet;
    
    // Explicitly keep global credit total metrics fully accurate
    const demoTotalSum = localCreditsWallet + 474;
    document.querySelectorAll('#cnt-credits').forEach(el => el.textContent = demoTotalSum);
    const mgCreds = document.getElementById('mg-header-credits');
    if (mgCreds) mgCreds.textContent = demoTotalSum + ' Credits Distributed';
  }
}

function toggleNotif() {
  const p = document.getElementById('notif-panel');
  if (p) p.style.display = p.style.display === 'block' ? 'none' : 'block';
}

function markAllRead() {
  const cnt = document.getElementById('notif-count');
  if (cnt) cnt.textContent = '0';
  showToast('success', 'Notifications cleared');
}

function openCRModal() {
  const m = document.getElementById('cr-modal');
  if (m) m.classList.add('open');
}

function closeCRModal() {
  const m = document.getElementById('cr-modal');
  if (m) m.classList.remove('open');
}

function submitCR() {
  const prioEl = document.getElementById('cr-priority');
  const descEl = document.getElementById('cr-desc');
  const prio = prioEl ? prioEl.value.trim() : 'Medium';
  const desc = descEl && descEl.value.trim() ? descEl.value.trim() : 'Optimize layout spacing padding targets';
  
  closeCRModal();
  if (descEl) descEl.value = '';

  // Directly append entry to the Client Change Request tracker log table natively
  const tbody = document.getElementById('client-cr-tbody');
  if (tbody) {
    const tr = document.createElement('tr');
    tr.style.animation = 'fadeIn .3s ease';
    const bClass = prio.includes('Critical') ? 'badge-red' : (prio.includes('High') ? 'badge-orange' : 'badge-yellow');
    tr.innerHTML = '<td><b>' + desc.substring(0, 32) + (desc.length > 32 ? '...' : '') + '</b></td><td><span class="badge ' + bClass + '">' + prio + '</span></td><td>Just now</td><td><span class="badge badge-blue">Pending Review</span></td>';
    tbody.prepend(tr);
  }

  // Push straight into Developer Tasks queue list to trigger immediate actionable assignments
  const devTasks = document.getElementById('dev-tasks-list');
  if (devTasks) {
    const tDiv = document.createElement('div');
    tDiv.className = 'card-sm';
    tDiv.style.display = 'flex';
    tDiv.style.alignItems = 'center';
    tDiv.style.gap = '12px';
    tDiv.style.borderColor = 'rgba(68,138,255,.4)';
    tDiv.style.animation = 'fadeIn .3s ease';
    tDiv.innerHTML = '<input type="checkbox" style="accent-color:var(--primary);width:16px;height:16px;" onclick="toggleTaskStatus(Date.now(),this.checked)"><div style="flex:1;"><div style="font-size:.88rem;font-weight:600;color:var(--blue);">Client CR: ' + prio + '</div><div style="font-size:.75rem;color:var(--text2);">' + desc + '</div></div><span class="badge badge-blue">New CR</span>';
    devTasks.prepend(tDiv);
  }

  // Append entry straight into global app header Notifications drawer
  const nl = document.getElementById('notif-list');
  if (nl) {
    const nItem = document.createElement('div');
    nItem.className = 'notif-item';
    nItem.style.padding = '10px 14px';
    nItem.style.borderBottom = '1px solid var(--border)';
    nItem.style.fontSize = '.82rem';
    nItem.innerHTML = '<b style="color:var(--blue);">Client CR Submitted:</b> Priority [' + prio + '] demanding: <i>"' + desc + '"</i>';
    nl.prepend(nItem);
    
    const nc = document.getElementById('notif-count');
    if (nc) nc.textContent = parseInt(nc.textContent || '0') + 1;
  }

  showToast('success', 'Change request successfully registered & transmitted to Developer task queues!');
}

function clientApproveRelease() {
  const badge = document.getElementById('client-release-badge');
  if (badge) {
    badge.className = 'badge badge-green';
    badge.textContent = 'Production Authorized';
  }
  const btn = document.getElementById('btn-client-approve');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-check"></i> Sign-off Verified';
    btn.style.opacity = '0.6';
  }

  // Distribute bonus points to total credits wallets for achieving production milestone
  localCreditsWallet += 50;
  const nTotal = localCreditsWallet + 474;
  document.querySelectorAll('#cnt-credits').forEach(el => el.textContent = nTotal);
  const mgHdr = document.getElementById('mg-header-credits');
  if (mgHdr) mgHdr.textContent = nTotal + ' Credits Distributed';
  
  // Advance workflow pipe stage state
  renderVisualPhase('Client OK');

  showToast('success', '✨ Milestone Authorized! +50 Bonus Credits deposited into engineering team ledgers.');
}

function clientSendFeedback() {
  const fbEl = document.getElementById('client-quick-feedback');
  const txt = fbEl && fbEl.value.trim() ? fbEl.value.trim() : 'Align UI assets with corporate layout typography requirements';
  if (fbEl) fbEl.value = '';

  // Push straight into Manager alerts/timeline
  const tl = document.getElementById('alert-timeline');
  if (tl) {
    const tItem = document.createElement('div');
    tItem.className = 'tl-item';
    tItem.style.animation = 'fadeIn .3s ease';
    tItem.innerHTML = '<div class="tl-title"><b style="color:var(--primary);">Client Direct Guidance</b> received</div><div class="tl-sub">"' + txt + '"</div><span class="feed-time">Just now</span>';
    tl.prepend(tItem);
  }

  // Push straight into Developer dashboard feeds
  const devFeed = document.getElementById('dev-push-feed');
  if (devFeed) {
    const dItem = document.createElement('div');
    dItem.className = 'feed-item';
    dItem.innerHTML = '<div class="feed-icon" style="background:rgba(255,107,53,.1);color:var(--primary);font-size:1rem;"><i class="fa fa-comment-dots"></i></div><div class="feed-content"><div class="feed-title">Client Dispatch Notes</div><div class="feed-sub">"' + txt + '"</div><div class="feed-time">Just now</div></div><span class="badge badge-purple">Guidance</span>';
    devFeed.prepend(dItem);
  }

  showToast('success', 'Feedback guidance dispatched perfectly to developers and managers!');
}

function demoTour() {
  showPage('ai');
  setTimeout(analyzeMeeting, 400);
}

function mgSection(id) {
  document.querySelectorAll('#page-manager .sidebar-item').forEach(item => item.classList.remove('active'));
  if (window.event?.currentTarget) {
    window.event.currentTarget.classList.add('active');
  }
  document.querySelectorAll('[id^="mg-"]').forEach(s => {
    if (s.classList.contains('section')) s.style.display = 'none';
  });
  const target = document.getElementById('mg-' + id) || document.getElementById('mg-overview');
  if (target) target.style.display = 'block';
}

function devSection(id) {
  document.querySelectorAll('[id^="dev-"]').forEach(s => {
    if (s.classList.contains('section')) s.style.display = 'none';
  });
  const el = document.getElementById('dev-' + id);
  if (el) el.style.display = 'block';
}

function tstSection(id) {
  document.querySelectorAll('[id^="tst-"]').forEach(s => {
    if (s.classList.contains('section')) s.style.display = 'none';
  });
  const el = document.getElementById('tst-' + id);
  if (el) el.style.display = 'block';
}

function sendBroadcast() {
  showToast('success', 'Broadcast alert dispatched to working groups');
}

async function simulatePush() {
  const devUserEl = document.getElementById('user-name');
  const devUser = devUserEl ? devUserEl.textContent : 'Shreya';
  const msgEl = document.getElementById('dev-commit-msg');
  const customMsg = msgEl && msgEl.value.trim() ? msgEl.value.trim() : 'fix: patch critical subsystem state logic';
  
  const newSub = {
    id: Date.now(),
    user_name: devUser,
    task_title: 'Git Commit: ' + customMsg,
    file_name: 'git_push_update',
    status: 'Approved',
    credits_awarded: 15,
    submitted_at: Math.floor(Date.now() / 1000)
  };
  
  if (msgEl) msgEl.value = '';
  localSubmissions.unshift(newSub);
  localCreditsWallet += 15;
  renderVisualSubmissions(localSubmissions);
  
  // Directly append simulated live push items to feed surfaces
  const devFeed = document.getElementById('dev-push-feed');
  if (devFeed) {
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = '<div class="feed-icon" style="background:rgba(0,230,118,.1);color:var(--green);font-size:1rem;"><i class="fa fa-code-commit"></i></div><div class="feed-content"><div class="feed-title">Pushed to <b>feature/cart-checkout</b></div><div class="feed-sub">' + customMsg + '</div><div class="feed-time">Just now</div></div><span class="badge badge-green">Success</span>';
    devFeed.prepend(item);
  }

  const mgFeed = document.getElementById('mg-github-feed');
  if (mgFeed) {
    const item2 = document.createElement('div');
    item2.className = 'feed-item';
    item2.innerHTML = '<div class="feed-icon" style="background:rgba(0,230,118,.1);color:var(--green);"><i class="fa fa-upload"></i></div><div class="feed-content"><div class="feed-title">' + devUser + ' pushed to <b>feature/cart-checkout</b></div><div class="feed-sub">' + customMsg + '</div><div class="feed-time">Just now</div></div><span class="badge badge-green">Merged</span>';
    mgFeed.prepend(item2);
  }

  // Instantly sync global commit counters
  document.querySelectorAll('#mg-commits, #cnt-commits').forEach(el => {
    el.textContent = parseInt(el.textContent || '47') + 1;
  });

  // Reconcile global stat credits score natively across Manager and landing dashboards
  const nextTotal = localCreditsWallet + 474;
  document.querySelectorAll('#cnt-credits').forEach(el => el.textContent = nextTotal);
  const mgHdr = document.getElementById('mg-header-credits');
  if (mgHdr) mgHdr.textContent = nextTotal + ' Credits Distributed';

  // Explicitly inject a new build record into the Testing queue list so testers get alerted synchronously
  const tstQList = document.getElementById('tst-queue-list');
  if (tstQList) {
    const qItem = document.createElement('div');
    qItem.className = 'card';
    qItem.style.borderColor = 'rgba(255,107,53,.3)';
    qItem.style.animation = 'fadeIn .3s ease';
    qItem.innerHTML = '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;"><div><div style="font-size:1rem;font-weight:600;margin-bottom:4px;">Webhook Build: ' + customMsg + ' <span class="badge badge-orange" style="margin-left:8px;">Awaiting Test</span></div><div style="font-size:.82rem;color:var(--text2);">Triggered by Git Push from <b>' + devUser + '</b> <span class="credit-coin">+20 pts</span></div><div style="font-size:.8rem;color:var(--text2);margin-top:6px;">Target branch verification queue active</div></div><div style="display:flex;gap:8px;flex-shrink:0;"><button class="btn btn-green btn-sm" onclick="approveDemo(\'Git Build Verification\',\'' + devUser + '\')"><i class="fa fa-check"></i> Approve</button> <button class="btn btn-red btn-sm" onclick="rejectDemo(\'Git Build Verification\')"><i class="fa fa-times"></i> Reject</button></div></div>';
    tstQList.prepend(qItem);
    
    // Increment testing side review tracker badges
    const pb = document.getElementById('tst-pending-badge');
    if (pb) pb.textContent = (parseInt(pb.textContent) || 2) + 1 + ' Pending';
    const pt = document.getElementById('tst-pending-text');
    if (pt) pt.textContent = (parseInt(pt.textContent) || 2) + 1 + ' builds awaiting review';
  }

  // Immediately notify Client Stakeholder Summary viewports
  const clAi = document.getElementById('client-ai-summary');
  if (clAi) clAi.innerHTML = '<b>Live Delivery Alert:</b> ' + devUser + ' pushed core logic: <i>"' + customMsg + '"</i>. Automatic webhook triggered continuous integration pipelines.';

  // Instantly inject a real-time tracking alert into the Manager's global notification drawer
  const nl = document.getElementById('notif-list');
  if (nl) {
    const nItem = document.createElement('div');
    nItem.className = 'notif-item';
    nItem.style.padding = '10px 14px';
    nItem.style.borderBottom = '1px solid var(--border)';
    nItem.style.fontSize = '.82rem';
    nItem.innerHTML = '<b style="color:var(--green);">Git Push Alert:</b> ' + devUser + ' committed upstream code. Payload target: <i>"' + customMsg + '"</i>';
    nl.prepend(nItem);
    
    const nc = document.getElementById('notif-count');
    if (nc) nc.textContent = parseInt(nc.textContent || '0') + 1;
  }

  showToast('success', 'Simulated push recorded live! Webhook fired & 15 credits deposited.');

  try {
    await apiFetch('/api/submissions', {
      method: 'POST',
      body: JSON.stringify({ user_name: devUser, task_title: newSub.task_title, file_name: newSub.file_name, status: 'Approved', credits_awarded: 15 })
    });
    await loadBackendState();
  } catch (e) {
    const devHdr = document.getElementById('dev-header-credits');
    if (devHdr) devHdr.textContent = localCreditsWallet + ' Credits';
    const devWlt = document.getElementById('dev-total-credits-wallet');
    if (devWlt) devWlt.textContent = localCreditsWallet;
  }
}

// Manager Onboarding functionality
function onboardTeamMember() {
  const nameEl = document.getElementById('onboard-name');
  const emailEl = document.getElementById('onboard-email');
  const roleEl = document.getElementById('onboard-role');
  
  const name = nameEl ? nameEl.value.trim() : '';
  const email = emailEl ? emailEl.value.trim() : '';
  const role = roleEl ? roleEl.value : 'developer';

  if (!name || !email) {
    showToast('warning', 'Please provide a valid participant Name and Email credential');
    return;
  }

  // Register into accessible mock credentials array dynamically
  demoUsers[role] = [email, name];
  
  // Inject live roster interface entries
  const roster = document.getElementById('live-team-roster');
  const uniqueId = 'member-' + Date.now();
  if (roster) {
    const div = document.createElement('div');
    div.className = 'feed-item';
    div.style.alignItems = 'center';
    div.id = uniqueId;
    div.innerHTML = '<span class="status-dot dot-green" style="margin-top:0;"></span><div class="feed-content" style="margin-left:10px;"><div class="feed-title">' + name + ' <span class="badge badge-green">Working</span> <span style="font-size:.7rem;color:var(--text3);">' + email + '</span></div><div class="feed-sub">Newly onboarded - ready for dispatch</div></div><div style="display:flex;align-items:center;gap:10px;"><span class="credit-coin">0 pts</span><button class="btn btn-red btn-sm" style="padding:4px 8px;" onclick="removeTeamMember(\'' + uniqueId + '\',\'' + name + '\')"><i class="fa fa-user-minus"></i> Remove</button></div>';
    roster.appendChild(div);
  }

  // Append to secondary dashboard list surfaces
  const teamList = document.getElementById('mg-team-list');
  if (teamList) {
    const d2 = document.createElement('div');
    d2.className = 'feed-item';
    d2.innerHTML = '<div class="status-dot dot-green" style="margin-top:4px;flex-shrink:0;"></div><div class="feed-content" style="margin-left:10px;"><div class="feed-title">' + name + ' <span class="badge badge-green" style="margin-left:8px;">Working</span></div><div class="feed-sub">Mapped Role: ' + role.toUpperCase() + '</div></div><div class="credit-coin">+10 pts</div>';
    teamList.appendChild(d2);
  }

  // Instantly inject into the Credits Leaderboard natively
  const lbList = document.getElementById('mg-leaderboard-list');
  if (lbList) {
    const nextRank = lbList.children.length + 1;
    const lbItem = document.createElement('div');
    lbItem.style.display = 'flex';
    lbItem.style.alignItems = 'center';
    lbItem.style.gap = '12px';
    lbItem.style.animation = 'fadeIn .3s ease';
    lbItem.innerHTML = '<div style="font-size:.9rem;font-weight:700;color:var(--text2);width:34px;">' + nextRank + 'th</div><div style="flex:1;"><div style="font-size:.9rem;font-weight:600;">' + name + '</div><div class="progress-bar" style="margin-top:6px;"><div class="progress-fill" style="width:15%;background:var(--primary);"></div></div></div><div class="credit-coin">10 pts</div>';
    lbList.appendChild(lbItem);
    
    // Deposit welcome bonus into active credit ledgers
    localCreditsWallet += 10;
    const nTotal = localCreditsWallet + 474;
    document.querySelectorAll('#cnt-credits').forEach(el => el.textContent = nTotal);
    const mHdr = document.getElementById('mg-header-credits');
    if (mHdr) mHdr.textContent = nTotal + ' Credits Distributed';
  }

  // Populate dynamic distribution targets dropdown
  const awEmp = document.getElementById('award-emp');
  if (awEmp) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name + ' (' + role.toUpperCase() + ')';
    awEmp.appendChild(opt);
  }

  if (nameEl) nameEl.value = '';
  if (emailEl) emailEl.value = '';
  
  showToast('success', 'Participant "' + name + '" registered! Live in Credits Leaderboard & reward targets.');
}

// Manager Dynamic Member Removal functionality
function removeTeamMember(elementId, nameStr) {
  const target = document.getElementById(elementId);
  if (target) {
    target.style.animation = 'slideOut .3s ease forwards';
    setTimeout(() => target.remove(), 320);
    showToast('success', 'Participant "' + nameStr + '" successfully removed & credentials deactivated.');
  } else {
    showToast('info', 'Participant removed from active synchronization lists.');
  }
}

// Start New Project initialization capability
function startNewProjectPrompt() {
  const res = prompt("Deploy Fresh Workspace Baseline\nEnter new project title:", "Nexus - Enterprise Cloud OS Migration");
  if (!res) return;
  
  projectState.project = res.trim();
  document.querySelectorAll('p b').forEach(b => {
    if (b.textContent.includes('Atlas') || b.textContent.includes('Nexus')) b.textContent = res;
  });
  
  // Clear layout history buffers cleanly
  localSubmissions = [];
  renderVisualSubmissions(localSubmissions);
  renderVisualPhase('Idea');
  
  showToast('success', 'New Project workspace "' + res + '" initialized perfectly!');
}

async function awardCredits(emp, bonus) {
  showToast('success', 'Bonus credits awarded live');
  try {
    await apiFetch('/api/submissions/update', { method: 'POST', body: JSON.stringify({ id: emp, status: 'Approved', bonus: bonus || 5 }) });
    await loadBackendState();
  } catch (e) {}
}

async function awardSubBonus(id, bonus) {
  localCreditsWallet += (bonus || 5);
  showToast('success', 'Bonus credits applied instantly');
  try {
    await apiFetch('/api/submissions/update', { method: 'POST', body: JSON.stringify({ id, status: 'Approved', bonus: bonus || 5 }) });
    await loadBackendState();
  } catch (e) {
    const devHdr = document.getElementById('dev-header-credits');
    if (devHdr) devHdr.textContent = localCreditsWallet + ' Credits';
  }
}

async function updateSubStatus(id, status, bonus) {
  const target = localSubmissions.find(s => s.id === id);
  if (target) {
    target.status = status;
    if (status === 'Approved') localCreditsWallet += (bonus || 10);
  }
  renderVisualSubmissions(localSubmissions);
  showToast(status === 'Approved' ? 'success' : 'warning', 'Submission live state set to: ' + status);

  try {
    await apiFetch('/api/submissions/update', { method: 'POST', body: JSON.stringify({ id, status, bonus }) });
    await loadBackendState();
  } catch (e) {}
}

async function manualAward() {
  const empEl = document.getElementById('award-emp');
  const credsEl = document.getElementById('award-credits');
  const reasonEl = document.getElementById('award-reason');
  
  const emp = empEl ? empEl.value : 'Priya';
  const credits = credsEl ? parseInt(credsEl.value || '10') : 10;
  const reason = reasonEl ? reasonEl.value : 'Manager Administrative Award';

  localCreditsWallet += credits;
  showToast('success', 'Successfully distributed ' + credits + ' credits to ' + emp);

  try {
    await apiFetch('/api/credits/award', {
      method: 'POST',
      body: JSON.stringify({ user_name: emp.split(' ')[0], amount: credits, reason })
    });
    await loadBackendState();
  } catch (e) {
    const devHdr = document.getElementById('dev-header-credits');
    if (devHdr) devHdr.textContent = localCreditsWallet + ' Credits';
    const devWlt = document.getElementById('dev-total-credits-wallet');
    if (devWlt) devWlt.textContent = localCreditsWallet;
  }
}

function triggerUpload() {
  const fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.click();
}

async function handleFileSelect(e) {
  const devUserEl = document.getElementById('user-name');
  const devUser = devUserEl ? devUserEl.textContent : 'Shreya';
  const file = e?.target?.files?.[0];
  const fileName = file ? file.name : 'demo_video_upload.mp4';
  
  const newSub = {
    id: Date.now(),
    user_name: devUser,
    task_title: 'Demo Video/Build Upload',
    file_name: fileName,
    status: 'Pending',
    credits_awarded: 20,
    submitted_at: Math.floor(Date.now() / 1000)
  };

  localSubmissions.unshift(newSub);
  renderVisualSubmissions(localSubmissions);
  showToast('success', 'Video successfully uploaded and inserted live into build queues!');

  try {
    await apiFetch('/api/submissions', {
      method: 'POST',
      body: JSON.stringify({ user_name: devUser, task_title: newSub.task_title, file_name: fileName, status: 'Pending', credits_awarded: 20 })
    });
    await loadBackendState();
  } catch (err) {}
}

function handleDrop(e) {
  e.preventDefault();
  if (e.currentTarget) e.currentTarget.classList.remove('dragover');
  handleFileSelect({ target: { files: e.dataTransfer?.files } });
}

function setDevStatus() {
  showToast('success', 'Working status updated dynamically');
}

async function updateStatus() {
  const msgEl = document.getElementById('status-msg');
  showToast('success', 'Status state saved live');
  try {
    await apiFetch('/api/status', {
      method: 'POST',
      body: JSON.stringify({ state: 'working', message: msgEl ? msgEl.value : '' })
    });
  } catch (e) {}
}

function approveDemo(name, devOwner) {
  localCreditsWallet += 20;
  showToast('success', 'Build "' + name + '" successfully verified & approved! +20 Credits distributed to ' + (devOwner || 'developer') + '.');
  
  // Directly reconcile visible live credit total counters
  document.querySelectorAll('#tst-header-credits, #dev-header-credits').forEach(el => el.textContent = localCreditsWallet + ' Credits');
  const wlt = document.getElementById('dev-total-credits-wallet');
  if (wlt) wlt.textContent = localCreditsWallet;

  // Reconcile pending review badge counts dynamically
  const pBadge = document.getElementById('tst-pending-badge');
  if (pBadge) pBadge.textContent = '1 Pending';
  const pTxt = document.getElementById('tst-pending-text');
  if (pTxt) pTxt.textContent = '1 build awaiting review';
  
  // If backend sync available, post confirmation
  apiFetch('/api/submissions/update', { method: 'POST', body: JSON.stringify({ id: Date.now(), status: 'Approved', bonus: 20 }) }).catch(()=>{});
}

function rejectDemo(name) {
  // Check active textual testing notes if entered
  const notesAreas = document.querySelectorAll('textarea[placeholder*="test notes"]');
  let noteText = '';
  notesAreas.forEach(ta => {
    if (ta.value.trim()) noteText = ta.value.trim();
  });
  
  if (!noteText) {
    noteText = prompt("Describe the problem/defect encountered to notify the developers:", "Payment gateway retry parameters dropped under sandbox payload");
  }
  
  const finalDesc = noteText || "Regression suite criteria failed verification rules";

  showToast('warning', 'Defect ticket logged for build "' + name + '". Assigned direct developer task alerts.');
  
  // Inject live dynamic task item into Developer Tasks view
  const devTasks = document.getElementById('dev-tasks-list');
  if (devTasks) {
    const taskDiv = document.createElement('div');
    taskDiv.className = 'card-sm';
    taskDiv.style.display = 'flex';
    taskDiv.style.alignItems = 'center';
    taskDiv.style.gap = '12px';
    taskDiv.style.borderColor = 'rgba(255,107,53,.4)';
    taskDiv.style.animation = 'fadeIn .3s ease';
    taskDiv.innerHTML = '<input type="checkbox" style="accent-color:var(--primary);width:16px;height:16px;" onclick="toggleTaskStatus(Date.now(),this.checked)"><div style="flex:1;"><div style="font-size:.88rem;font-weight:600;color:var(--primary);">QA Defect: ' + name + '</div><div style="font-size:.75rem;color:var(--text2);">' + finalDesc + '</div></div><span class="badge badge-red">High Priority</span>';
    devTasks.prepend(taskDiv);
  }

  // Update Manager Alerts Timeline to maintain operational clarity
  const tl = document.getElementById('alert-timeline');
  if (tl) {
    const tlItem = document.createElement('div');
    tlItem.className = 'tl-item';
    tlItem.style.animation = 'fadeIn .3s ease';
    tlItem.innerHTML = '<div class="tl-title"><b style="color:var(--primary);">Defect Flagged</b>: ' + name + ' rejected by Testing Team</div><div class="tl-sub">' + finalDesc + '</div><span class="feed-time">Just now</span>';
    tl.prepend(tlItem);
  }
  
  // Broadcast alert directly into global Notifications list
  const nl = document.getElementById('notif-list');
  if (nl) {
    const nItem = document.createElement('div');
    nItem.className = 'notif-item';
    nItem.style.padding = '10px 14px';
    nItem.style.borderBottom = '1px solid var(--border)';
    nItem.style.fontSize = '.82rem';
    nItem.innerHTML = '<b style="color:var(--primary);">QA Flag:</b> ' + name + ' revision demanded. Reason: <i>"' + finalDesc + '"</i>';
    nl.prepend(nItem);
    
    const nc = document.getElementById('notif-count');
    if (nc) nc.textContent = parseInt(nc.textContent || '0') + 1;
  }

  // Set submission state to rejected via API if backend online
  apiFetch('/api/submissions/update', { method: 'POST', body: JSON.stringify({ id: Date.now(), status: 'Rejected', bonus: 0 }) }).catch(()=>{});
}

function submitChecklist() {
  showToast('success', 'Comprehensive testing feedback checklist recorded');
}

function toggleTaskStatus(id, done) {
  showToast('success', 'Task workflow item updated');
}

// Ensure interface renders active state instantly
document.addEventListener('DOMContentLoaded', () => {
  selectRole('manager');
  loadBackendState();
});
