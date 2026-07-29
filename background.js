import { registry }    from './endpoints/registry.js';
import { getURLTitle } from './util.js';

// Create context menus once on install/update to avoid "already exists" errors
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({ id: 'save-page',      title: 'Save page',    contexts: ['page'] });
        chrome.contextMenus.create({ id: 'save-link',      title: 'Save link',    contexts: ['link'] });
        chrome.contextMenus.create({ id: 'save-selection', title: "Save '%s'",    contexts: ['selection'] });
    });
});

// All context menu saves open the popup with prefilled data so the user can add notes
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    let data = {};

    if (info.menuItemId === 'save-page') {
        data = { title: tab.title, url: tab.url };

    } else if (info.menuItemId === 'save-link') {
        let linkTitle = '';
        try { linkTitle = await getURLTitle(info.linkUrl); } catch (_) {}
        data = {
            title: linkTitle || info.linkUrl,
            url:   info.linkUrl,
            note:  `Source: ${tab.title} ${tab.url}`,
        };

    } else if (info.menuItemId === 'save-selection') {
        data = {
            title: info.selectionText,
            url:   tab.url,
            note:  `${tab.title} ${tab.url}`,
        };
    }

    chrome.tabs.sendMessage(tab.id, { message: 'openpopup', data });
});

// Icon click: open popup with current tab data (pass title+url so popup doesn't need to query tabs)
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, {
        message: 'openpopup',
        data: { title: tab.title, url: tab.url },
    });
});

// Message handler for popup ↔ service worker communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    handleMessage(request)
        .then(sendResponse)
        .catch(e => sendResponse({ error: e.message }));
    return true; // keep channel open for async response
});

// Run op against every endpoint, letting each succeed or fail on its own — a bookmark
// that reaches three of four targets is still saved to those three.
// Returns [{ endpointId, id?, error? }].
async function fanOut(endpoints, op) {
    const settled = await Promise.allSettled(endpoints.map(op));
    return settled.map((r, i) => (
        r.status === 'fulfilled'
            ? { endpointId: endpoints[i].id, id: r.value?.id }
            : { endpointId: endpoints[i].id, error: r.reason?.message ?? String(r.reason) }
    ));
}

// Endpoints named in an { endpointId: bookmarkId } map that the worker can run.
// requiresDom endpoints are dropped — the popup runs those in its own document.
async function workerTargetsFor(ids = {}) {
    const targets = await Promise.all(
        Object.keys(ids)
            .filter(id => registry.has(id))
            .map(id => registry.getInitialized(id)),
    );
    return targets.filter(ep => !ep.requiresDom);
}

async function handleMessage(request) {
    switch (request.message) {
        case 'getConfig': {
            const active = await registry.getActiveList();
            return {
                endpoints: active.map(ep => ({
                    id:          ep.id,
                    name:        ep.name,
                    requiresDom: ep.requiresDom,
                })),
            };
        }

        case 'add': {
            const targets = (await registry.getActiveList()).filter(ep => !ep.requiresDom);
            return {
                results: await fanOut(targets, ep => ep.add(request.title, request.url, request.note)),
            };
        }

        // update/delete walk the ids the popup actually captured rather than the active
        // list, so editing still works if a target is unchecked while the popup is open.
        case 'update': {
            const targets = await workerTargetsFor(request.ids);
            return {
                results: await fanOut(targets, ep => ep.update(request.ids[ep.id], request.note)),
            };
        }

        case 'delete': {
            const targets = await workerTargetsFor(request.ids);
            return {
                results: await fanOut(targets, ep => ep.delete(request.ids[ep.id])),
            };
        }

        default:
            return { error: `unknown message: ${request.message}` };
    }
}
