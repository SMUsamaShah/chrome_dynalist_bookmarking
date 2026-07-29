import { BookmarkEndpoint } from './base.js';

const IDB_NAME    = 'plainmark';
const IDB_VERSION = 1;
const STORE_NAME  = 'handles';
const HANDLE_KEY  = 'localMarkdown';

// IndexedDB helpers — work in service worker and extension page contexts
function openIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME);
        req.onsuccess       = e => resolve(e.target.result);
        req.onerror         = e => reject(e.target.error);
    });
}

async function idbGet(key) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

async function idbPut(key, value) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
    });
}

export class LocalMarkdownEndpoint extends BookmarkEndpoint {
    get id()   { return 'local_markdown'; }
    get name() { return 'Local Markdown File'; }

    get settingsSchema() { return []; }

    // The File System Access API and its persisted handles are unavailable in an
    // MV3 service worker, so this endpoint always runs in the popup's document.
    get requiresDom() { return true; }

    async init(_settings = {}) {}

    // Must be called from DOM context (not service worker).
    // Returns { id: lineStart } — the 0-indexed line number, used by update/delete
    // within the same popup session.
    async add(title, url, note) {
        const handle = await this._requireHandle();

        const file      = await handle.getFile();
        const content   = await file.text();
        const lineStart = this._lineCount(content);

        const entry   = this._formatEntry({ title, url, note });
        const updated = (content && !content.endsWith('\n') ? content + '\n' : content) + entry + '\n';

        const writable = await handle.createWritable();
        await writable.write(updated);
        await writable.close();

        return { id: lineStart };
    }

    // lineStart is the value returned by add(). Silently skips if file/permission unavailable.
    async update(lineStart, note) {
        const handle = await idbGet(HANDLE_KEY);
        if (!handle) return { ok: true };
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') return { ok: true };

        const file    = await handle.getFile();
        const content = await file.text();
        const lines   = content.split('\n');

        if (!lines[lineStart]?.startsWith('- ')) return { ok: true };

        if (lines[lineStart + 1]?.startsWith('  > ')) lines.splice(lineStart + 1, 1);
        if (note) lines.splice(lineStart + 1, 0, `  > ${note}`);

        const writable = await handle.createWritable();
        await writable.write(lines.join('\n'));
        await writable.close();
        return { ok: true };
    }

    async delete(lineStart) {
        const handle = await idbGet(HANDLE_KEY);
        if (!handle) return { ok: true };
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') return { ok: true };

        const file    = await handle.getFile();
        const content = await file.text();
        const lines   = content.split('\n');

        if (!lines[lineStart]?.startsWith('- ')) return { ok: true };

        const hasNote = lines[lineStart + 1]?.startsWith('  > ');
        lines.splice(lineStart, hasNote ? 2 : 1);

        let updated = lines.join('\n');
        if (updated && !updated.endsWith('\n')) updated += '\n';

        const writable = await handle.createWritable();
        await writable.write(updated);
        await writable.close();
        return { ok: true };
    }

    async saveHandle(fileHandle) {
        await idbPut(HANDLE_KEY, fileHandle);
    }

    getHandle() {
        return idbGet(HANDLE_KEY);
    }

    async getFileName() {
        const handle = await idbGet(HANDLE_KEY);
        return handle?.name ?? null;
    }

    async test() {
        const handle = await idbGet(HANDLE_KEY);
        if (!handle) return { ok: false, message: 'No file selected.' };
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        return { ok: true, message: `File: ${handle.name} (permission: ${perm})` };
    }

    async list() {
        const handle = await idbGet(HANDLE_KEY);
        if (!handle) return null;
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') throw new Error('File access not granted. Click "Grant file access" in Options first.');

        const file    = await handle.getFile();
        const content = await file.text();
        const lines   = content.split('\n');
        const results = [];

        for (let i = 0; i < lines.length; i++) {
            if (!lines[i].startsWith('- ')) continue;
            const raw      = lines[i].slice(2);
            const urlMatch = raw.match(/(https?:\/\/\S+)$/);
            const url      = urlMatch ? urlMatch[1] : '';
            const title    = url ? raw.slice(0, -url.length).trimEnd() : raw;
            const note     = lines[i + 1]?.startsWith('  > ') ? lines[i + 1].slice(4) : '';
            if (title) results.push({ title, url, note });
        }
        return results;
    }

    _formatEntry({ title, url, note }) {
        const line = url ? `- ${title} ${url}` : `- ${title}`;
        return note ? `${line}\n  > ${note}` : line;
    }

    // Number of content lines (trailing \n doesn't add a line)
    _lineCount(content) {
        if (!content) return 0;
        const n = content.split('\n').length;
        return content.endsWith('\n') ? n - 1 : n;
    }

    async _requireHandle() {
        const handle = await idbGet(HANDLE_KEY);
        if (!handle) throw new Error('No file selected. Open ⚙ Options to pick a Markdown file.');
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') throw new Error(`Open ⚙ Options → Grant access to ${handle.name}`);
        return handle;
    }
}
