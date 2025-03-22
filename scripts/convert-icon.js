const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, '../media/icon.svg');
const outputPath = path.join(__dirname, '../media/icon.png');

sharp(inputPath)
    .resize(128, 128)
    .png()
    .toFile(outputPath)
    .then(() => console.log('Icon converted successfully!'))
    .catch(err => console.error('Error converting icon:', err)); 