const express = require('express');
const router = express.Router();
const TelegramMessage = require('../models/TelegramMessage');
const { isAuthenticated, checkRole } = require('../middleware/authMiddleware');

router.get('/messages', isAuthenticated, checkRole(['admin']), async (req, res) => {
    try {
        const messages = await TelegramMessage.find().sort({ timestamp: -1 });
        res.render('telegramMessages', { messages });
    } catch (err) {
        console.error('Error fetching telegram messages:', err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
