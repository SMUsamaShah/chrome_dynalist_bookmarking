import { DynalistEndpoint }       from './dynalist.js';
import { WorkflowyEndpoint }      from './workflowy.js';
import { LocalMarkdownEndpoint }  from './local_markdown.js';
import { DownloadsFileEndpoint }  from './downloads_file.js';
import { BrowserStorageEndpoint } from './browser_storage.js';
import { GistEndpoint }           from './gist.js';

const ALL_ENDPOINTS = [
    new DynalistEndpoint(),
    new WorkflowyEndpoint(),
    new GistEndpoint(),
    new LocalMarkdownEndpoint(),
    new DownloadsFileEndpoint(),
    new BrowserStorageEndpoint(),
];

export const registry = {
    getAll() {
        return ALL_ENDPOINTS;
    },

    has(id) {
        return ALL_ENDPOINTS.some(e => e.id === id);
    },

    getById(id) {
        return ALL_ENDPOINTS.find(e => e.id === id) ?? ALL_ENDPOINTS[0];
    },

    // Bookmarks are saved to every active endpoint. Older installs stored a single
    // `activeEndpoint` string — read it as a one-element list, dropped on the next write.
    async getActiveIds() {
        const r   = await chrome.storage.sync.get(['activeEndpoints', 'activeEndpoint']);
        const ids = Array.isArray(r.activeEndpoints)
            ? r.activeEndpoints
            : [r.activeEndpoint ?? 'dynalist'];
        // Drop unknown ids — getById() falls back to the first endpoint, so a stale id
        // would otherwise silently duplicate it into the fan-out.
        return ids.filter(id => this.has(id));
    },

    async setActiveIds(ids) {
        await chrome.storage.sync.set({ activeEndpoints: ids });
        await chrome.storage.sync.remove('activeEndpoint');
    },

    async getActiveList() {
        const ids = await this.getActiveIds();
        return Promise.all(ids.map(id => this.getInitialized(id)));
    },

    async getSettings(id) {
        const key    = `${id}Settings`;
        const stored = await chrome.storage.sync.get(key);
        return stored[key] ?? {};
    },

    async saveSettings(id, settings) {
        const key = `${id}Settings`;
        await chrome.storage.sync.set({ [key]: settings });
    },

    async getInitialized(id) {
        const ep       = this.getById(id);
        const settings = await this.getSettings(id);
        await ep.init(settings);
        return ep;
    },
};
