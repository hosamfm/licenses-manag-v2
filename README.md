# LicenseManager

LicenseManager is a comprehensive web application for managing license requests. It enables users to create new license requests, manage existing licenses, update request statuses, and delete unwanted requests. The program is designed to streamline the license management process with an easy-to-use and secure user interface.

## Overview

The application is built using Node.js for the backend, Express for routing, MongoDB as the database, and EJS for templating. The frontend utilizes HTML, CSS, and JavaScript to create an interactive user experience. The project structure includes models for user and license request data, routes for handling authentication and license management, and views for user interface components.

## Features

- **User Authentication**: Secure login/logout functionality with user registration and Telegram account verification.
- **Create License Requests**: Users can submit requests for new licenses or modifications to existing licenses.
  - **Supported request types**:
    - New License
    - Additional License
    - Temporary License
    - Additional Feature Request
    - Re-License
    - Free License
- **Manage Requests**: Admins can view all license requests, update their statuses, and delete them as needed.
- **Interactive User Interface**: Easy navigation and immediate feedback on user actions.
- **Integration with Telegram**: Sending license requests and receiving license details via Telegram.
- **Data Validation**: Ensures the integrity of the data entered by users.
- **Permissions and Role Management**: Different roles with varying levels of access (No Permissions, Representative, Supervisor, Admin, supplier).
- **User Management**: Admins can add, delete users, and modify their roles and permissions.

## Getting started

### Requirements

- Node.js
- MongoDB
- Express
- A Telegram bot token (for Telegram integration)

### Quickstart

1. Clone the repository to your local machine.
2. Install the necessary dependencies by running `npm install`.
3. Copy `.env.example` to `.env` and fill in the required environment variables.
4. Start the application using `npm start`. The application will be available on `http://localhost:3001`.

### License

Copyright (c) 2024.