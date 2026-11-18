# Working on the personal site

The files in this repository are served directly at the domain in `CNAME`. The home page and tools use plain HTML, CSS, self-hosted fonts, and browser JavaScript. There is no package installation or build step.

## Preview and verify

Run `python3 -m http.server 8000 --bind 127.0.0.1` from the repository root and open `http://127.0.0.1:8000/`. Follow the home-page card to a changed tool and reload its directory URL directly. Serving the whole repository keeps shared assets and the JSON worker at their expected paths.

There is no automated test suite. For script edits, `node --check tools/health-tracker/healthtracker.js` is an example syntax check. In the browser, exercise the changed action with valid and empty or invalid input, check the console for missing assets or policy errors, and check keyboard use and narrow-screen layout. For shared CSS changes, check both the landing page and an individual tool.

## Where to edit

- `index.html` lists the tools. `style.css` defines the shared dark theme and loads Inter and Sora from `fonts/`. A tool page loads the shared CSS first and its own stylesheet second.
- Each directory in `tools/` owns its page and scripts. The JSON formatter, Base64 encoder, unit converter, draft randomizer, spin wheel, and health tracker can be opened independently. For a new listed tool, follow a sibling's directory structure and add its card to the root index.
- `may2026/` is a standalone weight challenge page. `weekly-weights.js` supplies the data and must load before `weight-challenge.js`, which renders the table. It has a different relative path to shared assets than pages under `tools/`.

## Browser behavior to preserve

- Keep scripts in local files and scope tool code to its page, following the existing function wrappers. Check the page's Content Security Policy when changing resource loading. The JSON formatter uses `worker-src 'self'` for `tools/json-formatter/json-worker.js`. Exercise formatting, minifying, and invalid JSON when changing the worker or its message format.
- The health tracker stores personal data locally under `healthtracker.v1` and migrates `caloriecounter.v1`. Review `loadState`, `normalizeState`, defaults, and JSON import/export together when changing the data shape. Use a disposable browser profile with sample entries to check reloads, older saves, and an export/import round trip.
- Keep labels, keyboard controls, focus indicators, and status feedback usable when updating a tool. Use shared CSS variables for common colors and tool stylesheets for page-specific layout.
