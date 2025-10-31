/**
 * Toggles the checkbox state of a todo item.
 * 
 * @param {number} index - The index of the todo item in the `todos` array.
 */
function toggleTodo(index) {
    rs.todos[index].checked = rs.todos[index].checked === 'checked' ? '' : 'checked';
    store.reparse(document.querySelector('main'));
}

/**
 * Toggles the theme of the application.
 * 
 * @param {number} index - The index of the theme in the `themes` array.
 */
function toggleTheme(index) {
    rs.theme = rs.themes[index];
    document.documentElement.setAttribute('data-color', rs.theme);
    store.reparse(document.querySelector('main'));
}

/**
 * Toggles the dark/light theme of the application.
 */
function darkLightToggle() {
    if (document.documentElement.getAttribute('data-theme') === 'light') {
        document.documentElement.setAttribute('data-theme', 'dark')
    } else {
        document.documentElement.setAttribute('data-theme', 'light')
    }
}

/**
 * Opens the drawer.
 */
function openDrawer() {
    rs.showDrawer = true;
}

/**
 * Closes the drawer.
 */
function closeDrawer() {
    rs.showDrawer = false;
}

/**
 * Logs changes to reactive store properties.
 * 
 * @param {string} prop - The property that changed.
 * @param {*} oldValue - The old value of the property.
 * @param {*} newValue - The new value of the property.
 */
store.on('change', (prop, oldValue, newValue) => {
    console.log('Changed', prop, 'from', oldValue, 'to', newValue)
})

/**
 * Registers the service worker if supported by the browser.
 * Logs the registration status to the console.
 */
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("sw.js")
            .then((registration) => {
                console.log(
                    "Service worker registered:",
                    registration
                );
            })
            .catch((registrationError) => {
                console.error(
                    "Service worker registration failed:",
                    registrationError
                );
            });
    });
} else {
    console.error("Service workers are not supported.");
}

