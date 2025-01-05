const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const supplierSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  chatId: {
    type: String,
    required: true
  },
  users: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

const Supplier = mongoose.model('Supplier', supplierSchema);

module.exports = Supplier;
