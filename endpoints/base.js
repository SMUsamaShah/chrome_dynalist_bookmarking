export class BookmarkEndpoint {
    get id()   { throw new Error('not implemented'); }
    get name() { throw new Error('not implemented'); }

    // Optional warning shown inside this endpoint's card on the options page
    get warning() { return null; }

    // Optional array of { label, url } links shown inside this endpoint's card
    get links() { return []; }

    // Array of { key, label, type ('text'|'password'|'checkbox'), required, placeholder }
    get settingsSchema() { return []; }

    // True if this endpoint must run in a document context rather than the service
    // worker (e.g. the File System Access API). The popup executes these locally.
    get requiresDom() { return false; }

    async init(settings) {}

    // Returns { id: string }
    async add(title, url, note)  { throw new Error('not implemented'); }

    // Returns { ok: true } or throws
    async update(id, note)       {}

    // Returns { ok: true } or throws
    async delete(id)             {}

    // Returns { ok: boolean, message: string }
    async test()                 { return { ok: false, message: 'not implemented' }; }

    // Returns null if listing is not supported, or [{title, url, note}] if it is
    async list()                 { return null; }

    // Returns null if not supported, or [{id, label}] for the node picker
    async getNodes()             { return null; }

    // Milliseconds to wait between sequential add() calls in addMany()
    get addDelay()               { return 0; }

    // Add multiple bookmarks. Endpoints with a bulk API should override this.
    // The default implementation calls add() sequentially, respecting addDelay.
    async addMany(items) {
        for (let i = 0; i < items.length; i++) {
            if (i > 0 && this.addDelay) await new Promise(r => setTimeout(r, this.addDelay));
            await this.add(items[i].title, items[i].url, items[i].note);
        }
    }
}
