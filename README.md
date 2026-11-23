# Paintings by Poppy

A gallery website for original art and prints. Visitors browse the work, pick a piece, message the artist (email or Instagram), and pay by Interac e-Transfer. There's no cart or card payments.

## Adding and editing artwork

Go to **/admin/** on the live site (there's also a small "Studio" link in the footer).

- **Add artwork:** photos, title, medium, size, description and prices. Each piece can have an original and any number of print sizes.
- **Mark something sold:** open the piece, tick "Sold" next to that option, and save. It stays on the site, marked sold.
- **Site details:** your Instagram handle, email, e-Transfer email, headline, About text and photo.

The first time you use the Studio on a phone or computer, it asks for a GitHub key. The steps are on that page. After you save, the live site updates in about a minute.

## Hosting

The site runs on GitHub Pages (free) from the `main` branch of this repository. It's plain HTML, CSS and JavaScript with no build step.

- `index.html`, `assets/` hold the public site
- `admin/` holds the Studio
- `data/site.json` holds your name, contact details and words
- `data/artworks.json` holds the artwork list, in display order
- `art/` holds the uploaded photos

## Previewing on your computer

```bash
python3 tools/serve.py
```

Then open http://localhost:4173. The Studio at http://localhost:4173/admin/ saves straight to this folder, with no GitHub key needed.
