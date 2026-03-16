# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Static personal website for Aaron Kahan — plain HTML, CSS, and vanilla JavaScript. No build tools, bundlers, or frameworks.

## Development

Open `index.html` directly in a browser or serve with any static file server (e.g. `python3 -m http.server`). There are no build, lint, or test commands.

## Architecture

- `index.html` — landing page; links to experiments and external sites
- `style.css` — global styles shared by all pages (design tokens in `:root` CSS variables, dark theme)
- `experiments/` — each experiment is a standalone page (`<name>.html`) with optional per-experiment `.js` and `.css` files; experiment pages import `../style.css` for shared styling and add their own assets

## Conventions

- All pages enforce a strict Content-Security-Policy via `<meta>` tag: no inline scripts or styles; only `'self'` and explicit font origins allowed
- Fonts: Inter (body) and Sora (headings) loaded from Google Fonts
- CSS color palette uses custom properties (`--bg`, `--accent`, `--text`, etc.) defined in `:root`
- Experiment pages follow a consistent layout: back-link + title header (`.experiment-header`), canvas/content area, controls, description
