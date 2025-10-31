function showPage(page) {
    rs.activePage = page;
}

async function getPagesContent(idx) {
    const pageResponse = await fetch(`routes/page${idx}.html`);
    // Prüfen, ob der Fetch-Vorgang erfolgreich war
    if (!pageResponse.ok) {
        throw new Error(`HTTP error! status: ${pageResponse.status}`);
    }
    const pageContent = await pageResponse.text(); // Hier ist die Korrektur!
    $id(`page${idx}`).innerHTML = pageContent;
    // Manuall added nodes need to be re-parsed manually
    store.reparse($id(`page${idx}`));
}

async function loadPages() {
    await getPagesContent(1);
    await getPagesContent(2);
    await getPagesContent(3);
    await getPagesContent(4);
    window.dispatchEvent(new CustomEvent('pagesReady'));
}
loadPages();