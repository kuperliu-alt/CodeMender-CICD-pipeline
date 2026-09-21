const db = {
    'cart-123': { id: 'cart-123', items: ['item1'], totalPrice: 100.0, appliedPromos: [] }
};

exports.getCart = (cartId) => {
    if (typeof cartId !== 'string' || !Object.prototype.hasOwnProperty.call(db, cartId)) {
        return null;
    }
    return db[cartId];
};

exports.saveCart = (cartId, cartObj) => {
    if (typeof cartId === 'string' && Object.prototype.hasOwnProperty.call(db, cartId) && cartObj && typeof cartObj === 'object') {
        db[cartId] = cartObj;
    }
};