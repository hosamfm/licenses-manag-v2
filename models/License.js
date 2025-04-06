const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema({
  licenseeName: {
    type: String,
    required: true
  },
  serialNumber: {
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
  activationCode: {
    type: String,
    required: true
  },
  featuresCode: {
    type: String,
    required: true
  },
  expirationDate: {
    type: Date,
    required: false
  },
  supplierName: {
    type: String,
    required: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  }
}, { timestamps: true });

const License = mongoose.model('License', licenseSchema);

module.exports = License;
