# vanilla-webapp 🌐📱

Simplest starter template for a mobile SPA webapp, without framework or build step, just plain html, css and javascript.

This template uses Pico CSS for default styling. Webcomponents for special elements and some boilerplate code you need to start a mobile webapp.

## 📋 Features
- No framework to learn
- No build step that doesn't work
- No dependencies that break
- Two webcomponents for example purposes
- Service worker (sw.js just here to make it possible to install the app, no cache or update strategy is implemented - thats up to you)
- Manifest file for PWA
- Clean and modern UI

## Features you definitly want to implement yourself 
- A caching and install strategy for the service worker
- Custom app icon set
- Of course your app logic

## 🛠️ Libraries used:
- Pico CSS (<a href="https://picocss.com/">picocss.com</a>)
- Lucide icons (<a href="https://lucide.dev/">lucide.dev</a>)
- reactiveHtml <small>(<a href="https://github.com/mike-tuxedo/reactiveHtml">github</a>)</small>
- Iconifier was used to generate the icons (<a href="https://iconifier.net/">iconifier.net</a>)


### reactiveHtml is what?
ReactiveHtml is used for some state example on the showcase page and for navigation.

It's my own small class to add some reactive features to html. It's small and does just some basic things. The idea behind it is similar to aplinejs but much simple syntax (at least in my opinion) and way less features. If you want give it a state than I would call it in heavy alpha 😊

You can dropin your own reactive class, it shouldn't be that hard to replace it. Just exchange functions that uses `rs.variablename` from app.js and navigation.js and remove the `{variablename}` values in the html templates. And of course remove the the class it self.