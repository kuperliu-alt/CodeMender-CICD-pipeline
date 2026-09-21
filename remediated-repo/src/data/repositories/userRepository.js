const usersDB = { '1001': { id: '1001', name: 'Alice', role: 'customer', balance: 50.0 } };
const ALLOWED_UPDATE_FIELDS = new Set(['name', 'email']);

exports.updateUser = (id, payload) => {
    if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(usersDB, id)) {
        return null;
    }
    const user = usersDB[id];
    if (!user || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
    }

    for (const key of Object.keys(payload)) {
        if (ALLOWED_UPDATE_FIELDS.has(key) && typeof payload[key] === 'string') {
            user[key] = payload[key];
        }
    }
    return user;
};