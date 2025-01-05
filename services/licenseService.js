const License = require('../models/License');
const LicenseRequest = require('../models/LicenseRequest');
const User = require('../models/User'); // Import the User model

/**
 * Function to update license data from the supplier.
 * @param {Object} licenseData - The license data to be updated.
 * @param {string} licenseData.licenseeName - The name of the licensee.
 * @param {string} licenseData.serialNumber - The serial number of the license.
 * @param {string} licenseData.registrationCode - The registration code of the license.
 * @param {string} licenseData.activationCode - The activation code of the license.
 * @param {string} licenseData.featuresCode - The features code of the license.
 */
const updateLicenseData = async ({ licenseeName, serialNumber, registrationCode, activationCode, featuresCode }) => {
  try {
    console.log('Starting license data update process...');

    // Trim registration code and other relevant fields
    registrationCode = registrationCode.trim();
    licenseeName = licenseeName.trim();
    serialNumber = serialNumber.trim();
    activationCode = activationCode.trim();
    featuresCode = featuresCode.trim();

    // Find the latest license request by registration code
    const latestRequest = await LicenseRequest.findOne({ registrationCode }).sort({ createdAt: -1 });
    if (!latestRequest) {
      console.error(`No matching license request found for registration code: ${registrationCode}`);
      throw new Error('No matching license request found.');
    }

    // Create or update the license record
    const license = await License.findOneAndUpdate(
      { registrationCode },
      {
        licenseeName,
        serialNumber,
        registrationCode,
        activationCode,
        featuresCode
      },
      { upsert: true, new: true }
    );

    // Update the license request with the new license data and set status to "Approved"
    latestRequest.finalLicense = license._id;
    latestRequest.status = 'Approved';
    latestRequest.activationCode = activationCode; // Ensure activationCode is updated
    latestRequest.licenseDataCreatedAt = new Date(); // Set the licenseDataCreatedAt field
    await latestRequest.save();

    // Find the user associated with the license request
    const user = await User.findById(latestRequest.userId);
    if (!user) {
      console.error(`No matching user found for userId: ${latestRequest.userId}`);
      throw new Error('No matching user found for this license request.');
    }

    // Log success message
    console.log(`License data updated successfully for user ${user.username}.`);

  } catch (error) {
    console.error('Error updating license data:', error.message, error.stack);
    throw new Error('Failed to update license data.');
  }
};

module.exports = {
  updateLicenseData
};