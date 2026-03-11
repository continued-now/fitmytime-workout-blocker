const fs = require('fs');
const path = require('path');

// Copy CSS files to dist
function copyCSSFiles() {
  const cssFiles = [
    { src: 'src/styles/popup.css', dest: 'dist/popup.css' },
    { src: 'src/styles/modal.css', dest: 'dist/modal.css' }
  ];

  cssFiles.forEach(({ src, dest }) => {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Copied ${src} to ${dest}`);
    } else {
      console.warn(`Warning: ${src} not found`);
    }
  });
}

// Copy manifest.json to dist
function copyManifest() {
  if (fs.existsSync('manifest.json')) {
    fs.copyFileSync('manifest.json', 'dist/manifest.json');
    console.log('Copied manifest.json to dist/');
  } else {
    console.error('Error: manifest.json not found');
  }
}

// Create icons directory if it doesn't exist
function ensureIconsDirectory() {
  const iconsDir = 'dist/icons';
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
    console.log('Created icons directory');
  }
}

// Main build function
function build() {
  console.log('Starting build process...');
  
  // Ensure dist directory exists
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }
  
  copyCSSFiles();
  copyManifest();
  ensureIconsDirectory();
  
  console.log('Build completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Add icon files to dist/icons/ (icon16.png, icon48.png, icon128.png)');
  console.log('2. Update manifest.json with your Google OAuth client ID');
  console.log('3. Load the extension from the dist/ folder in Chrome');
}

build(); 