/*
 * Reminders that arrive while the app is closed. Loaded by the generated
 * service worker (see `importScripts` in vite.config.ts).
 *
 * A reminder is a Declarative Web Push message (see src/lib/reminders.ts).
 * Browsers that understand those show it themselves; everywhere else it
 * comes here. A push that shows nothing can cost the site its permission, so
 * whatever arrives, something is shown.
 */
self.addEventListener("push", (event) => {
    let notification = {};
    try {
        notification = event.data.json().notification ?? {};
    } catch {
        // Not one of ours, or unreadable: say something plain rather than nothing.
    }
    const title = typeof notification.title === "string" && notification.title ? notification.title : "Rememorize";
    const body = typeof notification.body === "string" ? notification.body : "You have cards to review.";
    const badge = Number(notification.app_badge);
    event.waitUntil(
        Promise.all([
            self.registration.showNotification(title, {
                body,
                // A repeat or a newer reminder takes the place of the one on screen.
                tag: typeof notification.tag === "string" ? notification.tag : "rememorize",
                icon: "icon-192.png",
                data: {
                    url: typeof notification.navigate === "string" ? notification.navigate : self.registration.scope,
                },
            }),
            badge > 0 && navigator.setAppBadge ? navigator.setAppBadge(badge).catch(() => {}) : undefined,
        ]),
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
            const open = windows.find((client) => client.url.startsWith(self.registration.scope));
            return open ? open.focus() : self.clients.openWindow(event.notification.data.url);
        }),
    );
});
