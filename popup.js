import { registry } from './endpoints/registry.js';

const noteBox       = document.getElementById('note');
const titleEl       = document.getElementById('title');
const statusEl      = document.getElementById('status');
const deleteBtn     = document.getElementById('deleteBtn');
const closeBtn      = document.getElementById('closeBtn');
const settingsBtn   = document.getElementById('settingsBtn');
const endpointLabel = document.getElementById('endpoint-label');
const actionsEl     = document.getElementById('actions');

const params       = new URLSearchParams(location.search);
const paramTitle   = params.get('title') || '';
const paramUrl     = params.get('url')   || '';
const paramNote    = params.get('note')  || '';
const selectedText = params.get('selected') || '';

noteBox.value = selectedText || paramNote;

// One bookmark, one id per target it reached: { endpointId: bookmarkId }
let savedIds        = {};
let debTimer        = null;
let activeEps       = [];   // [{ id, name, requiresDom }] from the worker
let domEps          = [];   // must run here — the worker has no File System Access API
let workerEps       = [];   // everything else, batched into one message
// Pre-loaded file handle for local_markdown — avoids IDB round-trip in click handlers,
// which would consume the user-activation required by requestPermission()
let preloadedHandle = null;

function setStatus(text, cls = '') {
    statusEl.textContent = text;
    statusEl.className   = cls;
}

function sendMsg(msg) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(msg, (res) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (res?.error) return reject(new Error(res.error));
            resolve(res);
        });
    });
}

function removePopup() {
    window.parent.postMessage({ plainmark: 'close' }, '*');
}

settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
closeBtn.addEventListener('click', removePopup);

// A local Markdown file is more recognisable by its filename than by the endpoint name.
function nameOf(id) {
    if (id === 'local_markdown' && preloadedHandle?.name) return preloadedHandle.name;
    return activeEps.find(e => e.id === id)?.name ?? id;
}

// Run op against the DOM-only endpoints here in the popup, in the same
// { endpointId, id?, error? } shape the worker returns.
async function fanOutLocal(eps, op) {
    const settled = await Promise.allSettled(eps.map(async ({ id }) => op(await registry.getInitialized(id))));
    return settled.map((r, i) => (
        r.status === 'fulfilled'
            ? { endpointId: eps[i].id, id: r.value?.id }
            : { endpointId: eps[i].id, error: r.reason?.message ?? String(r.reason) }
    ));
}

// A rejected sendMsg means the worker never ran, so the failure belongs to every
// target it would have covered — not to the popup as a whole.
async function viaWorker(eps, msg) {
    if (!eps.length) return [];
    try {
        return (await sendMsg(msg)).results ?? [];
    } catch (e) {
        return eps.map(ep => ({ endpointId: ep.id, error: e.message }));
    }
}

// Targets that actually took the bookmark, split by where they have to run.
// Ids can legitimately be 0 (Gist and local Markdown return line numbers), so
// these compare against null rather than testing truthiness.
function savedTargets() {
    return {
        dom:    domEps.filter(ep => savedIds[ep.id] != null),
        worker: workerEps.filter(ep => savedIds[ep.id] != null),
    };
}

const idsMap = eps => Object.fromEntries(eps.map(ep => [ep.id, savedIds[ep.id]]));

// Partial success is still success — keep what landed and name only what didn't.
// The full target list already sits in #endpoint-label, so it isn't repeated here.
function reportResults(results, verb) {
    const failed = results.filter(r => r.error);
    const okCount = results.length - failed.length;

    if (!results.length) return setStatus('No targets enabled — open ⚙ Options', 'error');
    if (!failed.length)  return setStatus(verb, 'saved');
    if (!okCount)        return setStatus(failed[0].error, 'error');
    setStatus(`${verb} · ${failed.map(r => nameOf(r.endpointId)).join(', ')} failed`, 'warn');
}

noteBox.addEventListener('input', () => {
    if (!Object.keys(savedIds).length) return;
    setStatus('Updating…');
    clearTimeout(debTimer);
    debTimer = setTimeout(async () => {
        const { dom, worker } = savedTargets();
        const note = noteBox.value;
        const [local, remote] = await Promise.all([
            fanOutLocal(dom, ep => ep.update(savedIds[ep.id], note)),
            viaWorker(worker, { message: 'update', ids: idsMap(worker), note }),
        ]);
        reportResults([...local, ...remote], 'Updated');
    }, 400);
});

deleteBtn.addEventListener('click', async () => {
    if (!Object.keys(savedIds).length) return;
    setStatus('Deleting…');
    const { dom, worker } = savedTargets();
    const [local, remote] = await Promise.all([
        fanOutLocal(dom, ep => ep.delete(savedIds[ep.id])),
        viaWorker(worker, { message: 'delete', ids: idsMap(worker) }),
    ]);
    const results = [...local, ...remote];
    reportResults(results, 'Deleted');
    // Leave the popup open on a partial failure so the message stays readable.
    if (!results.some(r => r.error)) setTimeout(removePopup, 600);
});

// requestPermission() requires a top-level browsing context and cannot be called
// from an iframe — direct the user to the options page (a real tab) instead.

async function saveBookmark(title, url) {
    if (!activeEps.length) return setStatus('No targets enabled — open ⚙ Options', 'error');

    setStatus('Saving…');
    const note = noteBox.value;
    const [local, remote] = await Promise.all([
        fanOutLocal(domEps, ep => ep.add(title, url, note)),
        viaWorker(workerEps, { message: 'add', title, url, note }),
    ]);

    const results = [...local, ...remote];
    for (const r of results) {
        if (!r.error && r.id != null) savedIds[r.endpointId] = r.id;
    }

    reportResults(results, 'Saved');
    if (Object.keys(savedIds).length) deleteBtn.style.display = 'inline-block';
}

window.addEventListener('DOMContentLoaded', async () => {
    try {
        activeEps = (await sendMsg({ message: 'getConfig' })).endpoints ?? [];
    } catch (_) {}

    domEps    = activeEps.filter(e => e.requiresDom);
    workerEps = activeEps.filter(e => !e.requiresDom);

    // Pre-load filename for use in status messages
    if (domEps.some(e => e.id === 'local_markdown')) {
        try { preloadedHandle = await registry.getById('local_markdown').getHandle(); } catch (_) {}
    }
    const targetNames = activeEps.map(e => nameOf(e.id)).join(', ');
    endpointLabel.textContent = targetNames;
    endpointLabel.title       = targetNames;   // CSS truncates when several are active

    const title = paramTitle || '(unknown page)';
    const url   = paramUrl   || '';
    titleEl.textContent = title;
    titleEl.title       = title;

    await saveBookmark(title, url);
    noteBox.focus();
});
