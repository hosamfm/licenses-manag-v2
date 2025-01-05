const LicenseRequest = require('../models/LicenseRequest');
const User = require('../models/User');
const License = require('../models/License');

async function fetchLicenseRequests(userId, userRole, filters = {}) {
  try {
    let query = {};

    if (userRole === 'representative') {
      query.userId = userId;
    } else if (userRole === 'supervisor') {
      // Fetch supervisor's subordinates based on supervisor field
      const subordinates = await User.find({ supervisor: userId }).select('_id');
      const subordinateIds = subordinates.map(sub => sub._id);
      query.userId = { $in: [userId, ...subordinateIds] };
    } else if (userRole === 'admin') {
      // Admin can see all license requests, no specific query modification needed
    }

    // Apply additional filters
    if (filters.userName && (userRole === 'admin' || userRole === 'supervisor'|| userRole === 'supplier')) {
      const users = await User.find({ username: new RegExp(filters.userName, 'i') }, '_id');
      const userIds = users.map(user => user._id);
      if (query.userId) {
        query.userId = { $in: userIds.filter(id => query.userId.$in.includes(id)) };
      } else {
        query.userId = { $in: userIds };
      }
    }

    if (filters.startDate && filters.endDate) {
      query.createdAt = { $gte: new Date(filters.startDate), $lte: new Date(filters.endDate) };
    } else if (filters.startDate) {
      query.createdAt = { $gte: new Date(filters.startDate) };
    } else if (filters.endDate) {
      query.createdAt = { $lte: new Date(filters.endDate) };
    }

    // Integrate the search query for 'Licensee Name' or 'Registration Code'
    if (filters.searchQuery) {
      query.$or = [
        { licenseeName: new RegExp(filters.searchQuery, 'i') },
        { registrationCode: new RegExp(filters.searchQuery, 'i') },
      ];
    }

    const licenseRequests = await LicenseRequest.find(query)
      .populate('userId', 'username')
      .sort({ createdAt: -1 })
      .select('licenseeName registrationCode featuresCode requestType requestPrice status userId createdAt licenseDataCreatedAt finalLicense activationCode')
      .lean();

    // Ensure requestPrice is defined and set to 0.00 if not
    licenseRequests.forEach(request => {
      if (request.requestPrice === undefined || request.requestPrice === null) {
        request.requestPrice = 0.00;
      }
    });

    return licenseRequests;
  } catch (error) {
    console.error('Error fetching license requests:', error.message, error.stack);
    throw new Error('Failed to fetch license requests');
  }
}

async function fetchLatestLicenseDetails(registrationCode) {
  try {
    const latestLicense = await License.findOne({ registrationCode })
      .sort({ createdAt: -1 })
      .lean();

    if (!latestLicense) {
      throw new Error(`No license found for registration code: ${registrationCode}`);
    }

    return latestLicense;
  } catch (error) {
    console.error('Error fetching latest license details:', error.message, error.stack);
    throw new Error('Failed to fetch latest license details');
  }
}

module.exports = {
  fetchLicenseRequests,
  fetchLatestLicenseDetails,
};
