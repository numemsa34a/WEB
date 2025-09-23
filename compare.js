// --- data source ------------------------------------------------------------
// Option A: keep a separate JSON file and fetch it here (recommended):
// fetch('compare-data.json').then(r => r.json()).then(initCompare)

// Option B: start with inline sample data now; switch to JSON later:
// === Google Sheet GViz JSON loader (static site; no API key) =============
const SHEET_ID = '12ePY5lSnYwHfNBpqFtUVjdNcOEL5j3KGq5fQIMZa68I';
const SHEET_TAB = 'Sheet1'; // <-- your tab name
const GVIZ_URL =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_TAB)}`;

// Kick off load
fetch(GVIZ_URL + '&_cb=' + Date.now()) // cache-bust for freshness while testing
    .then(r => r.text())
    .then(txt => JSON.parse(txt.substring(txt.indexOf('{'), txt.lastIndexOf('}') + 1))) // strip GViz wrapper
    .then(gviz => {
        const rows = gvizToObjects(gviz);       // array of raw objects from headers
        const normalized = rows.map(normalize); // match your table shape
        initCompare(normalized);                // your existing table boot
    })
    .catch(err => {
        console.error('Sheet load failed', err);
        initCompare([]); // graceful fallback
    });

// Parse GViz to plain objects using header labels
function gvizToObjects(gviz) {
    const cols = gviz.table.cols.map(c => (c.label || c.id || '').trim());
    return gviz.table.rows.map(r => {
        const obj = {};
        cols.forEach((c, i) => { obj[c] = r.c[i]?.v ?? ''; });
        return obj;
    });
}

// === Normalizers to your table format (no Account Type) ===================
// Helper: get a field value by trying multiple header names (case/space/underscore tolerant)
function getField(row, ...names) {
    // Build a lookup of normalized keys -> value once per row
    if (!row.__norm) {
        row.__norm = {};
        Object.keys(row).forEach(k => {
            const nk = String(k).trim().toLowerCase().replace(/\s+|_/g, '');
            row.__norm[nk] = row[k];
        });
    }
    for (const name of names) {
        const key = String(name).trim().toLowerCase().replace(/\s+|_/g, '');
        if (key in row.__norm) return row.__norm[key];
    }
    return '';
}

function normalize(r) {
    // parse helpers
    const moneyDisplay = s => {
        if (s === null || s === undefined) return 'None';
        const str = String(s).trim();
        if (!str) return 'None';
        if (/^none$/i.test(str)) return 'None';
        // If it's pure number (GViz can give numbers), prefix with $
        if (!/[\d]/.test(str)) return 'None';
        return str.startsWith('$') ? str : ('$' + str.replace(/[^\d.]/g, ''));
    };
    const moneyNumber = s => {
        if (s === null || s === undefined) return 0;
        const n = parseFloat(String(s).replace(/[^\d.]/g, ''));
        return isNaN(n) ? 0 : n;
    };
    const num = s => parseInt(String(s).replace(/\D/g, ''), 10) || 0;
    const pct = s => {
        const n = parseFloat(String(s ?? '').replace(/[^\d.]/g, '')) || 0;
        return n + '%';
    };

    // read flexible field names
    const priceFinalRaw = getField(r, 'priceFinal', 'finalPrice', 'discountedPrice', 'price final', 'final price');
    const priceOriginalRaw = getField(r, 'priceOriginal', 'originalPrice', 'listPrice', 'price original', 'original price');
    const priceAmountRaw = getField(r, 'priceAmount', 'price', 'amount'); // fallback if no final price provided

    // decide final/original displays
    const finalDisplay = priceFinalRaw ? moneyDisplay(priceFinalRaw) : moneyDisplay(priceAmountRaw);
    const originalDisplay = priceOriginalRaw ? moneyDisplay(priceOriginalRaw) : null;

    return {
        firmId: (String(getField(r, 'name') || 'firm') + '-' + String(getField(r, 'accountSize') || ''))
            .toLowerCase().replace(/\s+/g, '-'),

        name: String(getField(r, 'name') || ''),
        accountSize: String(getField(r, 'accountSize') || ''),
        steps: String(getField(r, 'steps') || ''),
        drawdown: String(getField(r, 'drawdown') || ''),
        activationFee: String(getField(r, 'activationFee') || 'None'),

        maxContracts: {
            minis: num(getField(r, 'minis')),
            micros: num(getField(r, 'micros'))
        },

        profitTarget: moneyDisplay(getField(r, 'profitTarget')),
        dailyLoss: (/^none$/i.test(String(getField(r, 'dailyLoss')))) ? 'None' : moneyDisplay(getField(r, 'dailyLoss')),
        maxLoss: moneyDisplay(getField(r, 'maxLoss')),
        profitSplit: pct(getField(r, 'profitSplit')),
        payoutFreq: String(getField(r, 'payoutFreq') || ''),

        priceType: String(getField(r, 'priceType') || ''),
        priceAmount: finalDisplay,      // <-- FINAL price shown in the table
        priceOriginal: originalDisplay,  // <-- optional strike-through

        buyUrl: String(getField(r, 'buyUrl') || '#'),

        // numeric sort key for price column (uses FINAL)
        _sort_price: moneyNumber(priceFinalRaw || priceAmountRaw)
    };
}


// --- compare logic ----------------------------------------------------------
function initCompare(rows) {
    const T = new CompareTable(rows);

    // Filters
    const $ = (sel) => document.querySelector(sel);
    const fDrawdown = $('#fDrawdown');
    const fAccount = $('#fAccount');
    const fSteps = $('#fSteps');
    const fPriceType = $('#fPriceType');

    [fDrawdown, fAccount, fSteps, fPriceType].forEach(el =>
        el.addEventListener('change', () => {
            T.setFilters({
                drawdown: valueOrAll(fDrawdown.value),
                account: valueOrAll(fAccount.value),
                steps: valueOrAll(fSteps.value),
                priceType: valueOrAll(fPriceType.value)
            });
        })
    );

    // Sorting
    document.querySelectorAll('.compare-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-sort');
            T.toggleSort(key);
            // visual state
            document.querySelectorAll('.compare-table th').forEach(x => x.classList.remove('sorted-asc', 'sorted-desc'));
            th.classList.add(T.sort.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
        });
    });

    // Initial render
    T.render();
}

function valueOrAll(v) {
    return (v && v !== 'All') ? v : null;
}

class CompareTable {
    constructor(rows) {
        this.allRows = rows;
        this.filtered = rows;
        this.sort = { key: 'name', dir: 'asc' };
        this.tbody = document.getElementById('compareBody');
    }

    setFilters({ drawdown, account, steps, priceType }) {
        this.filtered = this.allRows.filter(r =>
            (drawdown ? r.drawdown === drawdown : true) &&
            (account ? r.accountSize === account : true) &&
            (steps ? r.steps === steps : true) &&
            (priceType ? r.priceType === priceType : true)
        );
        this.render();
    }

    toggleSort(key) {
        if (this.sort.key === key) {
            this.sort.dir = this.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            this.sort.key = key;
            this.sort.dir = 'asc';
        }
        this.render();
    }

    render() {
        const dir = this.sort.dir === 'asc' ? 1 : -1;
        const key = this.sort.key;

        const sorted = [...this.filtered].sort((a, b) => {
            const av = this.valueForSort(a, key);
            const bv = this.valueForSort(b, key);
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        });

        this.tbody.innerHTML = sorted.map(r => this.rowHtml(r)).join('');
    }

    // normalize values for proper numeric sorting
    valueForSort(r, key) {
        switch (key) {
            case 'name': return r.name.toLowerCase();
            case 'accountSize': return parseInt(r.accountSize.replace(/\D/g, '')) || 0;
            case 'steps': return this.stepsToNum(r.steps);
            case 'activationFee': return moneyToNumber(r.activationFee);
            case 'maxContracts': return (r.maxContracts?.minis || 0); // sort by minis
            case 'profitTarget': return moneyToNumber(r.profitTarget);
            case 'dailyLoss': return moneyToNumber(r.dailyLoss);
            case 'maxLoss': return moneyToNumber(r.maxLoss);
            case 'profitSplit': return percentToNumber(r.profitSplit);
            case 'payoutFreq': return payoutToRank(r.payoutFreq);
            case 'priceAmount': return r._sort_price ?? moneyToNumber(r.priceAmount);
            default: return 0;
        }
    }

    stepsToNum(s) {
        if (!s) return 0;
        if (/instant/i.test(s)) return 0; // treat "Instant Funded" as 0
        const n = parseInt(s.replace(/\D/g, ''), 10);
        return isNaN(n) ? 0 : n;
    }

    rowHtml(r) {
        const mc = r.maxContracts ? `${r.maxContracts.minis ?? 0} | ${r.maxContracts.micros ?? 0}` : '-';
        const moneyNum = (s) => parseFloat(String(s || '').replace(/[^\d.]/g, '')) || 0;
        const discountPct = (r.priceOriginal && r.priceOriginal !== 'None')
            ? Math.round((1 - (moneyNum(r.priceAmount) / moneyNum(r.priceOriginal))) * 100)
            : null;


        return `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.accountSize)}</td>
        <td>${escapeHtml(r.steps)}</td>
        <td>${escapeHtml(r.activationFee)}</td>
        <td>${mc}</td>
        <td>${escapeHtml(r.profitTarget)}</td>
        <td>${escapeHtml(r.dailyLoss)}</td>
        <td>${escapeHtml(r.maxLoss)}</td>
        <td>${escapeHtml(r.profitSplit)}</td>
        <td>${escapeHtml(r.payoutFreq)}</td>
        <td>
        ${r.priceOriginal ? `<span class="price-old">${escapeHtml(r.priceOriginal)}</span>` : ''}
        <strong class="price-new">${escapeHtml(r.priceAmount)}</strong>
        ${discountPct ? `<span class="price-badge">-${discountPct}%</span>` : ''}
        <div class="muted">${escapeHtml(r.priceType)}</div>
      </td>
      <td><a class="btn-primary" href="${r.buyUrl || '#'}" target="_blank" rel="noopener">Buy</a></td>
    </tr>

    `;
    }
}

// --- helpers ---------------------------------------------------------------
function moneyToNumber(s) {
    if (!s || /none/i.test(s)) return 0;
    const n = parseFloat(String(s).replace(/[^\d.]/g, ''));
    return isNaN(n) ? 0 : n;
}
function percentToNumber(s) {
    if (!s) return 0;
    const n = parseFloat(String(s).replace(/[^\d.]/g, ''));
    return isNaN(n) ? 0 : n;
}
function payoutToRank(s) {
    // lower rank sorts earlier; adjust to your preference
    const map = { 'Daily': 1, 'Weekly': 2, 'Biweekly': 3, 'Monthly': 4, 'On-Demand': 0 };
    return map[s] ?? 99;
}
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
