// Simple service worker with minimal functionality
// This will be registered but won't cache anything

const CACHE_NAME = 'vanilla-webapp-v1';

self.addEventListener('install', (event) => {
  // Skip waiting to activate the new service worker immediately
  self.skipWaiting();
  console.log('Service Worker installed');
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
});

// Basic fetch handler that doesn't cache anything
self.addEventListener('fetch', (event) => {
  // Let the browser handle the request normally
  event.respondWith(fetch(event.request));
});
