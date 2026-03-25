/* =====================================================
   FSE Digital Flipbook — Core Engine v2
   Realistic 3D page-flip with spread (book) layout
   ===================================================== */

class FlipbookEngine {
    constructor(options = {}) {
        this.pdfUrl = options.pdfUrl || 'FSE brochure.pdf';
        this.viewerEl = options.viewer || document.getElementById('viewer');
        this.containerEl = options.flipbookContainer || document.getElementById('flipbook-container');
        this.flipbookEl = options.container || document.getElementById('flipbook');

        // PDF state
        this.pdfDoc = null;
        this.totalPages = 0;
        this.pageCache = new Map();
        this.renderScale = 2;
        this.pageWidth = 0;
        this.pageHeight = 0;

        // Spread state  — always two-page spread
        // Spread 0: [_, page1]  (cover)
        // Spread 1: [page2, page3]
        // Spread 2: [page4, page5] ...
        this.currentSpread = 0;
        this.totalSpreads = 0;
        this.currentPage = 1;

        // Zoom
        this.zoom = 1;
        this.minZoom = 0.5;
        this.maxZoom = 2;
        this.zoomPresets = [0.5, 0.75, 1, 1.25, 1.5, 2];

        // Flip state
        this.isFlipping = false;
        this._queuedSpread = null;
        this._shadowTimers = [];

        // Interactive drag
        this.isDragging = false;
        this._setupPromise = null;
        this._dragCancelled = false;
        this.dragStartX = 0;
        this.dragDirection = null;   // 'forward' | 'backward'
        this.dragAngle = 0;          // degrees
        this.dragBookRect = null;

        // DOM — created dynamically
        this.bookEl = null;
        this.leftEl = null;
        this.rightEl = null;
        this.flipEl = null;

        // Callbacks
        this.onPageChange = options.onPageChange || (() => {});
        this.onReady = options.onReady || (() => {});
        this.onProgress = options.onProgress || (() => {});
        this.onError = options.onError || (() => {});
        this.onZoomChange = options.onZoomChange || (() => {});

        this._handleKeyDown = this._handleKeyDown.bind(this);
        this._handleResize = this._debounce(this._handleResize.bind(this), 200);
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._handleWheel = this._handleWheel.bind(this);
    }

    /* ========== Initialization ========== */

    async init() {
        try {
            if (typeof pdfjsLib !== 'undefined') {
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            await this._loadPDF();

            const firstPage = await this.pdfDoc.getPage(1);
            const vp = firstPage.getViewport({ scale: 1 });
            this.pageWidth = vp.width;
            this.pageHeight = vp.height;

            this.totalSpreads = Math.ceil((this.totalPages + 1) / 2);

            this._buildBookDOM();
            await this._renderCurrentSpread();
            this._fitBook();
            this._bindEvents();

            this.onReady({ totalPages: this.totalPages });
        } catch (err) {
            console.error('FlipbookEngine init error:', err);
            this.onError(err);
        }
    }

    async _loadPDF() {
        const loadingTask = pdfjsLib.getDocument(this.pdfUrl);
        loadingTask.onProgress = (p) => {
            if (p.total > 0) this.onProgress(Math.round((p.loaded / p.total) * 100));
        };
        this.pdfDoc = await loadingTask.promise;
        this.totalPages = this.pdfDoc.numPages;
    }

    /* ========== Spread helpers ========== */

    _getSpreadPages(s) {
        if (s < 0 || s >= this.totalSpreads) return { left: null, right: null };
        if (s === 0) return { left: null, right: 1 };
        const l = s * 2, r = l + 1;
        return {
            left: l <= this.totalPages ? l : null,
            right: r <= this.totalPages ? r : null
        };
    }

    _pageToSpread(page) {
        if (page <= 1) return 0;
        return Math.ceil((page - 1) / 2);
    }

    _isSinglePageSpread(s) {
        if (s === 0) return true;
        if (s === this.totalSpreads - 1) {
            const sp = this._getSpreadPages(s);
            return sp.left === null || sp.right === null;
        }
        return false;
    }

    /* ========== DOM construction ========== */

    _buildBookDOM() {
        this.flipbookEl.innerHTML = '';
        this.flipbookEl.className = 'flipbook-book';

        this.bookEl = document.createElement('div');
        this.bookEl.className = 'book';

        // Left page
        this.leftEl = document.createElement('div');
        this.leftEl.className = 'book-page book-left';
        this.leftEl.innerHTML = '<div class="page-content"></div><div class="page-shadow-overlay"></div>';

        // Right page
        this.rightEl = document.createElement('div');
        this.rightEl.className = 'book-page book-right';
        this.rightEl.innerHTML = '<div class="page-content"></div><div class="page-shadow-overlay"></div>';

        this.bookEl.appendChild(this.leftEl);
        this.bookEl.appendChild(this.rightEl);
        this.flipbookEl.appendChild(this.bookEl);
    }

    /* ========== Rendering ========== */

    async _renderPage(pageNum) {
        const key = `${pageNum}-${this.renderScale}`;
        if (this.pageCache.has(key)) return this.pageCache.get(key);

        const page = await this.pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: this.renderScale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;

        const data = { canvas, width: viewport.width, height: viewport.height };
        this.pageCache.set(key, data);
        return data;
    }

    _cloneCanvas(src) {
        const c = document.createElement('canvas');
        c.width = src.width;
        c.height = src.height;
        c.getContext('2d').drawImage(src, 0, 0);
        return c;
    }

    async _renderInto(container, pageNum) {
        container.innerHTML = '';
        if (!pageNum) return;
        const d = await this._renderPage(pageNum);
        container.appendChild(this._cloneCanvas(d.canvas));
    }

    async _renderCurrentSpread() {
        const sp = this._getSpreadPages(this.currentSpread);
        await Promise.all([
            this._renderInto(this.leftEl.querySelector('.page-content'), sp.left),
            this._renderInto(this.rightEl.querySelector('.page-content'), sp.right)
        ]);
        this.leftEl.classList.toggle('empty', sp.left === null);
        this.rightEl.classList.toggle('empty', sp.right === null);
        this.currentPage = sp.left || sp.right || 1;
        this._fitBook();
    }

    _fitBook() {
        const vr = this.viewerEl.getBoundingClientRect();
        const pad = 10;
        const availW = vr.width - pad * 2;
        const availH = vr.height - pad * 2;
        const isSingle = this._isSinglePageSpread(this.currentSpread);
        const bookW = isSingle ? this.pageWidth : this.pageWidth * 2;
        const bookH = this.pageHeight;
        const scale = Math.min(availW / bookW, availH / bookH) * this.zoom;

        this.bookEl.style.width = bookW + 'px';
        this.bookEl.style.height = bookH + 'px';
        this.bookEl.classList.toggle('single-page', isSingle);
        this.flipbookEl.style.transform = `scale(${scale})`;
        this.flipbookEl.style.transformOrigin = 'center center';
    }

    _forceDoubleLayout(animate = true) {
        const vr = this.viewerEl.getBoundingClientRect();
        const pad = 10;
        const availW = vr.width - pad * 2;
        const availH = vr.height - pad * 2;
        const bookW = this.pageWidth * 2;
        const scale = Math.min(availW / bookW, availH / this.pageHeight) * this.zoom;
        if (!animate) {
            this.flipbookEl.style.transition = 'none';
            this.bookEl.style.transition = 'none';
        }
        this.bookEl.classList.remove('single-page');
        this.bookEl.style.width = bookW + 'px';
        this.flipbookEl.style.transform = `scale(${scale})`;
        if (!animate) {
            void this.bookEl.offsetHeight;
            this.flipbookEl.style.transition = '';
            this.bookEl.style.transition = '';
        }
    }

    /* ========== Navigation ========== */

    async goToPage(pageNum, animate = true) {
        pageNum = Math.max(1, Math.min(pageNum, this.totalPages));
        const target = this._pageToSpread(pageNum);
        if (target === this.currentSpread) return;
        if (animate) {
            if (this.isFlipping) return;
            if (target > this.currentSpread) await this._flipForward();
            else await this._flipBackward();
            // If we need to jump multiple spreads, keep going
            if (this._pageToSpread(pageNum) !== this.currentSpread) {
                await this.goToPage(pageNum, false);
            }
        } else {
            // Non-animated jump: force-cancel any ongoing flip so scrubber always works
            if (this.isFlipping) {
                this.isDragging = false;
                this._dragCancelled = true;
                this.isFlipping = false;
            }
            this._cleanupOrphanedFlips();
            this.currentSpread = target;
            await this._renderCurrentSpread();
            this.onPageChange(this.currentPage, this.totalPages);
        }
    }

    async nextPage() {
        const target = this.currentSpread + 1;
        if (target >= this.totalSpreads) return;
        if (this.isFlipping) {
            this._queuedSpread = Math.min(target + 1, this.totalSpreads - 1);
            return;
        }
        await this._flipForward();
    }

    async prevPage() {
        const target = this.currentSpread - 1;
        if (target < 0) return;
        if (this.isFlipping) {
            this._queuedSpread = Math.max(target - 1, 0);
            return;
        }
        await this._flipBackward();
    }

    async _processQueue() {
        if (this._queuedSpread !== null && this._queuedSpread !== this.currentSpread) {
            const target = this._queuedSpread;
            this._queuedSpread = null;
            this._cleanupOrphanedFlips();
            this.currentSpread = target;
            await this._renderCurrentSpread();
            this.onPageChange(this.currentPage, this.totalPages);
        } else {
            this._queuedSpread = null;
        }
    }

    /* ========== Safety cleanup ========== */

    _cleanupOrphanedFlips() {
        if (this.flipEl) {
            if (this.flipEl._flipRAF) cancelAnimationFrame(this.flipEl._flipRAF);
            this.flipEl.remove();
            this.flipEl = null;
        }
        // Remove any orphaned flip elements from previous interactions
        this.bookEl.querySelectorAll('.flip-element').forEach(el => {
            if (el._flipRAF) cancelAnimationFrame(el._flipRAF);
            el.remove();
        });
    }

    /* ========== 3D Flip Animation ========== */

    async _flipForward() {
        if (this.isFlipping || this.currentSpread >= this.totalSpreads - 1) return;
        this.isFlipping = true;
        this._cleanupOrphanedFlips();

        // When leaving a single-page spread, expand to double instantly
        // but keep the empty side hidden so the user never sees a blank page
        let hiddenEl = null;
        if (this._isSinglePageSpread(this.currentSpread)) {
            const sp = this._getSpreadPages(this.currentSpread);
            hiddenEl = sp.left === null ? this.leftEl : this.rightEl;
            hiddenEl.style.visibility = 'hidden';
            this._forceDoubleLayout(false);   // instant, no 350ms wait
        }

        const curSp = this._getSpreadPages(this.currentSpread);
        const nxtSp = this._getSpreadPages(this.currentSpread + 1);

        // Build flip element
        const flip = this._createFlipEl();
        // Front face = current right page
        await this._renderInto(flip.querySelector('.flip-front .page-content'), curSp.right);
        // Back face = next left page
        await this._renderInto(flip.querySelector('.flip-back .page-content'), nxtSp.left);

        // Put next right page under
        await this._renderInto(this.rightEl.querySelector('.page-content'), nxtSp.right);
        this.rightEl.classList.toggle('empty', nxtSp.right === null);

        // Position flip over right half, hinge on left (spine)
        flip.classList.add('flip-forward');
        this.bookEl.appendChild(flip);

        // Use JS keyframe animation for rolling paper curl
        this._animateFlip(flip, 'forward');

        // Animate shadows
        this._animateShadows(flip, 'forward');

        await this._waitFlipAnimation(flip);

        // Update state and fully re-render the spread
        this.currentSpread++;
        await this._renderCurrentSpread();

        // Now safe to remove flip — correct content is underneath
        flip.remove();
        this._clearShadows();
        if (hiddenEl) hiddenEl.style.visibility = '';
        this.isFlipping = false;
        this.onPageChange(this.currentPage, this.totalPages);
        await this._processQueue();
    }

    async _flipBackward() {
        if (this.isFlipping || this.currentSpread <= 0) return;
        this.isFlipping = true;
        this._cleanupOrphanedFlips();

        // When leaving a single-page spread, expand to double instantly
        // but keep the empty side hidden
        let hiddenEl = null;
        if (this._isSinglePageSpread(this.currentSpread)) {
            const sp = this._getSpreadPages(this.currentSpread);
            hiddenEl = sp.left === null ? this.leftEl : this.rightEl;
            hiddenEl.style.visibility = 'hidden';
            this._forceDoubleLayout(false);   // instant, no 350ms wait
        }

        const curSp = this._getSpreadPages(this.currentSpread);
        const prvSp = this._getSpreadPages(this.currentSpread - 1);

        const flip = this._createFlipEl();
        // Front face = current left page
        await this._renderInto(flip.querySelector('.flip-front .page-content'), curSp.left);
        // Back face = previous right page
        await this._renderInto(flip.querySelector('.flip-back .page-content'), prvSp.right);

        // Put previous left page under
        await this._renderInto(this.leftEl.querySelector('.page-content'), prvSp.left);
        this.leftEl.classList.toggle('empty', prvSp.left === null);

        // Position over left half, hinge on right (spine)
        flip.classList.add('flip-backward');
        this.bookEl.appendChild(flip);

        // Use JS keyframe animation for rolling paper curl
        this._animateFlip(flip, 'backward');

        this._animateShadows(flip, 'backward');

        await this._waitFlipAnimation(flip);

        // Update state and fully re-render the spread
        this.currentSpread--;
        await this._renderCurrentSpread();

        // Now safe to remove flip — correct content is underneath
        flip.remove();
        this._clearShadows();
        if (hiddenEl) hiddenEl.style.visibility = '';
        this.isFlipping = false;
        this.onPageChange(this.currentPage, this.totalPages);
        await this._processQueue();
    }

    _createFlipEl() {
        const el = document.createElement('div');
        el.className = 'flip-element';
        el.innerHTML = `
            <div class="flip-front">
                <div class="page-content"></div>
                <div class="flip-gradient"></div>
            </div>
            <div class="flip-back">
                <div class="page-content"></div>
                <div class="flip-gradient"></div>
            </div>`;
        return el;
    }

    _animateShadows(/* flipEl, dir */) {
        // Shadows are now driven by the rAF loop inside _animateFlip
    }

    _clearShadows() {
        this._shadowTimers.forEach(t => clearTimeout(t));
        this._shadowTimers = [];
        this.leftEl.querySelector('.page-shadow-overlay').style.opacity = '0';
        this.rightEl.querySelector('.page-shadow-overlay').style.opacity = '0';
    }

    _waitTransition(el) {
        return new Promise(resolve => {
            let resolved = false;
            const done = () => {
                if (resolved) return;
                resolved = true;
                el.removeEventListener('transitionend', handler);
                resolve();
            };
            const handler = (e) => {
                // Only resolve on transform (ignore other properties)
                if (e.propertyName === 'transform') done();
            };
            el.addEventListener('transitionend', handler);
            // Fallback in case transitionend never fires
            setTimeout(done, 1050);
        });
    }

    /* ---- turn.js-inspired easeOutCirc ---- */
    _easeOutCirc(t) {
        return Math.sqrt(1 - (t - 1) * (t - 1));
    }

    /* Cubic bezier point interpolation (for flip path) */
    _bezierPoint(p0, p1, p2, p3, t) {
        const h = 1 - t;
        return {
            x: Math.round(h*h*h*p0.x + 3*t*h*h*p1.x + 3*t*t*h*p2.x + t*t*t*p3.x),
            y: Math.round(h*h*h*p0.y + 3*t*h*h*p1.y + 3*t*t*h*p2.y + t*t*t*p3.y)
        };
    }

    /* requestAnimationFrame-driven flip animation (turn.js style) */
    _animateFlip(el, dir) {
        const duration = 600;   // turn.js default
        const sign = dir === 'forward' ? -1 : 1;
        const frontGrad = el.querySelector('.flip-front .flip-gradient');
        const backGrad  = el.querySelector('.flip-back .flip-gradient');
        const adjShadow = dir === 'forward'
            ? this.rightEl.querySelector('.page-shadow-overlay')
            : this.leftEl.querySelector('.page-shadow-overlay');
        const spineGradDir = dir === 'forward' ? ['right', 'left'] : ['left', 'right'];

        const start = performance.now();
        el._flipDone = false;

        const tick = (now) => {
            const elapsed = now - start;
            const raw = Math.min(elapsed / duration, 1);
            const t = this._easeOutCirc(raw);          // easeOutCirc progress 0→1
            const angle = sign * t * 180;
            const midBend = Math.sin(t * Math.PI);     // 0→1→0, peaks at 50%

            // --- Transform (no perspective — avoids z-fighting with book pages) ---
            el.style.transform = `rotateY(${angle}deg)`;

            // --- Turn.js style front-face gradient (3 bands) ---
            const M = Math.min(t * 2, 1);              // ramps 0→1 in first half
            const L = t * 0.3;                          // fold width factor
            const fA = (0.2 * M).toFixed(3);
            const fH = (0.2 * M).toFixed(3);           // white highlight intensity
            frontGrad.style.background =
                `linear-gradient(to ${spineGradDir[0]}, ` +
                `rgba(0,0,0,0) ${(L * 100).toFixed(1)}%, ` +
                `rgba(0,0,0,${fA}) ${((0.8 * (1 - L) + L) * 100).toFixed(1)}%, ` +
                `rgba(255,255,255,${fH}) 100%)`;

            // --- Turn.js style back-face gradient ---
            const bM = Math.min((1 - t) * 2, 1);       // ramps 1→0 in second half
            const bA = (0.3 * bM).toFixed(3);
            backGrad.style.background =
                `linear-gradient(to ${spineGradDir[1]}, ` +
                `rgba(0,0,0,0) 60%, ` +
                `rgba(0,0,0,${bA}) 80%, ` +
                `rgba(0,0,0,0) 100%)`;

            // --- Box-shadow on flip element (peaks mid-flip) ---
            const shadowAlpha = (0.5 * Math.sin(Math.PI * (t > 1 ? 2 - t : t))).toFixed(3);
            el.style.boxShadow = `0 0 20px rgba(0,0,0,${shadowAlpha})`;

            // --- Adjacent page dimming (sinusoidal, peaks mid-flip) ---
            adjShadow.style.opacity = (0.5 * midBend).toFixed(3);

            if (raw < 1) {
                el._flipRAF = requestAnimationFrame(tick);
            } else {
                el._flipDone = true;
                adjShadow.style.opacity = '0';
            }
        };

        el._flipRAF = requestAnimationFrame(tick);
    }

    _waitFlipAnimation(el) {
        return new Promise(resolve => {
            const check = () => {
                if (el._flipDone) { resolve(); return; }
                requestAnimationFrame(check);
            };
            check();
            // Safety fallback
            setTimeout(resolve, 800);
        });
    }

    /* ========== Interactive drag flip ========== */

    _onPointerDown(e) {
        if (this.isFlipping) return;
        const pos = this._getPointerPos(e);
        if (!pos) return;

        const rect = this.bookEl.getBoundingClientRect();
        this.dragBookRect = rect;
        const relX = (pos.x - rect.left) / rect.width;
        const isSingle = this._isSinglePageSpread(this.currentSpread);

        // Determine drag direction based on click position
        // Single-page spreads: cover (spread 0) → forward only; last spread → backward only
        if (isSingle) {
            const sp = this._getSpreadPages(this.currentSpread);
            if (sp.left === null && this.currentSpread < this.totalSpreads - 1) {
                // Cover: only forward
                this.dragDirection = 'forward';
            } else if (this.currentSpread > 0) {
                // Back cover: only backward
                this.dragDirection = 'backward';
            } else {
                return;
            }
        } else if (relX > 0.55 && this.currentSpread < this.totalSpreads - 1) {
            this.dragDirection = 'forward';
        } else if (relX < 0.45 && this.currentSpread > 0) {
            this.dragDirection = 'backward';
        } else {
            return;
        }

        this.isDragging = true;
        this.isFlipping = true;   // Block other flips during drag
        this._dragCancelled = false;
        this.dragStartX = pos.x;
        this.dragAngle = 0;
        this._dragStartTime = Date.now();   // turn.js fast-flip detection

        this._setupPromise = this._setupDragFlip();

        e.preventDefault();
    }

    async _setupDragFlip() {
        const curSp = this._getSpreadPages(this.currentSpread);

        // Single-page spread: expand to double layout so the flip element covers correctly
        if (this._isSinglePageSpread(this.currentSpread)) {
            const sp = curSp;
            const hiddenEl = sp.left === null ? this.leftEl : this.rightEl;
            hiddenEl.style.visibility = 'hidden';
            this._forceDoubleLayout(false);
            this._dragHiddenEl = hiddenEl;
            // Re-capture book rect after layout change
            this.dragBookRect = this.bookEl.getBoundingClientRect();
        } else {
            this._dragHiddenEl = null;
        }

        const flip = this._createFlipEl();
        flip.style.transition = 'none';

        if (this.dragDirection === 'forward') {
            const nxtSp = this._getSpreadPages(this.currentSpread + 1);
            await this._renderInto(flip.querySelector('.flip-front .page-content'), curSp.right);
            await this._renderInto(flip.querySelector('.flip-back .page-content'), nxtSp.left);
            if (this._dragCancelled) return;

            // Append flip FIRST to cover the right page, then update underneath
            flip.classList.add('flip-forward');
            this.flipEl = flip;
            this.bookEl.appendChild(flip);

            await this._renderInto(this.rightEl.querySelector('.page-content'), nxtSp.right);
            this.rightEl.classList.toggle('empty', nxtSp.right === null);
        } else {
            const prvSp = this._getSpreadPages(this.currentSpread - 1);
            await this._renderInto(flip.querySelector('.flip-front .page-content'), curSp.left);
            await this._renderInto(flip.querySelector('.flip-back .page-content'), prvSp.right);
            if (this._dragCancelled) return;

            // Append flip FIRST to cover the left page, then update underneath
            flip.classList.add('flip-backward');
            this.flipEl = flip;
            this.bookEl.appendChild(flip);

            await this._renderInto(this.leftEl.querySelector('.page-content'), prvSp.left);
            this.leftEl.classList.toggle('empty', prvSp.left === null);
        }
    }

    _onPointerMove(e) {
        if (!this.isDragging || !this.flipEl) return;
        const pos = this._getPointerPos(e);
        if (!pos) return;

        const dx = pos.x - this.dragStartX;
        const halfW = this.dragBookRect.width / 2;

        // Turn.js style: direct mapping — mouse position linearly maps to flip angle
        let rawRatio;
        if (this.dragDirection === 'forward') {
            rawRatio = Math.max(-1, Math.min(0, dx / halfW));
        } else {
            rawRatio = Math.max(0, Math.min(1, dx / halfW));
        }
        const absR = Math.abs(rawRatio);
        const angle = (this.dragDirection === 'forward' ? -1 : 1) * absR * 180;

        this.dragAngle = angle;

        // Turn.js-style progress & mid-bend
        const progress = absR;
        const midBend = Math.sin(progress * Math.PI);  // peaks mid-flip

        this.flipEl.style.transform = `rotateY(${angle}deg)`;

        // Turn.js 3-band gradient on front face
        const frontGrad = this.flipEl.querySelector('.flip-front .flip-gradient');
        const backGrad = this.flipEl.querySelector('.flip-back .flip-gradient');
        const spineDir = this.dragDirection === 'forward' ? ['right', 'left'] : ['left', 'right'];

        const M = Math.min(progress * 2, 1);
        const L = progress * 0.3;
        const fA = (0.2 * M).toFixed(3);
        const fH = (0.2 * M).toFixed(3);
        frontGrad.style.background =
            `linear-gradient(to ${spineDir[0]}, ` +
            `rgba(0,0,0,0) ${(L * 100).toFixed(1)}%, ` +
            `rgba(0,0,0,${fA}) ${((0.8 * (1 - L) + L) * 100).toFixed(1)}%, ` +
            `rgba(255,255,255,${fH}) 100%)`;

        const bM = Math.min((1 - progress) * 2, 1);
        const bA = (0.3 * bM).toFixed(3);
        backGrad.style.background =
            `linear-gradient(to ${spineDir[1]}, ` +
            `rgba(0,0,0,0) 60%, ` +
            `rgba(0,0,0,${bA}) 80%, ` +
            `rgba(0,0,0,0) 100%)`;

        // Box-shadow on flip element
        const shadowAlpha = (0.5 * Math.sin(Math.PI * progress)).toFixed(3);
        this.flipEl.style.boxShadow = `0 0 20px rgba(0,0,0,${shadowAlpha})`;

        // Shadow on underlying page (sinusoidal)
        if (this.dragDirection === 'forward') {
            this.rightEl.querySelector('.page-shadow-overlay').style.opacity = (0.5 * midBend).toFixed(3);
        } else {
            this.leftEl.querySelector('.page-shadow-overlay').style.opacity = (0.5 * midBend).toFixed(3);
        }

        e.preventDefault();
    }

    async _onPointerUp(e) {
        if (!this.isDragging) return;
        this.isDragging = false;

        // Cancel setup if still running and wait for it to finish
        this._dragCancelled = true;
        if (this._setupPromise) {
            await this._setupPromise;
            this._setupPromise = null;
        }

        if (!this.flipEl) {
            // Setup never completed — just restore
            if (this._dragHiddenEl) { this._dragHiddenEl.style.visibility = ''; this._dragHiddenEl = null; }
            await this._renderCurrentSpread();
            this._clearShadows();
            this.isFlipping = false;
            return;
        }

        const progress = Math.abs(this.dragAngle) / 180;
        const elapsed = Date.now() - this._dragStartTime;

        // No meaningful drag — remove immediately without waiting for transition
        if (progress < 0.01 && elapsed > 200) {
            this.flipEl.remove();
            this.flipEl = null;
            if (this._dragHiddenEl) { this._dragHiddenEl.style.visibility = ''; this._dragHiddenEl = null; }
            await this._renderCurrentSpread();
            this._clearShadows();
            this.isFlipping = false;
            return;
        }

        // Turn.js-style fast-flip: if drag < 200ms, treat as click → full flip
        const shouldComplete = elapsed < 200 || progress > 0.25;

        // Animate to final position using rAF with easeOutCirc (like turn.js snap-back: 800ms)
        const flipEl = this.flipEl;
        const startAngle = this.dragAngle;
        const targetAngle = shouldComplete
            ? (this.dragDirection === 'forward' ? -180 : 180)
            : 0;
        const snapDuration = shouldComplete ? 600 : 800;  // turn.js: 600ms flip, 800ms snap-back
        const adjShadow = this.dragDirection === 'forward'
            ? this.rightEl.querySelector('.page-shadow-overlay')
            : this.leftEl.querySelector('.page-shadow-overlay');
        const frontGrad = flipEl.querySelector('.flip-front .flip-gradient');
        const backGrad  = flipEl.querySelector('.flip-back .flip-gradient');
        const spineDir = this.dragDirection === 'forward' ? ['right', 'left'] : ['left', 'right'];
        const startTime = performance.now();

        await new Promise(resolve => {
            const tick = (now) => {
                const raw = Math.min((now - startTime) / snapDuration, 1);
                const t = this._easeOutCirc(raw);
                const angle = startAngle + (targetAngle - startAngle) * t;
                const absP = Math.abs(angle) / 180;
                const midBend = Math.sin(absP * Math.PI);

                flipEl.style.transform = `rotateY(${angle}deg)`;

                // Continue updating gradients during snap animation
                const M = Math.min(absP * 2, 1);
                const L = absP * 0.3;
                frontGrad.style.background =
                    `linear-gradient(to ${spineDir[0]}, ` +
                    `rgba(0,0,0,0) ${(L * 100).toFixed(1)}%, ` +
                    `rgba(0,0,0,${(0.2 * M).toFixed(3)}) ${((0.8 * (1 - L) + L) * 100).toFixed(1)}%, ` +
                    `rgba(255,255,255,${(0.2 * M).toFixed(3)}) 100%)`;

                const bM = Math.min((1 - absP) * 2, 1);
                backGrad.style.background =
                    `linear-gradient(to ${spineDir[1]}, ` +
                    `rgba(0,0,0,0) 60%, ` +
                    `rgba(0,0,0,${(0.3 * bM).toFixed(3)}) 80%, ` +
                    `rgba(0,0,0,0) 100%)`;

                const shadowAlpha = (0.5 * Math.sin(Math.PI * absP)).toFixed(3);
                flipEl.style.boxShadow = `0 0 20px rgba(0,0,0,${shadowAlpha})`;
                adjShadow.style.opacity = (0.5 * midBend).toFixed(3);

                if (raw < 1) {
                    requestAnimationFrame(tick);
                } else {
                    adjShadow.style.opacity = '0';
                    resolve();
                }
            };
            requestAnimationFrame(tick);
            // Safety fallback
            setTimeout(resolve, snapDuration + 100);
        });

        if (this._dragHiddenEl) { this._dragHiddenEl.style.visibility = ''; this._dragHiddenEl = null; }

        if (shouldComplete) {
            if (this.dragDirection === 'forward') this.currentSpread++;
            else this.currentSpread--;

            await this._renderCurrentSpread();
            if (this.flipEl) { this.flipEl.remove(); this.flipEl = null; }
            this._clearShadows();
            this.isFlipping = false;
            this.onPageChange(this.currentPage, this.totalPages);
        } else {
            // Snap back
            if (this.flipEl) { this.flipEl.remove(); this.flipEl = null; }
            await this._renderCurrentSpread();
            this._clearShadows();
            this.isFlipping = false;
        }
    }

    _getPointerPos(e) {
        if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (e.changedTouches && e.changedTouches.length > 0) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        if (e.clientX !== undefined) return { x: e.clientX, y: e.clientY };
        return null;
    }

    /* ========== Zoom ========== */

    zoomIn() {
        const next = this.zoomPresets.find(z => z > this.zoom + 0.001);
        if (next !== undefined) this.zoom = next;
        this._fitBook();
        return Math.round(this.zoom * 100);
    }

    zoomOut() {
        const prev = [...this.zoomPresets].reverse().find(z => z < this.zoom - 0.001);
        if (prev !== undefined) this.zoom = prev;
        this._fitBook();
        return Math.round(this.zoom * 100);
    }

    setZoom(level) {
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, level));
        this._fitBook();
        return Math.round(this.zoom * 100);
    }

    getZoom() {
        return Math.round(this.zoom * 100);
    }

    /* ========== Thumbnails ========== */

    async renderThumbnail(pageNum, maxWidth = 200) {
        const page = await this.pdfDoc.getPage(pageNum);
        const vp0 = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: maxWidth / vp0.width });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        return canvas;
    }

    /* ========== Events ========== */

    _bindEvents() {
        document.addEventListener('keydown', this._handleKeyDown);
        window.addEventListener('resize', this._handleResize);

        // Pointer events for drag-flip
        this.containerEl.addEventListener('mousedown', this._onPointerDown);
        document.addEventListener('mousemove', this._onPointerMove);
        document.addEventListener('mouseup', this._onPointerUp);
        this.containerEl.addEventListener('touchstart', this._onPointerDown, { passive: false });
        document.addEventListener('touchmove', this._onPointerMove, { passive: false });
        document.addEventListener('touchend', this._onPointerUp);

        // Ctrl+wheel zoom
        this.containerEl.addEventListener('wheel', this._handleWheel, { passive: false });
    }

    _handleKeyDown(e) {
        switch (e.key) {
            case 'ArrowLeft': case 'PageUp':   e.preventDefault(); this.prevPage(); break;
            case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); this.nextPage(); break;
            case 'Home': e.preventDefault(); this.goToPage(1); break;
            case 'End':  e.preventDefault(); this.goToPage(this.totalPages); break;
            case '+': case '=': if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.onZoomChange(this.zoomIn()); } break;
            case '-':           if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.onZoomChange(this.zoomOut()); } break;
        }
    }

    _handleWheel(e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const level = e.deltaY < 0 ? this.zoomIn() : this.zoomOut();
            this.onZoomChange(level);
        }
    }

    _handleResize() {
        this._fitBook();
    }

    /* ========== Utilities ========== */

    _debounce(fn, ms) {
        let t;
        return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    }

    destroy() {
        document.removeEventListener('keydown', this._handleKeyDown);
        window.removeEventListener('resize', this._handleResize);
        this.containerEl.removeEventListener('mousedown', this._onPointerDown);
        document.removeEventListener('mousemove', this._onPointerMove);
        document.removeEventListener('mouseup', this._onPointerUp);
        this.containerEl.removeEventListener('touchstart', this._onPointerDown);
        document.removeEventListener('touchmove', this._onPointerMove);
        document.removeEventListener('touchend', this._onPointerUp);
        this.containerEl.removeEventListener('wheel', this._handleWheel);
        this.pageCache.clear();
        this.flipbookEl.innerHTML = '';
    }
}

window.FlipbookEngine = FlipbookEngine;