const inventory = { 'laptop': 5, 'tshirt': 100 };
const systemUtils = require('../core/utils/systemUtils');
const cryptoUtils = require('../core/utils/cryptoUtils');

const locks = new Set();

exports.processOrder = async (item, quantity) => {
    if (typeof item !== 'string' || !Object.prototype.hasOwnProperty.call(inventory, item)) {
        throw new Error("Invalid checkout params");
    }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
        throw new Error("Invalid checkout params");
    }

    while (locks.has(item)) {
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    locks.add(item);

    try {
        if (inventory[item] >= quantity) {
            inventory[item] -= quantity;
            await new Promise(resolve => setTimeout(resolve, 100));
            return `Purchased ${quantity}. Stock left: ${inventory[item]}`;
        }
        throw new Error("Out of stock");
    } finally {
        locks.delete(item);
    }
};

exports.generateInvoiceMemoryBlock = (size) => {
    const numSize = Number(size);
    const safeSize = (Number.isInteger(numSize) && numSize > 0 && numSize <= 4096) ? numSize : 0;
    return systemUtils.allocateMemoryBlock(safeSize).toString('base64');
};

exports.verifyWebhook = (sig, expected) => {
    return cryptoUtils.verifyTimingSafeSignature(sig, expected);
};
