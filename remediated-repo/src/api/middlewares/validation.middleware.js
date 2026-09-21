const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

exports.validateCorporateEmail = (req, res, next) => {
    const { email, corporateDomain } = req.body;
    if (!email || typeof email !== 'string') {
        return res.status(400).send("Email required");
    }

    if (email.length > 254) {
        return res.status(400).send("Invalid email structure");
    }

    let domain = (typeof corporateDomain === 'string' && corporateDomain.trim())
        ? corporateDomain.trim()
        : 'example.com';

    if (domain.startsWith('@')) {
        domain = domain.slice(1);
    }

    const escapedDomain = escapeRegex(domain);
    const regex = new RegExp(`^[a-zA-Z0-9._%+-]+@${escapedDomain}$`, 'i');

    if (regex.test(email)) {
        return next();
    }
    return res.status(400).send("Invalid email structure");
};
