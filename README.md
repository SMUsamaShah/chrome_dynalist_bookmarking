# Plainmark

Chrome extension to save URLs (+title +notes) to various plain text targets (local makdown file, Workflowy, Dynalist, Gist). 

My main goals were:
- Easy bookmarking with a note. Selected text while bookmarking becomes its note.   
  I think that all tools that allow bookmarking a thing (github stars for example) should also have a note. Lots of time when I go back to github stars, twitter saves, steam wishlists, I forget what made me save that.
- Plain text.  
  List of saved links should not need a software.

What it is not meant to do:
- Browsing bookmarks
- Folders (use notes, may be add your own hashtag as a note e.g. #game, #invention and then search for that where your bookarks are going)

Made this to work with Dynalist originally where I could dump any interesting URLs with a note. Could also share interesting links, app urls etc from my android phone too using HTTP Request Shortcuts
 https://play.google.com/store/apps/details?id=ch.rmy.android.http_shortcuts 

## Usage

- Click the extension icon in toolbar
- Right-click → "Save page" on page or a link, or selected text. Selected text becomes 
- A popup in upper right corner will appear to add/edit the note on that bookmark. Can also delete the bookmark from that popup.

## Bookmark targets

- Local markdown file
- Dynalist
- Workflowy
- Github Gist
- Downloads folder file
- Browser storage (not recommended, can be cleared by Chrome)

You can enable more than one at a time. Every bookmark is saved to all of them, so
you can keep Dynalist for daily use and a Gist as a plain text backup. If one target
fails (expired token, no network) the bookmark is still saved to the others and the
popup tells you which one didn't take it.

## Install

1. Clone or download this repo
2. Go to `chrome://extensions` → enable Developer mode → Load unpacked → select this folder
3. Open the extension options, tick one or more targets, fill in any required settings

Each target is a card in the options page. Expand a card to configure it — you don't
have to enable it first, so you can paste a token and hit Test before switching it on.

# Future Ideas, maybe

- When writing note in the box, typing # should show an autocomplete list of predefined hashtags. This is to allow easier searching. But search should not depend on tags probably
  (may be)
- Show all bookmarks on the options page.
  (Not sure if it should be done at all, bookmarks are mostly a url dump)
- Categories.
  (Probably a bad idea, this will become increasingly complex based on target endpoint. Markdown needs headings and putting a link under that heading. Dynalist/workflowy will require specifying each node ID for that category. Yeah bad idea)
- Customise bookmark format.  
  (it will be nice to let user customise the exact format of the bookmark. but what happens to existing bookmarks then? it will make migration to a different end point complicated if we allow changing the format. One way could be to customise format at the beginning. But there is no way to know the beginning. User might have reinstalled the extension and there are already bookmarks in an existing format. I think we shouldn't make it customisable)
  
