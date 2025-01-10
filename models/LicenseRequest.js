const mongoose = require('mongoose');

const licenseRequestSchema = new mongoose.Schema({
  licenseeName: {
    type: String,
    required: true
  },
  registrationCode: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^[RX][A-Za-z0-9]{16,17}$/.test(v);
      },
      message: props => `${props.value} is not a valid registration code! It must start with 'R' or 'X' and be 17 or 18 characters long.`
    }
  },
  featuresCode: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true,
    default: 'Pending'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requestType: {
    type: String,
    required: true
  },
  requestPrice: {
    type: Number,
    required: true,
    default: 0.00,
    validate: {
      validator: function(v) {
        return !isNaN(v) && v >= 0;
      },
      message: props => `${props.value} is not a valid decimal value!`
    }
  },
  branchName: {
    type: String,
    required: false
  },
  finalLicense: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'License',
    required: false
  },
  expirationDate: {
    type: Date,
    required: false
  },
  reason: {
    type: String,
    required: false
  },
  baseRegistrationCode: {
    type: String,
    required: false
  },
  oldRegistrationCode: {
    type: String,
    required: false
  },
  newRegistrationCode: {
    type: String,
    required: false
  },
  oldFeaturesCode: {
    type: String,
    required: false
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: false
  }
}, { timestamps: true });

licenseRequestSchema.index({ registrationCode: 1, requestType: 1 }, { unique: true, partialFilterExpression: { requestType: { $ne: 'AdditionalFeatureRequest' } } });

const LicenseRequest = mongoose.model('LicenseRequest', licenseRequestSchema);

module.exports = LicenseRequest;
