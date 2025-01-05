const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const router = express.Router();
const { isAuthenticated, checkRole } = require('../middleware/authMiddleware');

router.get('/chat-id', [isAuthenticated, checkRole(['admin'])], (req, res) => {
  try {
    res.locals.originalUrl = req.originalUrl; // Add this line to set originalUrl
    res.render('chat_id_management', { chatId: process.env.SUPPLIER_CHAT_ID });
  } catch (error) {
    console.error('Error rendering chat ID management page:', error.message, error.stack);
    req.flash('error', 'Failed to load chat ID management page.');
    res.redirect('/');
  }
});

router.post('/chat-id', [isAuthenticated, checkRole(['admin'])], (req, res) => {
  try {
    const newChatId = req.body.chatId;
    
    // Update the .env file with the new chat ID
    const envFilePath = path.resolve(__dirname, '../.env');
    const envConfig = dotenv.parse(fs.readFileSync(envFilePath));

    envConfig.SUPPLIER_CHAT_ID = newChatId;
    const envString = Object.keys(envConfig).map(key => `${key}=${envConfig[key]}`).join('\n');

    fs.writeFileSync(envFilePath, envString);

    console.log('Supplier chat ID updated successfully:', newChatId);
    req.flash('success', 'Supplier chat ID updated successfully.');
    res.redirect('/admin/chat-id');
    
  } catch (error) {
    console.error('Error updating supplier chat ID:', error.message, error.stack);
    req.flash('error', 'Failed to update supplier chat ID.');
    res.redirect('/admin/chat-id');
  }
});

module.exports = router;