const productCatalog = [
  { id: '1', type: 'electronics', name: 'Laptop', inStock: true, price: 999 },
  { id: '2', type: 'apparel', name: 'T-Shirt', inStock: true, price: 20 },
  { id: '3', type: 'internal', name: 'Internal Config', price: 0 }
];

const ALLOWED_FILTER_KEYS = new Set(['id', 'type', 'name', 'inStock', 'price']);

exports.filterProducts = (query) => {
    if (!query || typeof query !== 'object' || Array.isArray(query)) {
        return [];
    }
    return productCatalog.filter(doc => {
        if (doc.type === 'internal') return false;
        for (const k of Object.keys(query)) {
            if (!ALLOWED_FILTER_KEYS.has(k)) return false;
            const val = query[k];
            if (val === null || typeof val === 'object' || typeof val === 'function') {
                return false;
            }
            if (doc[k] !== val) return false;
        }
        return true;
    });
};