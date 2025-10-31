class SimpleModal extends HTMLElement {
  constructor() {
    super();
    this.dialog = null;
  }

  connectedCallback() {
    const content = this.innerHTML;
    this.innerHTML = `
      <dialog>
        <article>
            <button class="modal-close outline" type="button">&times;</button>
            ${content}
        </article>
      </dialog>
  `;

    this.dialog = this.querySelector('dialog');
    this.dialog.querySelector('.modal-close')?.addEventListener('click', () => this.close());
    this.dialog?.addEventListener('click', (e) => {
      if (e.target.tagName === 'DIALOG') this.close();
    });
  }

  open() {
    this.dialog?.showModal();
  }

  close() {
    this.dialog?.close();
  }
}

customElements.define('app-modal', SimpleModal);
