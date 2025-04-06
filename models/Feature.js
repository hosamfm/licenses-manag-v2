const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const featureSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  value: {
    type: Number,
    required: true
  },
  price: {
    type: mongoose.Types.Decimal128,
    required: true,
    default: 0.0
  }
}, {
  timestamps: true
});

const Feature = mongoose.model('Feature', featureSchema);

module.exports = Feature;