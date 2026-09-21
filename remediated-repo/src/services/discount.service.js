const cartRepo = require('../data/repositories/cartRepository');

const activePromos = {
    'SUMMER20': { multiplier: 0.8 },
    'WINTER30': { multiplier: 0.7 }
};

exports.applyPromoToCart = (cartId, promoCode) => {
    const cart = cartRepo.getCart(cartId);
    if (!cart) throw new Error('Cart not found');

    if (typeof promoCode !== 'string' || !Object.prototype.hasOwnProperty.call(activePromos, promoCode)) {
        throw new Error('Invalid promo code');
    }
    if (!Array.isArray(cart.appliedPromos)) {
        cart.appliedPromos = [];
    }
    if (cart.appliedPromos.length > 0 || cart.appliedPromos.includes(promoCode)) {
        throw new Error('Promo code already applied');
    }

    cart.totalPrice = Math.round(cart.totalPrice * activePromos[promoCode].multiplier * 100) / 100;
    cart.appliedPromos.push(promoCode);
    cartRepo.saveCart(cartId, cart);
    return cart;
};