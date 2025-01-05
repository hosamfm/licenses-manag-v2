// models/PriceReaderLicenseRequest.js

const mongoose = require('mongoose');

const PriceReaderLicenseRequestSchema = new mongoose.Schema({
    licenseeName: { type: String, required: true },
    deviceCode: { type: String, required: true },
    activationCode: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PriceReaderLicenseRequest', PriceReaderLicenseRequestSchema);
