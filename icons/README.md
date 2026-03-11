# Extension Icons

This directory should contain the following icon files for the Chrome extension:

- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

## Icon Requirements

- **Format**: PNG
- **Transparency**: Supported
- **Design**: Should represent fitness/workout theme
- **Colors**: Should work well with the extension's purple gradient theme (#667eea to #764ba2)

## Placeholder Icons

Until you create custom icons, you can use any 16x16, 48x48, and 128x128 PNG files with these names, or create simple colored squares as placeholders.

## Creating Icons

You can create icons using:
- Figma, Sketch, or Adobe Illustrator
- Online icon generators
- Simple image editing tools like GIMP or Photoshop

## Example Icon Creation

For a quick placeholder, you can create a simple gradient square with the extension's colors:

```css
/* CSS for creating a simple gradient icon */
.icon {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 4px;
}
``` 