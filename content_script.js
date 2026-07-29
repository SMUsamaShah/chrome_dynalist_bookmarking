let dyniframe = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === 'openpopup') {
        // If popup already open, remove it first
        if (dyniframe) {
            dyniframe.remove();
            dyniframe = null;
        }

        // Capture any text the user has selected on the page
        const selectedText = window.getSelection().toString().trim();

        // Build query params from background-supplied data + selected text
        const data   = request.data || {};
        const params = new URLSearchParams();
        if (data.title)    params.set('title',    data.title);
        if (data.url)      params.set('url',      data.url);
        if (data.note)     params.set('note',     data.note);
        if (selectedText)  params.set('selected', selectedText);

        const src = chrome.runtime.getURL('popup.html') + '?' + params.toString();
        dyniframe = createPopup(src);

        sendResponse({ ok: true });
        return true;
    }
});

// Click outside the popup closes it
document.addEventListener('click', (event) => {
    if (dyniframe && event.target !== dyniframe) {
        dyniframe.remove();
        dyniframe = null;
    }
});

// Close message from popup iframe
window.addEventListener('message', (event) => {
    if (event.data?.plainmark === 'close' && dyniframe) {
        dyniframe.remove();
        dyniframe = null;
    }
});

function createPopup(src) {
    const iframe = document.createElement('iframe');
    iframe.src              = src;
    iframe.id               = 'plainmark-popup';
    iframe.style.margin     = '0';
    iframe.style.padding    = '0';
    iframe.style.position   = 'fixed';
    iframe.style.right      = '5px';
    iframe.style.top        = '5px';
    iframe.style.width      = '340px';
    iframe.style.height     = '160px';
    iframe.style.zIndex     = '2147483647';
    iframe.style.border     = '0';
    iframe.style.boxShadow  = '0 4px 16px rgba(0,0,0,0.18)';
    iframe.style.borderRadius = '8px';
    document.body.appendChild(iframe);
    return iframe;
}
