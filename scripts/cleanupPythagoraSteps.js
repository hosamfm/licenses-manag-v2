const fs = require('fs');
const path = require('path');

// Directory where Pythagora steps are stored
const stepsDir = path.join(__dirname, '../pythagora/steps');

// Function to get sorted files by creation/modification date
function getSortedFiles(dir) {
  try {
    const files = fs.readdirSync(dir);
    return files
      .map(file => ({ file, time: fs.statSync(path.join(dir, file)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time)
      .map(({ file }) => file);
  } catch (error) {
    console.error('Error reading or sorting files:', error.message, error.stack);
    throw error;
  }
}

// Function to cleanup old steps keeping only the last two
function cleanupOldSteps() {
  try {
    if (!fs.existsSync(stepsDir)) {
      console.log("Steps directory does not exist. No cleanup needed.");
      return;
    }

    const sortedFiles = getSortedFiles(stepsDir);

    if (sortedFiles.length <= 2) {
      console.log("No old steps to cleanup");
      return;
    }

    const filesToDelete = sortedFiles.slice(2);

    filesToDelete.forEach(file => {
      const filePath = path.join(stepsDir, file);
      fs.unlinkSync(filePath);
      console.log(`Deleted old step: ${file}`);
    });
  } catch (error) {
    console.error('Error during cleanup of old steps:', error.message, error.stack);
    throw error;
  }
}

cleanupOldSteps();