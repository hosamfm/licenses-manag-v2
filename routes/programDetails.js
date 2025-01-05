const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleware'); // Import isAuthenticated middleware

const programDetails = {
  description: "LicenseManager is a comprehensive web application for managing license requests. It enables users to create new license requests, manage existing licenses, update request statuses, and delete unwanted requests. The program is designed to streamline the license management process with an easy-to-use and secure user interface.",
  features: [
    "User Authentication: The system requires users to log in to access license management functionalities. Includes login and logout pages for user authentication.",
    "Create License Requests: Allows users to create new license requests through a user-friendly form. Supported request types include New License, Additional License, Temporary License, Additional Feature Request, Re-License, Free License.",
    "Manage Requests: Display all license requests in a single interface for easy management. Update request statuses (Pending, Approved, Rejected). Delete unwanted requests.",
    "Interactive User Interface: Enhance user experience with HTML, CSS, and JavaScript. A user-friendly interface that allows easy navigation between different features.",
    "Integration with Telegram: Send license requests via the Telegram API. Receive responses from Telegram and store the received licenses in the database. Send final licenses to users via Telegram using chat_id.",
    "Data Validation: Registration code must start with the letter R and be 17 or 18 characters long. Ensure all required fields are filled before submitting the request. Prevent duplicate requests with the same registration code, except for additional feature requests.",
    "User Notifications: Display notifications to users on successful request submission or errors. Immediate notifications when attempting to submit an already existing license request.",
    "Database Management: Store license data, requests, and users in well-organized tables. Link requests to the received licenses for accurate tracking of the process."
  ],
  programmingLanguage: "JavaScript (Node.js)"
};

router.get('/', isAuthenticated, (req, res) => {
  try {
    console.log('Program details requested by user:', req.session.userId);
    res.status(200).json(programDetails);
  } catch (error) {
    console.error('Error fetching program details:', error.message, error.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/page', isAuthenticated, (req, res) => {
  try {
    console.log('Program details page requested by user:', req.session.userId);
    res.render('program_details', { programDetails });
  } catch (error) {
    console.error('Error rendering program details page:', error.message, error.stack);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/info', isAuthenticated, (req, res) => {
  try {
    console.log('Program info requested by user:', req.session.userId);
    res.status(200).json({
      description: programDetails.description,
      features: programDetails.features,
      programmingLanguage: programDetails.programmingLanguage
    });
  } catch (error) {
    console.error('Error fetching program info:', error.message, error.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;