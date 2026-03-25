/* =====================================================
   FSE Digital Flipbook — Application Controller
   UI interactions, sharing, analytics, i18n
   ===================================================== */

(function () {
    'use strict';

    /* --- i18n Translations --- */
    const TRANSLATIONS = {
        en: {
            loading: 'Loading publication...',
            thumbnails: 'Thumbnails',
            bookmarks: 'Bookmarks',
            noBookmarks: 'No bookmarks yet. Click on a page to bookmark it.',
            shareTitle: 'Share this publication',
            copyLink: 'Copy link:',
            embedCode: 'Embed code:',
            copy: 'Copy',
            copied: 'Copied!',
            page: 'Page',
            of: 'of',
            download: 'Download PDF',
            print: 'Print',
            fullscreen: 'Fullscreen',
            exitFullscreen: 'Exit Fullscreen',
            share: 'Share',
            zoomIn: 'Zoom in',
            zoomOut: 'Zoom out',
            menu: 'Menu',
            prevPage: 'Previous page',
            nextPage: 'Next page',
            language: 'Language'
        },
        'zh-TW': {
            loading: '正在載入出版物...',
            thumbnails: '縮圖',
            bookmarks: '書籤',
            noBookmarks: '尚無書籤。點擊頁面以添加書籤。',
            shareTitle: '分享此出版物',
            copyLink: '複製連結：',
            embedCode: '嵌入代碼：',
            copy: '複製',
            copied: '已複製！',
            page: '頁',
            of: '/',
            download: '下載 PDF',
            print: '列印',
            fullscreen: '全螢幕',
            exitFullscreen: '退出全螢幕',
            share: '分享',
            zoomIn: '放大',
            zoomOut: '縮小',
            menu: '選單',
            prevPage: '上一頁',
            nextPage: '下一頁',
            language: '語言'
        },
        'zh-CN': {
            loading: '正在加载出版物...',
            thumbnails: '缩略图',
            bookmarks: '书签',
            noBookmarks: '暂无书签。点击页面以添加书签。',
            shareTitle: '分享此出版物',
            copyLink: '复制链接：',
            embedCode: '嵌入代码：',
            copy: '复制',
            copied: '已复制！',
            page: '页',
            of: '/',
            download: '下载 PDF',
            print: '打印',
            fullscreen: '全屏',
            exitFullscreen: '退出全屏',
            share: '分享',
            zoomIn: '放大',
            zoomOut: '缩小',
            menu: '菜单',
            prevPage: '上一页',
            nextPage: '下一页',
            language: '语言'
        },
        ja: {
            loading: '出版物を読み込み中...',
            thumbnails: 'サムネイル',
            bookmarks: 'ブックマーク',
            noBookmarks: 'ブックマークはまだありません。ページをクリックして追加してください。',
            shareTitle: 'この出版物を共有',
            copyLink: 'リンクをコピー：',
            embedCode: '埋め込みコード：',
            copy: 'コピー',
            copied: 'コピーしました！',
            page: 'ページ',
            of: '/',
            download: 'PDFダウンロード',
            print: '印刷',
            fullscreen: '全画面',
            exitFullscreen: '全画面を終了',
            share: '共有',
            zoomIn: '拡大',
            zoomOut: '縮小',
            menu: 'メニュー',
            prevPage: '前のページ',
            nextPage: '次のページ',
            language: '言語'
        }
    };

    /* --- Analytics Tracker --- */
    class AnalyticsTracker {
        constructor() {
            this.sessionId = this._generateId();
            this.startTime = Date.now();
            this.pageViews = {};
            this.events = [];
        }

        trackPageView(pageNum) {
            const now = Date.now();
            if (!this.pageViews[pageNum]) {
                this.pageViews[pageNum] = { views: 0, totalTime: 0, lastEnter: now };
            }
            this.pageViews[pageNum].views++;
            this.pageViews[pageNum].lastEnter = now;

            this._log('page_view', { page: pageNum });
        }

        trackPageLeave(pageNum) {
            if (this.pageViews[pageNum]) {
                const elapsed = Date.now() - this.pageViews[pageNum].lastEnter;
                this.pageViews[pageNum].totalTime += elapsed;
            }
        }

        trackEvent(eventName, data = {}) {
            this.events.push({
                event: eventName,
                data,
                timestamp: Date.now()
            });
            this._log(eventName, data);
        }

        getReport() {
            return {
                sessionId: this.sessionId,
                sessionDuration: Date.now() - this.startTime,
                pageViews: this.pageViews,
                events: this.events
            };
        }

        _log(event, data) {
            // Console log for development — replace with actual analytics endpoint
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log(`[Analytics] ${event}`, data);
            }

            // Integration point: send to your analytics service
            // Example: navigator.sendBeacon('/api/analytics', JSON.stringify({ event, data, sessionId: this.sessionId }));
        }

        _generateId() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
        }
    }

    /* --- Application Controller --- */
    class FlipbookApp {
        constructor() {
            this.engine = null;
            this.analytics = new AnalyticsTracker();
            this.currentLang = this._detectLanguage();
            this.sidebarOpen = false;
            this.bookmarks = this._loadBookmarks();
            this.thumbnailsLoaded = false;
            this._lastTrackedPage = 1;

            // DOM refs
            this.els = {};
        }

        async init() {
            this._cacheDOM();
            this._applyLanguage();

            this.engine = new FlipbookEngine({
                pdfUrl: this._getPdfUrl(),
                container: document.getElementById('flipbook'),
                viewer: document.getElementById('viewer'),
                flipbookContainer: document.getElementById('flipbook-container'),
                onPageChange: (page, total) => this._onPageChange(page, total),
                onReady: (info) => this._onReady(info),
                onProgress: (pct) => this._onProgress(pct),
                onError: (err) => this._onError(err),
                onZoomChange: (level) => this._updateZoomSelect(level)
            });

            await this.engine.init();
        }

        _getPdfUrl() {
            // Check URL params for custom PDF — validate to prevent loading arbitrary URLs
            const params = new URLSearchParams(window.location.search);
            const pdf = params.get('pdf');
            if (!pdf) return 'FSE brochure.pdf';
            // Only allow relative paths (no protocol, no //, no path traversal)
            if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(pdf) || pdf.includes('//') || pdf.includes('..')) {
                console.warn('Invalid pdf parameter ignored:', pdf);
                return 'FSE brochure.pdf';
            }
            return pdf;
        }

        _cacheDOM() {
            const ids = [
                'loading-screen', 'app', 'toolbar', 'toolbar-title',
                'btn-menu', 'btn-prev', 'btn-next', 'btn-zoom-in', 'btn-zoom-out',
                'btn-share', 'btn-download', 'btn-print', 'btn-fullscreen', 'btn-lang',
                'page-input', 'page-total', 'zoom-select',
                'sidebar', 'sidebar-content', 'thumbnail-grid', 'bookmark-list',
                'viewer', 'flipbook-container', 'flipbook',
                'nav-prev', 'nav-next',
                'page-scrubber', 'scrubber-preview',
                'share-modal', 'share-close', 'share-link-input', 'embed-code',
                'btn-copy-link', 'btn-copy-embed',
                'share-facebook', 'share-twitter', 'share-linkedin', 'share-email',
                'lang-dropdown', 'load-progress-bar', 'load-percent'
            ];

            ids.forEach(id => {
                this.els[id] = document.getElementById(id);
            });

            this._bindUIEvents();
        }

        _bindUIEvents() {
            // Navigation
            this.els['btn-prev'].addEventListener('click', () => this.engine.prevPage());
            this.els['btn-next'].addEventListener('click', () => this.engine.nextPage());
            this.els['nav-prev'].addEventListener('click', () => this.engine.prevPage());
            this.els['nav-next'].addEventListener('click', () => this.engine.nextPage());

            // Page input
            this.els['page-input'].addEventListener('change', (e) => {
                const page = parseInt(e.target.value, 10);
                if (page >= 1 && page <= this.engine.totalPages) {
                    this.engine.goToPage(page);
                } else {
                    e.target.value = this.engine.currentPage;
                }
            });

            this.els['page-input'].addEventListener('focus', (e) => e.target.select());

            // Zoom
            this.els['btn-zoom-in'].addEventListener('click', () => {
                const level = this.engine.zoomIn();
                this._updateZoomSelect(level);
            });

            this.els['btn-zoom-out'].addEventListener('click', () => {
                const level = this.engine.zoomOut();
                this._updateZoomSelect(level);
            });

            this.els['zoom-select'].addEventListener('change', (e) => {
                const level = this.engine.setZoom(parseFloat(e.target.value));
                this._updateZoomSelect(level);
            });

            // Sidebar toggle
            this.els['btn-menu'].addEventListener('click', () => this._toggleSidebar());

            // Sidebar tabs
            document.querySelectorAll('.sidebar-tab').forEach(tab => {
                tab.addEventListener('click', (e) => this._switchTab(e.target.dataset.tab));
            });

            // Fullscreen
            this.els['btn-fullscreen'].addEventListener('click', () => this._toggleFullscreen());

            // Download
            this.els['btn-download'].addEventListener('click', () => this._downloadPDF());

            // Print
            this.els['btn-print'].addEventListener('click', () => this._printPDF());

            // Share
            this.els['btn-share'].addEventListener('click', () => this._openShareModal());
            this.els['share-close'].addEventListener('click', () => this._closeShareModal());
            this.els['share-modal'].addEventListener('click', (e) => {
                if (e.target === this.els['share-modal']) this._closeShareModal();
            });

            // Share platforms
            this.els['share-facebook'].addEventListener('click', () => this._shareOn('facebook'));
            this.els['share-twitter'].addEventListener('click', () => this._shareOn('twitter'));
            this.els['share-linkedin'].addEventListener('click', () => this._shareOn('linkedin'));
            this.els['share-email'].addEventListener('click', () => this._shareOn('email'));

            // Copy buttons
            this.els['btn-copy-link'].addEventListener('click', () => this._copyToClipboard('share-link-input', 'btn-copy-link'));
            this.els['btn-copy-embed'].addEventListener('click', () => this._copyToClipboard('embed-code', 'btn-copy-embed'));

            // Language
            this.els['btn-lang'].addEventListener('click', (e) => {
                e.stopPropagation();
                this.els['lang-dropdown'].classList.toggle('hidden');
            });

            document.querySelectorAll('.lang-option').forEach(opt => {
                opt.addEventListener('click', (e) => {
                    this.currentLang = e.target.dataset.lang;
                    localStorage.setItem('flipbook-lang', this.currentLang);
                    this._applyLanguage();
                    this.els['lang-dropdown'].classList.add('hidden');
                });
            });

            // Close dropdowns on outside click
            document.addEventListener('click', (e) => {
                if (!this.els['btn-lang'].contains(e.target)) {
                    this.els['lang-dropdown'].classList.add('hidden');
                }
            });

            // Page scrubber — spread-based with two-page preview
            const scrubber = this.els['page-scrubber'];
            const preview = this.els['scrubber-preview'];
            let previewActive = false;
            let lastPreviewSpread = -1;
            let previewGen = 0;          // generation counter to discard stale renders

            const showSpreadPreview = async (spreadIdx, inputEl) => {
                if (spreadIdx < 0 || spreadIdx >= this.engine.totalSpreads) return;
                if (spreadIdx === lastPreviewSpread && !preview.classList.contains('hidden')) return;
                lastPreviewSpread = spreadIdx;
                const gen = ++previewGen;   // capture current generation

                // Position preview above the thumb
                const scrubberRect = inputEl.getBoundingClientRect();
                const ratio = spreadIdx / Math.max(1, this.engine.totalSpreads - 1);
                const thumbX = scrubberRect.left + ratio * scrubberRect.width;
                const sp = this.engine._getSpreadPages(spreadIdx);
                const isSingle = !sp.left || !sp.right;
                const previewW = isSingle ? 80 : 160;
                const left = Math.max(previewW / 2 + 4,
                    Math.min(thumbX - scrubberRect.left + 20,
                        scrubberRect.width + 20 - previewW / 2));
                preview.style.left = left + 'px';

                // Render thumbnails for spread
                try {
                    const container = document.createElement('div');
                    container.style.display = 'flex';
                    container.style.gap = '2px';

                    if (sp.left) {
                        const c = await this.engine.renderThumbnail(sp.left, 76);
                        if (gen !== previewGen) return;  // stale — discard
                        container.appendChild(c);
                    }
                    if (sp.right) {
                        const c = await this.engine.renderThumbnail(sp.right, 76);
                        if (gen !== previewGen) return;  // stale — discard
                        container.appendChild(c);
                    }

                    // Only update DOM if still current
                    preview.innerHTML = '';
                    preview.appendChild(container);

                    const label = document.createElement('div');
                    label.className = 'preview-label';
                    if (sp.left && sp.right) {
                        label.textContent = `${sp.left}-${sp.right} / ${this.engine.totalPages}`;
                    } else {
                        label.textContent = `${sp.left || sp.right} / ${this.engine.totalPages}`;
                    }
                    preview.appendChild(label);
                    preview.classList.remove('hidden');
                } catch (_) { /* ignore render errors during rapid scrub */ }
            };

            const hidePreview = () => {
                preview.classList.add('hidden');
                lastPreviewSpread = -1;
            };

            scrubber.addEventListener('input', (e) => {
                const spread = parseInt(e.target.value, 10);
                showSpreadPreview(spread, e.target);
                // Only navigate immediately — goToPage with no animation is fast
                const sp = this.engine._getSpreadPages(spread);
                const targetPage = sp.left || sp.right || 1;
                this.engine.goToPage(targetPage, false);
            });

            scrubber.addEventListener('mousedown', () => { previewActive = true; });
            scrubber.addEventListener('touchstart', () => { previewActive = true; }, { passive: true });

            scrubber.addEventListener('mousemove', (e) => {
                if (!previewActive) return;
                const spread = parseInt(scrubber.value, 10);
                showSpreadPreview(spread, scrubber);
            });

            const endScrub = () => {
                previewActive = false;
                setTimeout(hidePreview, 600);
            };
            scrubber.addEventListener('mouseup', endScrub);
            scrubber.addEventListener('touchend', endScrub);
            scrubber.addEventListener('mouseleave', () => {
                if (!previewActive) hidePreview();
            });

            // Fullscreen change handler
            document.addEventListener('fullscreenchange', () => this._onFullscreenChange());
            document.addEventListener('webkitfullscreenchange', () => this._onFullscreenChange());

            // ESC to close modal
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (!this.els['share-modal'].classList.contains('hidden')) {
                        this._closeShareModal();
                    }
                }
            });
        }

        /* --- Callbacks --- */
        _onReady(info) {
            // Hide loading, show app
            this.els['loading-screen'].classList.add('hidden');
            this.els['app'].classList.remove('hidden');

            // Set page info
            this.els['page-total'].textContent = info.totalPages;
            this.els['page-input'].max = info.totalPages;
            this.els['page-scrubber'].min = 0;
            this.els['page-scrubber'].max = this.engine.totalSpreads - 1;
            this.els['page-scrubber'].value = 0;

            this._updatePageUI(1, info.totalPages);
            this.analytics.trackPageView(1);

            // Re-fit now that viewer has real dimensions
            requestAnimationFrame(() => this.engine._fitBook());

            // Preload thumbnails in background
            this._loadThumbnails();
        }

        _onProgress(pct) {
            if (this.els['load-progress-bar']) {
                this.els['load-progress-bar'].style.width = pct + '%';
            }
            if (this.els['load-percent']) {
                this.els['load-percent'].textContent = pct + '%';
            }
        }

        _onError(err) {
            const loadingScreen = this.els['loading-screen'];
            if (loadingScreen) {
                const container = loadingScreen.querySelector('.loader-container');
                container.innerHTML = `
                    <p style="color: #e94560; font-size: 18px; margin-bottom: 12px;">⚠ Unable to load publication</p>
                    <p style="opacity: 0.7; font-size: 14px;">${this._escapeHtml(err.message || 'Unknown error')}</p>
                    <p style="opacity: 0.5; font-size: 12px; margin-top: 16px;">Please ensure the PDF file is accessible and try again.</p>
                `;
            }
        }

        _onPageChange(page, total) {
            // Track analytics — use stored previous page since engine.currentPage is already updated
            this.analytics.trackPageLeave(this._lastTrackedPage);
            this._lastTrackedPage = page;
            this.analytics.trackPageView(page);

            this._updatePageUI(page, total);
        }

        _updatePageUI(page, total) {
            // Determine which pages are visible in the current spread
            const engine = this.engine;
            let displayPage = page;
            if (engine && engine.currentSpread !== undefined) {
                const sp = engine._getSpreadPages(engine.currentSpread);
                displayPage = sp.left || sp.right || 1;
                // Show range like "2-3" for spreads
                if (sp.left && sp.right) {
                    this.els['page-input'].value = sp.left;
                } else {
                    this.els['page-input'].value = displayPage;
                }
            } else {
                this.els['page-input'].value = page;
            }

            this.els['page-scrubber'].value = engine.currentSpread;

            // Enable/disable buttons based on spread position
            const atStart = engine ? engine.currentSpread <= 0 : page <= 1;
            const atEnd = engine ? engine.currentSpread >= engine.totalSpreads - 1 : page >= total;
            this.els['btn-prev'].disabled = atStart;
            this.els['nav-prev'].disabled = atStart;
            this.els['btn-next'].disabled = atEnd;
            this.els['nav-next'].disabled = atEnd;

            // Update active thumbnails (highlight both pages in current spread)
            const visiblePages = new Set();
            if (engine && engine.currentSpread !== undefined) {
                const sp = engine._getSpreadPages(engine.currentSpread);
                if (sp.left) visiblePages.add(sp.left);
                if (sp.right) visiblePages.add(sp.right);
            } else {
                visiblePages.add(page);
            }

            document.querySelectorAll('.thumbnail-item').forEach(t => {
                t.classList.toggle('active', visiblePages.has(parseInt(t.dataset.page, 10)));
            });

            // Scroll active thumbnail into view
            const activeThumbnail = document.querySelector('.thumbnail-item.active');
            if (activeThumbnail) {
                activeThumbnail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        /* --- Zoom UI Helper --- */
        _updateZoomSelect(level) {
            const select = this.els['zoom-select'];
            const value = (level / 100).toString();
            const option = select.querySelector(`option[value="${value}"]`);
            if (option) {
                select.value = value;
            } else {
                // Remove previous custom option if any
                const custom = select.querySelector('option[data-custom]');
                if (custom) custom.remove();
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = level + '%';
                opt.dataset.custom = 'true';
                select.appendChild(opt);
                select.value = value;
            }
        }

        /* --- Sidebar --- */
        _toggleSidebar() {
            this.sidebarOpen = !this.sidebarOpen;
            this.els['sidebar'].classList.toggle('hidden', !this.sidebarOpen);
            this.els['viewer'].classList.toggle('sidebar-open', this.sidebarOpen);

            if (this.sidebarOpen && !this.thumbnailsLoaded) {
                this._loadThumbnails();
            }

            this.analytics.trackEvent('sidebar_toggle', { open: this.sidebarOpen });
        }

        _switchTab(tabName) {
            document.querySelectorAll('.sidebar-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.tab === tabName);
            });

            this.els['thumbnail-grid'].classList.toggle('hidden', tabName !== 'thumbnails');
            this.els['bookmark-list'].classList.toggle('hidden', tabName !== 'bookmarks');
        }

        async _loadThumbnails() {
            if (this.thumbnailsLoaded) return;

            const grid = this.els['thumbnail-grid'];
            grid.innerHTML = '';

            for (let i = 1; i <= this.engine.totalPages; i++) {
                const item = document.createElement('div');
                item.className = 'thumbnail-item' + (i === this.engine.currentPage ? ' active' : '');
                item.dataset.page = i;

                // Placeholder
                item.innerHTML = `<div style="height:120px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:12px;">${i}</div>`;
                item.querySelector('div').style.minHeight = '80px';

                const label = document.createElement('div');
                label.className = 'thumbnail-label';
                label.textContent = `${this._t('page')} ${i}`;
                item.appendChild(label);

                item.addEventListener('click', () => {
                    this.engine.goToPage(i);
                });

                grid.appendChild(item);
            }

            // Render thumbnails progressively
            for (let i = 1; i <= this.engine.totalPages; i++) {
                try {
                    const canvas = await this.engine.renderThumbnail(i, 200);
                    const item = grid.querySelector(`[data-page="${i}"]`);
                    if (item) {
                        const placeholder = item.querySelector('div:first-child');
                        if (placeholder && placeholder !== item.querySelector('.thumbnail-label')) {
                            item.replaceChild(canvas, placeholder);
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to render thumbnail for page ${i}:`, e);
                }
            }

            this.thumbnailsLoaded = true;
        }

        /* --- Bookmarks --- */
        _loadBookmarks() {
            try {
                return JSON.parse(localStorage.getItem('flipbook-bookmarks') || '[]');
            } catch {
                return [];
            }
        }

        _saveBookmarks() {
            localStorage.setItem('flipbook-bookmarks', JSON.stringify(this.bookmarks));
            this._renderBookmarks();
        }

        toggleBookmark(pageNum) {
            const idx = this.bookmarks.indexOf(pageNum);
            if (idx >= 0) {
                this.bookmarks.splice(idx, 1);
            } else {
                this.bookmarks.push(pageNum);
                this.bookmarks.sort((a, b) => a - b);
            }
            this._saveBookmarks();
        }

        _renderBookmarks() {
            const list = this.els['bookmark-list'];
            if (!list) return;

            if (this.bookmarks.length === 0) {
                list.innerHTML = `<p class="no-bookmarks">${this._t('noBookmarks')}</p>`;
                return;
            }

            list.innerHTML = '';
            this.bookmarks.forEach(pageNum => {
                const item = document.createElement('div');
                item.className = 'bookmark-item';
                item.innerHTML = `
                    <span>${this._t('page')} ${pageNum}</span>
                    <button class="bookmark-remove" title="Remove">&times;</button>
                `;

                item.querySelector('span').addEventListener('click', () => {
                    this.engine.goToPage(pageNum);
                });

                item.querySelector('.bookmark-remove').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleBookmark(pageNum);
                });

                list.appendChild(item);
            });
        }

        /* --- Fullscreen --- */
        _toggleFullscreen() {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            } else {
                const el = document.documentElement;
                (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
            }
            this.analytics.trackEvent('fullscreen_toggle');
        }

        _onFullscreenChange() {
            const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
            const icon = document.getElementById('icon-fullscreen');
            if (icon) {
                if (isFS) {
                    icon.innerHTML = '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>';
                } else {
                    icon.innerHTML = '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>';
                }
            }
        }

        /* --- Download --- */
        _downloadPDF() {
            const link = document.createElement('a');
            link.href = this.engine.pdfUrl;
            link.download = 'FSE-Brochure.pdf';
            link.click();
            this.analytics.trackEvent('download');
        }

        /* --- Print --- */
        _printPDF() {
            // Open PDF in new window for printing
            const printWindow = window.open(this.engine.pdfUrl, '_blank');
            if (printWindow) {
                printWindow.addEventListener('load', () => {
                    printWindow.print();
                });
            }
            this.analytics.trackEvent('print');
        }

        /* --- Sharing --- */
        _openShareModal() {
            const url = window.location.href;
            this.els['share-link-input'].value = url;

            const embedWidth = 800;
            const embedHeight = 600;
            this.els['embed-code'].value =
                `<iframe src="${this._escapeHtml(url)}" width="${embedWidth}" height="${embedHeight}" frameborder="0" allowfullscreen></iframe>`;

            this.els['share-modal'].classList.remove('hidden');
            this.analytics.trackEvent('share_modal_open');
        }

        _closeShareModal() {
            this.els['share-modal'].classList.add('hidden');
        }

        _shareOn(platform) {
            const url = encodeURIComponent(window.location.href);
            const title = encodeURIComponent(document.title);
            let shareUrl = '';

            switch (platform) {
                case 'facebook':
                    shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
                    break;
                case 'twitter':
                    shareUrl = `https://twitter.com/intent/tweet?url=${url}&text=${title}`;
                    break;
                case 'linkedin':
                    shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
                    break;
                case 'email':
                    shareUrl = `mailto:?subject=${title}&body=${url}`;
                    break;
            }

            if (shareUrl) {
                if (platform === 'email') {
                    window.location.href = shareUrl;
                } else {
                    window.open(shareUrl, '_blank', 'width=600,height=400,noopener,noreferrer');
                }
            }

            this.analytics.trackEvent('share', { platform });
        }

        _copyToClipboard(inputId, btnId) {
            const input = this.els[inputId];
            const btn = this.els[btnId];

            if (input && navigator.clipboard) {
                navigator.clipboard.writeText(input.value).then(() => {
                    const origText = btn.textContent;
                    btn.textContent = this._t('copied');
                    btn.classList.add('copied');
                    setTimeout(() => {
                        btn.textContent = origText;
                        btn.classList.remove('copied');
                    }, 2000);
                });
            } else if (input) {
                // Fallback for older browsers
                input.select();
                document.execCommand('copy');
            }

            this.analytics.trackEvent('copy', { type: inputId });
        }

        /* --- Language / i18n --- */
        _detectLanguage() {
            const saved = localStorage.getItem('flipbook-lang');
            if (saved && TRANSLATIONS[saved]) return saved;

            const browserLang = navigator.language || navigator.userLanguage;
            if (TRANSLATIONS[browserLang]) return browserLang;

            // Try base language
            const base = browserLang.split('-')[0];
            const match = Object.keys(TRANSLATIONS).find(k => k.startsWith(base));
            return match || 'en';
        }

        _t(key) {
            return (TRANSLATIONS[this.currentLang] || TRANSLATIONS['en'])[key] || key;
        }

        _applyLanguage() {
            // Update all elements with data-i18n attribute
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                const translation = this._t(key);
                if (translation) el.textContent = translation;
            });

            // Update language dropdown active state
            document.querySelectorAll('.lang-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.lang === this.currentLang);
            });

            // Re-render bookmarks with new language
            this._renderBookmarks();
        }

        /* --- Security Helper --- */
        _escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    }

    /* --- Bootstrap --- */
    document.addEventListener('DOMContentLoaded', () => {
        const app = new FlipbookApp();
        app.init().catch(err => {
            console.error('Failed to initialize flipbook:', err);
        });

        // Expose for debugging (optional)
        window.__flipbookApp = app;
    });
})();
