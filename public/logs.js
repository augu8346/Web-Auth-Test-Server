'use strict';

const container = document.getElementById('logs-container');
const status = document.getElementById('log-status');
let logs = [];
let paused = false;
let fetching = false;

function node(tag, text, className) {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
}

function renderLogs() {
    const expanded = new Set([...container.querySelectorAll('details[open]')].map(item => item.dataset.id));
    const query = document.getElementById('log-filter').value.toLowerCase();
    const visible = logs.filter(log => `${log.method} ${log.url} ${log.protocol} ${log.status || ''}`.toLowerCase().includes(query));
    container.replaceChildren();
    if (!visible.length) {
        container.append(node('p', logs.length ? 'No requests match this filter.' : 'No requests yet. Send a request from your client or the playground.', 'empty'));
    }
    for (const log of visible) {
        const entry = node('details', undefined, 'panel log-entry');
        entry.dataset.id = String(log.id);
        entry.open = expanded.has(entry.dataset.id);
        const summary = node('summary');
        summary.append(node('span', log.method, 'tag'), node('code', `${log.protocol.toUpperCase()} ${log.url}`),
            node('span', log.status || 'pending', `status-badge${log.status >= 400 ? ' failed' : ''}`),
            node('time', new Date(log.timestamp).toLocaleTimeString()));
        const details = node('div', undefined, 'details-body');
        details.append(node('p', `${log.ip} / ${log.durationMs ?? 'pending'} ms / ${log.timestamp}`));
        for (const [label, value] of [['Headers', log.headers], ['Cookies', log.cookies], ['Query parameters', log.query]]) {
            details.append(node('h3', label), node('pre', JSON.stringify(value, null, 2)));
        }
        entry.append(summary, details);
        container.append(entry);
    }
}

async function fetchLogs() {
    if (fetching) return;
    fetching = true;
    try {
        const response = await fetch('/api/logs', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        logs = await response.json();
        renderLogs();
        status.textContent = `${paused ? 'Paused' : 'Live'} / ${logs.length} captured requests / Last updated ${new Date().toLocaleTimeString()}`;
        status.className = 'small';
    } catch (error) {
        status.textContent = `Could not refresh logs: ${error.message}. Existing entries may be stale. Use Refresh now to retry.`;
        status.className = 'notice error';
    } finally {
        fetching = false;
    }
}

document.getElementById('pause-logs').addEventListener('click', event => {
    paused = !paused;
    event.target.textContent = paused ? 'Resume updates' : 'Pause updates';
    event.target.setAttribute('aria-pressed', String(paused));
    if (!paused) fetchLogs();
    else status.textContent = 'Paused / Automatic updates stopped. Refresh now still works.';
});
document.getElementById('refresh-logs').addEventListener('click', fetchLogs);
document.getElementById('log-filter').addEventListener('input', renderLogs);
fetchLogs();
setInterval(() => { if (!paused) fetchLogs(); }, 2000);
