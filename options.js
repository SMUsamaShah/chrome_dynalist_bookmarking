import { registry } from './endpoints/registry.js';

const cardsEl            = document.getElementById('endpoint-cards');
const noTargetsNotice    = document.getElementById('no-targets-notice');
const filePickerArea     = document.getElementById('file-picker-area');
const currentFileEl      = document.getElementById('current-file');
const pickFileBtn        = document.getElementById('pick-file-btn');
const grantStep          = document.getElementById('grant-step');
const permStatusEl       = document.getElementById('permission-status');
const grantAccessBtn     = document.getElementById('grant-access-btn');
const migrateSourceEl    = document.getElementById('migrate-source');
const migrateDestEl      = document.getElementById('migrate-dest');
const migrateBtnEl       = document.getElementById('migrate-btn');
const migrateResultEl    = document.getElementById('migrate-result');
const browserStorageArea = document.getElementById('browser-storage-area');
const bsCountEl          = document.getElementById('bs-count');
const bsCopyMdBtn        = document.getElementById('bs-copy-md-btn');
const bsCopyJsonBtn      = document.getElementById('bs-copy-json-btn');
const bsDownloadBtn      = document.getElementById('bs-download-btn');
const bsClearBtn         = document.getElementById('bs-clear-btn');
const bsExportResult     = document.getElementById('bs-export-result');

// Pre-loaded handle — populated when the local_markdown card is rendered.
// Storing it here means button click handlers can call handle.requestPermission()
// as their very first await, satisfying the user-activation requirement.
let preloadedHandle = null;

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function init() {
    const activeIds = await registry.getActiveIds();
    for (const ep of registry.getAll()) {
        cardsEl.appendChild(await renderEndpointCard(ep, activeIds.includes(ep.id)));
    }
    updateNoTargetsNotice();
    renderMigrateSelects(activeIds[0]);
}

// Enabled targets are whatever is ticked, read straight off the DOM.
async function saveActiveIds() {
    const ids = [...cardsEl.querySelectorAll('.endpoint-card')]
        .filter(card => card.querySelector('.ep-enable').checked)
        .map(card => card.dataset.endpointId);
    await registry.setActiveIds(ids);
    updateNoTargetsNotice();
}

function updateNoTargetsNotice() {
    noTargetsNotice.style.display = cardsEl.querySelector('.ep-enable:checked') ? 'none' : 'block';
}

async function renderEndpointCard(ep, enabled) {
    const settings = await registry.getSettings(ep.id);

    const card = document.createElement('div');
    card.className          = 'endpoint-card';
    card.dataset.endpointId = ep.id;

    const body = document.createElement('div');
    body.className = 'endpoint-card-body';
    body.hidden    = !enabled;

    // ---- header ----------------------------------------------------------
    const header = document.createElement('div');
    header.className = 'endpoint-card-header';

    const enableBox = document.createElement('input');
    enableBox.type      = 'checkbox';
    enableBox.className = 'ep-enable';
    enableBox.id        = `enable-${ep.id}`;
    enableBox.checked   = enabled;

    const nameLbl = document.createElement('label');
    nameLbl.className   = 'ep-name';
    nameLbl.htmlFor     = enableBox.id;
    nameLbl.textContent = ep.name;

    const testResult = document.createElement('span');
    testResult.className = 'ep-test-result';

    const testBtn = document.createElement('button');
    testBtn.type        = 'button';
    testBtn.className   = 'btn-secondary';
    testBtn.textContent = 'Test';

    const expandBtn = document.createElement('button');
    expandBtn.type        = 'button';
    expandBtn.className   = 'ep-expand';
    expandBtn.title       = 'Show settings';
    expandBtn.textContent = '›';
    expandBtn.setAttribute('aria-expanded', String(enabled));

    header.append(enableBox, nameLbl);
    if (ep.warning) {
        const badge = document.createElement('span');
        badge.className   = 'ep-warning-badge';
        badge.textContent = '⚠';
        badge.title       = ep.warning;
        header.appendChild(badge);
    }
    header.append(testResult, testBtn, expandBtn);

    // Expanding is independent of enabling — configure before you switch on.
    const setExpanded = (open) => {
        body.hidden = !open;
        expandBtn.setAttribute('aria-expanded', String(open));
    };
    expandBtn.addEventListener('click', () => setExpanded(body.hidden));

    // Ticking a target reveals its settings, so a half-configured one is visible.
    enableBox.addEventListener('change', async () => {
        if (enableBox.checked) setExpanded(true);
        await saveActiveIds();
    });

    testBtn.addEventListener('click', async () => {
        testResult.textContent = 'Testing…';
        testResult.className   = 'ep-test-result';
        try {
            const live = await registry.getInitialized(ep.id);
            const r    = await live.test();
            testResult.textContent = r.message;
            testResult.className   = `ep-test-result ${r.ok ? 'ok' : 'error'}`;
        } catch (e) {
            testResult.textContent = e.message;
            testResult.className   = 'ep-test-result error';
        }
    });

    // ---- body ------------------------------------------------------------
    if (ep.warning) {
        const warn = document.createElement('div');
        warn.className   = 'ep-warning';
        warn.textContent = ep.warning;
        body.appendChild(warn);
    }

    // One draft per card, flushed as a whole. Reading storage per field meant two
    // fields edited inside the debounce window each wrote a stale copy of the object.
    const draft = { ...settings };
    const flush = debounce(() => registry.saveSettings(ep.id, draft), 400);

    const form = document.createElement('form');
    form.className = 'ep-settings-form';

    for (const field of ep.settingsSchema) {
        const wrapper = document.createElement('div');
        wrapper.className = field.type === 'checkbox' ? 'field checkbox-field' : 'field';

        const input = document.createElement('input');
        input.type = field.type;
        // Scoped by endpoint — every card is in the DOM at once and several
        // endpoints share field keys like `token`.
        input.id   = `field-${ep.id}-${field.key}`;
        input.name = field.key;

        if (field.type === 'checkbox') {
            input.checked = settings[field.key] === true;
        } else {
            input.value       = settings[field.key] ?? '';
            input.placeholder = field.placeholder ?? '';
        }

        const lbl = document.createElement('label');
        lbl.htmlFor     = input.id;
        lbl.textContent = field.label;

        input.addEventListener(field.type === 'checkbox' ? 'change' : 'input', () => {
            draft[field.key] = field.type === 'checkbox' ? input.checked : input.value;
            flush();
        });

        if (field.type === 'checkbox') {
            wrapper.append(input, lbl);
        } else {
            wrapper.append(lbl, input);
        }

        if (field.browse) {
            wrapper.appendChild(buildNodeBrowser(ep.id, field, input, draft));
        }

        form.appendChild(wrapper);
    }
    body.appendChild(form);

    // These two blocks are unique to their endpoint, so they're moved rather
    // than rebuilt — keeping their existing handlers bound.
    if (ep.id === 'local_markdown') {
        body.appendChild(filePickerArea);
        await refreshLocalMarkdownUI();
    }
    if (ep.id === 'browser_storage') {
        body.appendChild(browserStorageArea);
        await refreshBrowserStorageUI();
    }

    if (ep.links.length) {
        const linksEl = document.createElement('div');
        linksEl.className = 'ep-links';
        for (const { label, url } of ep.links) {
            const a = document.createElement('a');
            a.href        = url;
            a.target      = '_blank';
            a.rel         = 'noopener';
            a.textContent = label;
            a.title       = url;
            linksEl.appendChild(a);
        }
        body.appendChild(linksEl);
    }

    card.append(header, body);
    return card;
}

// Node picker for endpoints with a tree (Dynalist, Workflowy).
function buildNodeBrowser(endpointId, field, input, draft) {
    const browseRow = document.createElement('div');
    browseRow.className = 'browse-row';

    const browseBtn = document.createElement('button');
    browseBtn.type        = 'button';
    browseBtn.textContent = 'Browse nodes…';
    browseBtn.className   = 'btn-secondary';

    const navRow = document.createElement('div');
    navRow.className     = 'browse-nav';
    navRow.style.display = 'none';

    const backBtn = document.createElement('button');
    backBtn.type          = 'button';
    backBtn.textContent   = '← Back';
    backBtn.className     = 'btn-secondary';
    backBtn.style.display = 'none';

    const nodeSelect = document.createElement('select');
    nodeSelect.className = 'node-select';

    const enterBtn = document.createElement('button');
    enterBtn.type        = 'button';
    enterBtn.textContent = 'Enter →';
    enterBtn.className   = 'btn-secondary';
    enterBtn.title       = 'Browse into selected node';

    const useBtn = document.createElement('button');
    useBtn.type        = 'button';
    useBtn.textContent = 'Use';
    useBtn.className   = 'btn-secondary';

    navRow.append(backBtn, nodeSelect, enterBtn, useBtn);
    browseRow.append(browseBtn, navRow);

    // path is a stack of {id, label} for the Back button
    const path = [];

    const loadNodes = async (parentId) => {
        browseBtn.disabled    = true;
        browseBtn.textContent = 'Loading…';
        try {
            const ep    = await registry.getInitialized(endpointId);
            const nodes = await ep.getNodes(parentId);
            if (nodes === null) {
                browseBtn.textContent = 'Not supported';
                return;
            }
            if (!nodes.length) {
                browseBtn.textContent = 'No child nodes';
                return;
            }
            // new Option() over innerHTML — node labels are remote data.
            nodeSelect.replaceChildren(...nodes.map(n => new Option(n.label || n.id, n.id)));
            navRow.style.display  = 'flex';
            backBtn.style.display = path.length ? 'inline-block' : 'none';
            browseBtn.textContent = 'Refresh';
        } catch (e) {
            browseBtn.textContent = `Error: ${e.message}`;
        }
        browseBtn.disabled = false;
    };

    browseBtn.addEventListener('click', () => {
        path.length = 0;
        loadNodes(undefined); // endpoint default (root)
    });

    enterBtn.addEventListener('click', () => {
        const selectedId    = nodeSelect.value;
        const selectedLabel = nodeSelect.options[nodeSelect.selectedIndex]?.text ?? selectedId;
        path.push({ id: selectedId, label: selectedLabel });
        loadNodes(selectedId);
    });

    backBtn.addEventListener('click', () => {
        path.pop();
        loadNodes(path.length ? path[path.length - 1].id : undefined);
    });

    // Saved immediately rather than debounced — picking a node is a deliberate,
    // one-shot action and the tab may be closed right after.
    useBtn.addEventListener('click', async () => {
        input.value        = nodeSelect.value;
        draft[field.key]   = nodeSelect.value;
        await registry.saveSettings(endpointId, draft);
    });

    return browseRow;
}

async function refreshLocalMarkdownUI() {
    const ep = registry.getById('local_markdown');

    preloadedHandle = await ep.getHandle();

    if (!preloadedHandle) {
        currentFileEl.textContent = 'No file chosen.';
        grantStep.style.display   = 'none';
        return;
    }

    currentFileEl.textContent = `✓ ${preloadedHandle.name}`;
    grantStep.style.display   = 'block';
    const perm = await preloadedHandle.queryPermission({ mode: 'readwrite' });
    updatePermissionUI(perm);
}

function updatePermissionUI(perm) {
    if (perm === 'granted') {
        permStatusEl.textContent     = '✓ Access granted';
        permStatusEl.className       = 'perm-granted';
        grantAccessBtn.style.display = 'none';
    } else {
        permStatusEl.textContent     = 'Access needed — click Grant after each browser restart.';
        permStatusEl.className       = 'perm-needed';
        grantAccessBtn.style.display = 'inline-block';
    }
}

// Pick file — showOpenFilePicker gives readwrite permission automatically
pickFileBtn.addEventListener('click', async () => {
    try {
        const [fileHandle] = await window.showOpenFilePicker({
            types:    [{ description: 'Markdown files', accept: { 'text/markdown': ['.md', '.markdown'] } }],
            multiple: false,
        });
        const ep = registry.getById('local_markdown');
        await ep.saveHandle(fileHandle);
        await refreshLocalMarkdownUI();
    } catch (e) {
        if (e.name !== 'AbortError') {
            currentFileEl.textContent = `Error: ${e.message}`;
        }
    }
});

// Grant file access — preloadedHandle is already in memory so requestPermission()
// is the first await and the user-activation requirement is satisfied
grantAccessBtn.addEventListener('click', async () => {
    if (!preloadedHandle) return;
    const perm = await preloadedHandle.requestPermission({ mode: 'readwrite' });
    updatePermissionUI(perm);
});

// Browser Storage UI
async function refreshBrowserStorageUI() {
    const ep   = registry.getById('browser_storage');
    const list = await ep.getAll();
    bsCountEl.textContent = `${list.length} bookmark${list.length === 1 ? '' : 's'} saved.`;
    bsExportResult.textContent = '';
}

function showExportResult(msg) {
    bsExportResult.textContent = msg;
    setTimeout(() => { bsExportResult.textContent = ''; }, 2000);
}

bsCopyMdBtn.addEventListener('click', async () => {
    const ep   = registry.getById('browser_storage');
    const list = await ep.getAll();
    await navigator.clipboard.writeText(ep.toMarkdown(list));
    showExportResult('Copied!');
});

bsCopyJsonBtn.addEventListener('click', async () => {
    const ep   = registry.getById('browser_storage');
    const list = await ep.getAll();
    await navigator.clipboard.writeText(JSON.stringify(list, null, 2));
    showExportResult('Copied!');
});

bsDownloadBtn.addEventListener('click', async () => {
    const ep      = registry.getById('browser_storage');
    const list    = await ep.getAll();
    const content = ep.toMarkdown(list);
    const url     = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(content);
    const a       = document.createElement('a');
    a.href     = url;
    a.download = 'plainmark-bookmarks.md';
    a.click();
    showExportResult('Downloaded!');
});

bsClearBtn.addEventListener('click', async () => {
    if (!confirm('Delete all bookmarks from browser storage? This cannot be undone.')) return;
    const ep = registry.getById('browser_storage');
    await ep.clear();
    await refreshBrowserStorageUI();
});

// Migrate section
function renderMigrateSelects(defaultDestId) {
    migrateSourceEl.replaceChildren();
    migrateDestEl.replaceChildren();
    for (const ep of registry.getAll()) {
        migrateSourceEl.appendChild(new Option(ep.name, ep.id));
        const destOpt    = new Option(ep.name, ep.id);
        destOpt.selected = ep.id === defaultDestId;
        migrateDestEl.appendChild(destOpt);
    }
}

migrateBtnEl.addEventListener('click', async () => {
    const sourceId = migrateSourceEl.value;
    const destId   = migrateDestEl.value;

    migrateBtnEl.disabled       = true;
    migrateResultEl.textContent = 'Reading source…';
    migrateResultEl.className   = '';

    try {
        const src   = await registry.getInitialized(sourceId);
        const items = await src.list();

        if (items === null) {
            migrateResultEl.textContent = `"${src.name}" does not support listing bookmarks.`;
            migrateResultEl.className   = 'error';
            return;
        }

        if (items.length === 0) {
            migrateResultEl.textContent = 'No bookmarks found in source.';
            return;
        }

        migrateResultEl.textContent = `Migrating ${items.length} bookmark(s)…`;
        const dest = await registry.getInitialized(destId);

        await dest.addMany(items);

        migrateResultEl.textContent = `Migrated ${items.length} bookmark(s) to ${dest.name}.`;
        migrateResultEl.className   = 'ok';

        if (destId === 'browser_storage') await refreshBrowserStorageUI();
    } catch (e) {
        migrateResultEl.textContent = e.message;
        migrateResultEl.className   = 'error';
    } finally {
        migrateBtnEl.disabled = false;
    }
});

init();
