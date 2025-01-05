const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Supplier = require('../models/Supplier');

dotenv.config();

const dbURI = process.env.MONGODB_URL;
if (!dbURI) {
  throw new Error('MONGODB_URL environment variable is not set'); 
}

mongoose.connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected...'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message, err.stack);
    process.exit(1);
  });

const addSupplierData = async () => {
  const suppliers = [
    { name: 'Crystal', chatId: '123456789' },
    { name: 'Siraj', chatId: '987654321' }
  ];

  try {
    for (const supplier of suppliers) {
      const newSupplier = new Supplier(supplier);
      await newSupplier.save();
      console.log(`Supplier ${supplier.name} added successfully.`);
    }
  } catch (err) {
    console.error('Error adding supplier data:', err.message, err.stack);
  } finally {
    mongoose.connection.close()
      .then(() => console.log('MongoDB connection closed.'))
      .catch(err => console.error('Error closing MongoDB connection:', err.message, err.stack));
  }
};

addSupplierData();