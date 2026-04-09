import {
  addNote, getNotesByDate, getNotesByDateRange, deleteNote,
  saveSummary, getSummary, getSummariesByRange
} from './db.js';

const REPO_OWNER = 'moty-droid';
const REPO_NAME = 'voice-notes';

// ── DOM ──
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const pages = $$('.page');
const navBtns = $$('nav button');

// ── Navigation ──
function showPage(id) {
  pages.forEach(p => p.classList.toggle('active', p.id === id));
  navBtns.forEach(b => b.classList.toggle('active', b.dataset.page === id));
  if (id === 'page-notes') loadTodayNotes();
  if (id === 'page-summary') loadSummaries();
  if (id === 'page-settings') loadSettings();
}

navBtns.forEach(b => b.addEventListener('click', () => showPage(b.dataset.page)));

// ── Toast ──
function toast(msg, type = 'success') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ── GitHub Sync ──
async function syncNoteToGitHub(note) {
  const token = localStorage.getItem('github_token');
  if (!token) return;

  const path = `data/notes/${note.date}.json`;
  const apiBase = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const headers = {
    'Authorization': `token ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    // Try to get existing file
    let existing = [];
    let sha = null;
    try {
      const res = await fetch(apiBase, { headers });
      if (res.ok) {
        const data = await res.json();
        sha = data.sha;
        existing = JSON.parse(atob(data.content));
      }
    } catch {}

    // Append new note
    existing.push({
      text: note.text,
      timestamp: note.timestamp
    });

    // Write back
    const body = {
      message: `note: ${note.date} ${note.timestamp.slice(11, 16)}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(existing, null, 2)))),
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });

    if (!putRes.ok) throw new Error(`GitHub API ${putRes.status}`);
  } catch (err) {
    console.error('GitHub sync failed:', err);
  }
}

// ── Text Input ──
const noteInput = $('#note-input');
const btnAdd = $('#btn-add-note');

noteInput.addEventListener('input', () => {
  btnAdd.disabled = !noteInput.value.trim();
  noteInput.style.height = 'auto';
  noteInput.style.height = Math.min(noteInput.scrollHeight, 150) + 'px';
});

noteInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitNote();
  }
});

btnAdd.addEventListener('click', submitNote);

async function submitNote() {
  const text = noteInput.value.trim();
  if (!text) return;
  try {
    const note = await addNote(text);
    noteInput.value = '';
    noteInput.style.height = 'auto';
    btnAdd.disabled = true;
    toast('已儲存');
    loadTodayNotes();
    // Sync to GitHub in background
    syncNoteToGitHub(note);
  } catch {
    toast('儲存失敗', 'error');
  }
}

// ── Notes List ──
function today() { return new Date().toISOString().slice(0, 10); }

async function loadTodayNotes() {
  const notes = await getNotesByDate(today());
  const container = $('#notes-list');
  if (!notes.length) {
    container.innerHTML = '<div class="empty-state">今天還沒有筆記<br>在上方輸入框開始記錄</div>';
    return;
  }
  notes.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  container.innerHTML = notes.map(n => `
    <div class="note-card" data-id="${n.id}">
      <div class="time">${new Date(n.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</div>
      <div class="text">${escapeHtml(n.text)}</div>
      <button class="delete-btn" onclick="deleteNoteById(${n.id})">✕</button>
    </div>
  `).join('');
}

window.deleteNoteById = async function(id) {
  await deleteNote(id);
  toast('已刪除');
  loadTodayNotes();
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Summaries ──
async function loadSummaries() {
  const container = $('#summary-list');
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  let html = '';
  for (const dateStr of dates) {
    const summary = await getSummary(dateStr);
    const notes = await getNotesByDate(dateStr);
    if (!notes.length && !summary) continue;

    const label = dateStr === today() ? '今天' : dateStr;
    html += `<div class="date-header">${label}（${notes.length} 筆記錄）</div>`;

    if (summary) {
      html += `<div class="summary-card"><h3>AI 摘要</h3><div class="content">${escapeHtml(summary.text)}</div></div>`;
    } else if (notes.length) {
      html += `<div class="summary-card" style="border-left-color:var(--text-dim)"><h3>尚未產生摘要</h3><div class="content" style="color:var(--text-dim)">等待每日自動整理，或手動觸發</div></div>`;
    }
  }

  if (!html) {
    html = '<div class="empty-state">還沒有任何摘要</div>';
  }
  container.innerHTML = html;
}

// ── Settings ──
function loadSettings() {
  $('#input-github-token').value = localStorage.getItem('github_token') || '';
  $('#input-api-key').value = localStorage.getItem('claude_api_key') || '';
  $('#input-email').value = localStorage.getItem('user_email') || '';
  $('#input-emailjs-service').value = localStorage.getItem('emailjs_service_id') || '';
  $('#input-emailjs-template').value = localStorage.getItem('emailjs_template_id') || '';
  $('#input-emailjs-public').value = localStorage.getItem('emailjs_public_key') || '';
  updateSchedulerStatus();
}

$('#btn-save-settings').addEventListener('click', () => {
  localStorage.setItem('github_token', $('#input-github-token').value.trim());
  localStorage.setItem('claude_api_key', $('#input-api-key').value.trim());
  localStorage.setItem('user_email', $('#input-email').value.trim());
  localStorage.setItem('emailjs_service_id', $('#input-emailjs-service').value.trim());
  localStorage.setItem('emailjs_template_id', $('#input-emailjs-template').value.trim());
  localStorage.setItem('emailjs_public_key', $('#input-emailjs-public').value.trim());
  toast('設定已儲存');
  updateSchedulerStatus();
});

function updateSchedulerStatus() {
  const hasGH = !!localStorage.getItem('github_token');
  const hasKey = !!localStorage.getItem('claude_api_key');
  const hasEmail = !!localStorage.getItem('user_email');
  const hasEmailJS = !!localStorage.getItem('emailjs_service_id') && !!localStorage.getItem('emailjs_template_id') && !!localStorage.getItem('emailjs_public_key');

  $('#scheduler-status').innerHTML = `
    <div><span class="dot ${hasGH ? 'on' : 'off'}"></span>筆記同步：${hasGH ? '已啟用' : '需要 GitHub Token'}</div>
    <div><span class="dot ${hasKey ? 'on' : 'off'}"></span>每日 AI 摘要：${hasKey ? '已啟用' : '需要 Claude API Key'}</div>
    <div><span class="dot ${hasEmail && hasEmailJS ? 'on' : 'off'}"></span>每日 Email：${hasEmail && hasEmailJS ? '已啟用' : '需要完成 Email 設定'}</div>
  `;
}

// ── Claude API (Daily Summary) ──
async function generateDailySummary(dateStr) {
  const apiKey = localStorage.getItem('claude_api_key');
  if (!apiKey) return null;

  const notes = await getNotesByDate(dateStr);
  if (!notes.length) return null;

  const existing = await getSummary(dateStr);
  if (existing) return existing.text;

  const notesText = notes
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map(n => `[${new Date(n.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}] ${n.text}`)
    .join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `以下是我今天（${dateStr}）的筆記記錄，請幫我整理成條列式摘要，用繁體中文。重點歸納，去除口語贅字，保留關鍵資訊。\n\n${notesText}`
        }]
      })
    });

    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const summary = data.content[0].text;
    await saveSummary(dateStr, summary);
    return summary;
  } catch (err) {
    console.error('Summary generation failed:', err);
    return null;
  }
}

// Manual trigger
$('#btn-generate-summary').addEventListener('click', async () => {
  const apiKey = localStorage.getItem('claude_api_key');
  if (!apiKey) { toast('請先設定 Claude API Key', 'error'); return; }

  toast('正在產生摘要...');
  const result = await generateDailySummary(today());
  if (result) {
    toast('摘要已產生');
    loadSummaries();
  } else {
    toast('今天沒有筆記或產生失敗', 'error');
  }
});

// ── EmailJS (Daily Report) ──
async function sendDailyEmail(dateStr) {
  const email = localStorage.getItem('user_email');
  const serviceId = localStorage.getItem('emailjs_service_id');
  const templateId = localStorage.getItem('emailjs_template_id');
  const publicKey = localStorage.getItem('emailjs_public_key');
  if (!email || !serviceId || !templateId || !publicKey) return;

  const notes = await getNotesByDate(dateStr);
  const summary = await getSummary(dateStr);

  if (!notes.length) return;

  let content = `📋 隨手記日報（${dateStr}）\n\n`;

  if (summary) {
    content += `【AI 摘要】\n${summary.text}\n\n`;
  }

  content += `【原始記錄】\n`;
  notes
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .forEach(n => {
      const t = new Date(n.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
      content += `  ${t}  ${n.text}\n`;
    });

  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          to_email: email,
          subject: `隨手記日報 ${dateStr}`,
          message: content
        }
      })
    });
    if (res.ok) {
      toast('日報已寄出');
    } else {
      throw new Error(`EmailJS ${res.status}`);
    }
  } catch (err) {
    console.error('Email failed:', err);
    toast('寄信失敗', 'error');
  }
}

$('#btn-send-email').addEventListener('click', async () => {
  const email = localStorage.getItem('user_email');
  const serviceId = localStorage.getItem('emailjs_service_id');
  if (!email || !serviceId) { toast('請先完成 Email 設定', 'error'); return; }
  toast('正在寄送日報...');
  await sendDailyEmail(today());
});

// ── Scheduler (runs while app is open, backup for GitHub Actions) ──
function startScheduler() {
  setInterval(async () => {
    const now = new Date();

    // Daily summary at midnight (00:00 ~ 00:05)
    if (now.getHours() === 0 && now.getMinutes() < 5) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);
      const lastSummary = localStorage.getItem('last_summary_date');
      if (lastSummary !== yStr) {
        await generateDailySummary(yStr);
        localStorage.setItem('last_summary_date', yStr);
      }
    }
  }, 60_000);
}

// ── Init ──
showPage('page-notes');
startScheduler();
loadSettings();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
