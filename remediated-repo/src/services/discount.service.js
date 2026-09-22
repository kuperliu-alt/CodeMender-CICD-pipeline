const cartRepo = require('../data/repositories/cartRepository');

const activePromos = {
    'SUMMER20': { multiplier: 0.8 },
    'WINTER30': { multiplier: 0.7 }
};

exports.applyPromoToCart = (cartId, promoCode) => {
    const cart = cartRepo.getCart(cartId);
    if (!cart) throw new Error('Cart not found');
    
    if (activePromos[promoCode]) {
        if (cart.appliedPromos && cart.appliedPromos.includes(promoCode)) {
            throw new Error('Promo code already applied');
        }
        cart.totalPrice = cart.totalPrice * activePromos[promoCode].multiplier;
        
        if (!cart.appliedPromos) {
            cart.appliedPromos = [];
        }
        cart.appliedPromos.push(promoCode); 
        
        cartRepo.saveCart(cartId, cart);
        return cart;
    }
    throw new Error('Invalid promo code');
};
