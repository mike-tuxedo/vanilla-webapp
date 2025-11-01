class ModalComponent extends HTMLElement {
  constructor() {
    super();
    this.dialog = null;
    this.content = null;
  }

  connectedCallback() {
    this.initialContent = this.innerHTML;
    this.render();
    this.dialog = this.querySelector('dialog');
    this.attachEvents();
  }

  disconnectedCallback() {
    this.removeEventListener('mousedown', this.handleMouseDown);
  }

  render() {
    this.innerHTML = `
      <dialog>
        <article>
            <button class="modal-close outline" type="button">&times;</button>
            ${this.initialContent}
        </article>
      </dialog>
  `;
  }

  attachEvents() {
    this.dialog.querySelector('.modal-close')?.addEventListener('click', () => this.close());
    this.dialog.addEventListener('click', (e) => {
      if (e.target.tagName === 'DIALOG') this.close();
    });
  }

  open() {
    this.dialog.showModal();
  }

  close() {
    this.dialog.close();
  }
}

customElements.define('app-modal', ModalComponent);
