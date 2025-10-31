class DrawerComponent extends HTMLElement {
    constructor() {
        super();
        this.attachEvents = this.attachEvents.bind(this);
        this.transform = "";
        this.clicked = null;
        this.drawerInner = null;
        this.initialContent = "";
        this.closeButton = null;
    }

    connectedCallback() {
        this.initialContent = this.innerHTML;
        this.render();
        this.attachEvents();
    }

    disconnectedCallback() {
        this.removeEventListener('mousedown', this.handleMouseDown);
        this.removeEventListener('mousemove', this.handleMouseMove);
        this.removeEventListener('mouseup', this.handleMouseUp);
        this.removeEventListener('touchstart', this.handleTouchStart);
        this.removeEventListener('touchmove', this.handleTouchMove);
        this.removeEventListener('touchend', this.handleTouchEnd);
    }

    render() {
        this.innerHTML = `
            <div class="pico" tabindex="0">
                <div class="drawer-inner" style="${this.transform}">
                    <span class="drawer-handle"></span>
                    ${this.initialContent}
                </div>
            </div>
        `;

        this.drawerInner = this.querySelector('.drawer-inner');
        this.closeButton = this.querySelector('[close-drawer]');
    }

    attachEvents() {
        this.addEventListener('mousedown', this.handleMouseDown);
        this.addEventListener('mousemove', this.handleMouseMove);
        this.addEventListener('mouseup', this.handleMouseUp);
        this.addEventListener('touchstart', this.handleTouchStart);
        this.addEventListener('touchmove', this.handleTouchMove);
        this.addEventListener('touchend', this.handleTouchEnd);
        this.closeButton.addEventListener('click', this.close);
    }

    handleMouseDown(event) {
        if (event.touches) return;
        this.mouseDown = true;
        this.startY = event.clientY;
        this.clicked = event.target;
    }

    handleMouseMove(event) {
        if (event.touches) return;
        if (!this.mouseDown) return;
        
        const moveY = event.clientY;
        this.diffY = moveY - this.startY;

        if (this.diffY > 0) {
            this.transform = `transform: translateY(${this.diffY}px);`;
            this.render();
        }
    }

    handleMouseUp(event) {
        if (event.touches) return;
        this.mouseDown = false;

        if (this.clicked.closest('[close-drawer]') ||
            this.clicked === this ||
            this.diffY > 150) {
            this.close(event);
            return;
        }
        
        this.diffY = 0;
        this.transform = `transform: translateY(${this.diffY}px);`;
        this.render();
    }

    handleTouchStart(event) {
        this.drawerInner = this.querySelector('.drawer-inner');
        this.clickedEl = event.target;
        this.startY = event.touches[0].clientY;
    }

    handleTouchMove(event) {
        event.preventDefault();
        this.drawerInner.style.transition = 'none';

        if (!this._rafId) {
            this._rafId = requestAnimationFrame(() => {
                const moveY = event.touches[0].clientY;
                this.diffY = moveY - this.startY;
                
                if (this.diffY > 0) {
                    this.querySelector('.drawer-inner').style.transform = `translateY(${this.diffY}px)`;
                }
                this._rafId = null;
            });
        }
    }

    handleTouchEnd(event) {
        this.drawerInner.style.transition = '';

        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        if (this.clickedEl.closest('[close-drawer]') ||
            this.clickedEl === this ||
            this.diffY > 150) {
            this.close(event);
            return;
        }
        
        this.diffY = 0;
        this.querySelector('.drawer-inner').style.transform = `translateY(${this.diffY}px)`;
    }

    open() {
        console.log('open');
        $$('.page').forEach(page => page.style.overflow = 'hidden');
        $('body').setAttribute('drawer-open', 'true');
        this.classList.add('show');
    }

    close() {
        console.log('close');
        $$('.page').forEach(page => page.style.overflow = 'auto');
        $('body').setAttribute('drawer-open', 'false');
        this.transform = "";
        this.classList.remove('show');
        this.render();
    }
}

customElements.define('app-drawer', DrawerComponent);