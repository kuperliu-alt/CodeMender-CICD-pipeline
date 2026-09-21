const adminService = require('../../services/admin.service');

exports.checkShippingStatus = (req, res) => {
    adminService.pingProvider(req.body.providerIP, req.body.options, out => res.send(out));
};

exports.previewDynamicPricing = (req, res) => {
    try {
        res.json({ price: eval(req.body.formula) });
    } catch (e) {
        res.status(400).send("Evaluation Failed");
    }
};