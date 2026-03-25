# FSE Digital Flipbook — Publication Viewer

An interactive online publication viewer for the FSE Engineering Group brochure with FlippingBook-style functionality.

## Features

- **Interactive Page Flipping** — Smooth CSS-based page-turning animations with click, swipe, and keyboard navigation
- **Responsive Design** — Optimised for desktops, tablets, and smartphones with auto-switching between single-page and spread modes
- **PDF Rendering** — Uses PDF.js to render any PDF as an interactive flipbook
- **Thumbnail Navigation** — Sidebar with page thumbnails for quick navigation
- **Bookmarks** — Save/load page bookmarks (persisted in localStorage)
- **Zoom Controls** — Zoom in/out with buttons, keyboard shortcuts (Ctrl/Cmd +/-), or trackpad pinch
- **Fullscreen Mode** — Immersive full-screen reading experience
- **Social Sharing** — Share via Facebook, Twitter/X, LinkedIn, or Email
- **Embed Support** — Copy-paste iframe embed code for websites/blogs
- **Download & Print** — Direct PDF download and print options
- **Multi-language** — English, 繁體中文, 简体中文, 日本語
- **Analytics** — Built-in page view and engagement tracking (extensible)
- **Accessibility** — Keyboard navigation, ARIA labels, focus-visible outlines, high-contrast and reduced-motion support

## Project Structure

```
Digital_Flipbook/
├── index.html              # Main full-featured viewer
├── embed.html              # Lightweight embeddable viewer
├── css/
│   └── flipbook.css        # All styles (responsive, print, a11y)
├── js/
│   ├── flipbook-engine.js  # Core engine: PDF loading, rendering, flip, zoom
│   └── app.js              # UI controller: toolbar, sharing, analytics, i18n
├── assets/                 # Directory for additional assets
├── FSE brochure.pdf        # The source PDF brochure
├── Instruction.md          # Original requirements
└── README.md               # This file
```

## Quick Start

### 1. Local Preview

Serve the project with any static file server:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

> **Note:** PDF.js requires HTTP(S) to load PDFs. Opening `index.html` directly via `file://` may not work in all browsers.

### 2. Deploy to Your Website

Upload the entire project folder to your web server. The viewer will automatically load `FSE brochure.pdf` from the same directory.

### 3. Use a Different PDF

Pass the PDF filename as a URL parameter:

```
https://yoursite.com/flipbook/?pdf=my-catalog.pdf
```

### 4. Embed on a Website or Blog

Use the iframe embed code (also available via the Share button):

```html
<iframe 
  src="https://yoursite.com/flipbook/embed.html" 
  width="800" 
  height="600" 
  frameborder="0" 
  allowfullscreen>
</iframe>
```

You can also specify a starting page:

```html
<iframe src="https://yoursite.com/flipbook/embed.html?page=3" ...></iframe>
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `Page Up` | Previous page |
| `→` / `Page Down` / `Space` | Next page |
| `Home` | First page |
| `End` | Last page |
| `Ctrl/Cmd +` | Zoom in |
| `Ctrl/Cmd -` | Zoom out |
| `Esc` | Close modal |

## Analytics Integration

The built-in analytics tracker logs page views, session duration, and events. To connect it to your analytics service (e.g., Google Analytics, Mixpanel), modify the `_log` method in `js/app.js`:

```javascript
_log(event, data) {
    // Example: Google Analytics 4
    gtag('event', event, data);
    
    // Example: Custom API
    navigator.sendBeacon('/api/analytics', JSON.stringify({
        event, data, sessionId: this.sessionId
    }));
}
```

## Adding More Languages

Edit the `TRANSLATIONS` object in `js/app.js`:

```javascript
const TRANSLATIONS = {
    // Add your language:
    'ko': {
        loading: '출판물 로드 중...',
        thumbnails: '미리보기',
        // ... all keys
    }
};
```

Then add a button in `index.html` inside `#lang-dropdown`:

```html
<button class="lang-option" data-lang="ko">한국어</button>
```

## Browser Support

- Chrome / Edge 88+
- Firefox 85+
- Safari 14+
- Mobile Safari / Chrome (iOS 14+, Android 10+)

## Dependencies

- [PDF.js 3.11.174](https://mozilla.github.io/pdf.js/) — Mozilla's PDF rendering library (loaded from CDN)

No build tools, no npm packages, no frameworks — pure HTML/CSS/JS.

## License

Internal use — FSE Engineering Group Limited.
