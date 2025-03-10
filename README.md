# Visbal Extension for Cursor

A basic extension for the Cursor editor.

## Features

- Hello World command: Displays a simple greeting message

## Installation

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run build` to compile the TypeScript code
4. To test the extension in Cursor:
   - Copy the extension folder to the Cursor extensions directory
   - Restart Cursor
   - Run the command "Hello World" from the command palette

## Development

- `npm run build`: Compile the TypeScript code
- `npm run watch`: Watch for changes and recompile
- `npm run package`: Package the extension into a .vsix file

## Requirements

- Cursor editor

## Extension Settings

This extension doesn't contribute any settings yet.

## Known Issues

None at the moment.

## Release Notes

### 0.0.1

Initial release with basic Hello World functionality. 



Next steps for your extension development:
You can modify the extension by:
Editing the source code in your project
Running "npm run build" to recompile
Copying the updated files to the extension directory
Restarting Cursor IDE
To add more functionality:
Add new commands in the "package.json" file
Implement the command handlers in the "extension.ts" file
Rebuild and reinstall as described above