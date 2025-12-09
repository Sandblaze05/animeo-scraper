# animeo-scraper

A tiny Express server that generates strict Sphinx-style search queries for AnimeTosho and returns structured JSON results parsed from the search page.

## Requirements
- Node.js 18+ (global `fetch` is used)
- npm

## Install
```pwsh
npm install
```

## Run
```pwsh
node index.js
```
Server listens on `http://localhost:3001`.

## Endpoints

### GET `/`
- Health check; returns `hello`.

### POST `/query`
- Body: JSON
  - `title` (string, required)
  - `season` (number, optional)
  - `episode` (number, required)
  - `options` (object, optional)
    - `strict` (boolean, default `true`): enable field scoping and exclusions.
    - `scopeField` (string, default `"name"`): Sphinx field to scope to.
    - `includeLooseNumeric` (boolean, default `false`): include very loose numeric variant like `" 06 "`.
    - `includeNonPadded` (boolean, default `false`): include non-padded episode forms like `E6` / `Ep 6`.
    - `excludeTerms` (string[] or comma-separated string): terms to exclude via negative search.
- Response: `{ query }`

Example:
```pwsh
curl -X POST http://localhost:3001/query `
  -H "Content-Type: application/json" `
  -d '{
    "title":"Eminence in Shadow",
    "season":1,
    "episode":6,
    "options": { "strict": true, "includeNonPadded": true }
  }'
```

### GET `/search`
- Query parameters:
  - `title` (string, required)
  - `season` (number, optional)
  - `episode` (number, required)
  - `strict` ("true" | "false", default `true`)
  - `includeLooseNumeric` ("true" | "false", default `false`)
  - `includeNonPadded` ("true" | "false", default `false`)
  - `scopeField` (string, default `name`)
  - `excludeTerms` (comma-separated string, optional)
- Behavior:
  - Builds a Sphinx query via `generateSphinxQuery`.
  - Fetches `https://animetosho.org/search?q=<query>&qx=1`.
  - Parses HTML with Cheerio to extract entries (`title`) and all download links (including magnet).
- Response:
  ```json
  {
    "query": "@name \"Eminence in Shadow\" & (@name =\"S01E06\" | @name =\"E06\" | @name \"Episode 6\"@name \"Ep 06\") -@name \"batch\" -@name \"complete\" -@name \"compilation\" -@name \"pack\" -@name\"discussion\" -@name \"preview\"",  
    "url": "https://animetosho.org/search?q=...&qx=1",
    "count": 3,
    "results": [
      {
        "title": "[Group] Eminence in Shadow S01E06 ...",
        "links": [
          { "href": "magnet:?xt=...", "text": "Magnet", "isMagnet": true },
          { "href": "https://...torrent", "text": "Torrent", "isMagnet": false }
        ]
      }
    ]
  }
  ```

Examples:
```pwsh
# Strict default
curl "http://localhost:3001/search?title=Twisted%20Wonderland&season=1&episode=6"

# Slightly wider (allow non-padded)
curl "http://localhost:3001/search?title=Twisted%20Wonderland&season=1&episode=6&includeNonPadded=true"

# Widest (no strict, include loose numeric, clear exclusions)
curl "http://localhost:3001/search?title=Twisted%20Wonderland&season=1&episode=6&strict=false&includeLooseNumeric=true&excludeTerms="

# Custom scoping + exclusions
curl "http://localhost:3001/search?title=Twisted%20Wonderland&season=1&episode=6&scopeField=title&excludeTerms=batch,preview,discussion"
```

## Notes
- The service returns raw HTML when requested directly from AnimeTosho only through `/search`; the endpoint already parses into JSON.
- If AnimeTosho changes markup, selectors may need updates:
  - Entries: `.home_list_entry.home_list_entry_alt, .home_list_entry, .home_list_entry_compl_1`
  - Title: `.link a`
  - Links: `.links a.dlink, .links a[href^="magnet:"]`

## Deploy to Vercel

- This project is configured for Vercel serverless with `vercel.json`.
- The Express app is exported from `api/index.js`, so routes are available under `/api` in production.

### Steps
```pwsh
# Install deps
npm install

# Login & initialize (optional)
vercel login
vercel init

# Deploy
vercel deploy --prod
```

### Production URLs
- Health: `/api/`
- Build query: `POST /api/query`
- Search: `GET /api/search?title=...&season=...&episode=...`

### Local Vercel Dev
```pwsh
vercel dev
```
Serves at `http://localhost:3000` with routes under `/api`.

