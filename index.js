import express from 'express';
import cors from 'cors';
import * as cheerio from 'cheerio';


const app = express();
app.use(express.json())
app.use(cors());

function pad2(n) {
    const num = Number(n);
    if (Number.isNaN(num)) return String(n);
    return num.toString().padStart(2, '0');
}

// Generate a Sphinx query for given title, season and episode
// Options:
// - strict: add field scoping and exclude common noisy terms (default: true)
// - scopeField: Sphinx field to scope to (e.g., 'name' or 'title')
// - includeLooseNumeric: include the very loose " 06 " variant (default: false)
// - includeNonPadded: also include non-padded episode forms like "E6"/"Ep 6" (default: false)
export function generateSphinxQuery(title, season, episode, options = {}) {
    if (!title) throw new Error('title is required');
    if (episode === undefined || episode === null) throw new Error('episode is required');

    const {
        strict = true,
        scopeField = 'name',
        includeLooseNumeric = false,
        includeNonPadded = false,
        excludeTerms = ['batch', 'complete', 'compilation', 'pack', 'discussion', 'preview']
    } = options || {};

    const cleanTitle = String(title).trim();
    const ep = pad2(episode);
    const variants = [];

    const scope = strict && scopeField ? `@${scopeField} ` : '';

    if (season !== undefined && season !== null) {
        const sn = pad2(season);
        variants.push(`${scope}="S${sn}E${ep}"`);
        if (includeNonPadded) {
            variants.push(`${scope}="S${Number(season)}E${Number(episode)}"`);
        }
    }

    variants.push(`${scope}="E${ep}"`);
    variants.push(`${scope}"Episode ${Number(episode)}"`);
    variants.push(`${scope}"Ep ${ep}"`);
    if (includeNonPadded) {
        variants.push(`${scope}="E${Number(episode)}"`);
        variants.push(`${scope}"Ep ${Number(episode)}"`);
    }
    if (includeLooseNumeric) {
        variants.push(`${scope}" ${ep} "`);
    }

    const joined = variants.join(' | ');
    const titleScoped = `${scope}"${cleanTitle}"`;

    let query = `${titleScoped} & (${joined})`;

    if (strict && excludeTerms && excludeTerms.length) {
        // Exclude common noisy terms that often cause spurious matches
        const excl = excludeTerms
            .filter(Boolean)
            .map(t => `-${scope}"${String(t)}"`)
            .join(' ');
        if (excl) query = `${query} ${excl}`;
    }

    return query;
}

app.get('/', (req, res) => {
    res.send('hello');
})

app.post('/query', (req, res) => {
    try {
        const { title, season, episode, options } = req.body || {};
        const query = generateSphinxQuery(title, season, episode, options);
        res.json({ query });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
})

// GET /search?title=Twisted%20Wonderland&season=1&episode=6
app.get('/search', async (req, res) => {
    try {
        const title = req.query.title;
        const season = req.query.season !== undefined ? Number(req.query.season) : undefined;
        const episode = req.query.episode !== undefined ? Number(req.query.episode) : undefined;

        // Allow clients to widen or tighten search via query params
        const strictParam = req.query.strict;
        const includeLooseNumericParam = req.query.includeLooseNumeric;
        const includeNonPaddedParam = req.query.includeNonPadded;
        const scopeFieldParam = req.query.scopeField;
        const excludeTermsParam = req.query.excludeTerms; // comma-separated

        const options = {
            strict: strictParam !== undefined ? strictParam === 'true' : true,
            includeLooseNumeric: includeLooseNumericParam === 'true',
            includeNonPadded: includeNonPaddedParam === 'true',
            scopeField: scopeFieldParam || 'name',
            excludeTerms: Array.isArray(excludeTermsParam)
                ? excludeTermsParam
                : typeof excludeTermsParam === 'string' && excludeTermsParam.length
                ? excludeTermsParam.split(',').map(s => s.trim()).filter(Boolean)
                : undefined
        };

        const query = generateSphinxQuery(title, season, episode, options);
        const url = `https://animetosho.org/search?q=${encodeURIComponent(query)}&qx=1`;

        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'animeo-scraper/1.0'
            }
        });
        const html = await resp.text();

        // Parse HTML to extract results
        const $ = cheerio.load(html);
        const results = [];

        $('.home_list_entry.home_list_entry_alt, .home_list_entry, .home_list_entry_compl_1').each((index, element) => {
            const titleElement = $(element).find('.link a');
            const entryTitle = titleElement.text().trim();

            const links = [];
            $(element).find('.links a.dlink, .links a[href^="magnet:"]').each((linkIndex, linkElement) => {
                const href = $(linkElement).attr('href');
                const text = $(linkElement).text().trim();
                links.push({
                    href,
                    text,
                    isMagnet: href && href.startsWith('magnet:')
                });
            });

            if (entryTitle && links.length > 0) {
                results.push({
                    title: entryTitle,
                    links
                });
            }
        });

        res.status(resp.status).json({ query, url, count: results.length, results });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
})

app.listen(3001, () => {
    console.log('Server listening on port 3001');

    process.on('SIGINT', () => {
        console.info('Closing server');
    })
})