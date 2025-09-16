# Find All References Feature

This document describes the new "Find All References" feature added to the Visbal Extension.

## Overview

The "Find All References" feature allows you to find all occurrences of a selected symbol (method, property, class, or variable) across your entire Salesforce project. It builds upon the existing "Go to Selected Definition" functionality and provides a comprehensive view of where symbols are used.

## How to Use

### Method 1: Keyboard Shortcut
1. Place your cursor on any symbol (method name, property, class name, or variable)
2. Press `Ctrl+Shift+R`
3. The Visbal References panel will open showing all found references

### Method 2: Command Palette
1. Place your cursor on any symbol
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Type "V: Find All References" and select the command

### Method 3: Context Menu
1. Right-click on any symbol in the editor
2. Select "V: Find All References" from the context menu

### Method 4: References Panel
1. Open the References panel from the side panel
2. Use the "Find All References" button in the panel toolbar

## Features

### Hierarchical Search Strategy
The feature follows a performance-optimized hierarchical search strategy:

1. **Current File First**: Searches the current file for local references
2. **Primary Scope**: Searches `force-app/main/default/classes/` for user-created Apex classes
3. **Secondary Scope**: Searches other metadata types in `force-app/main/default/` (triggers, pages, components)

### Symbol Type Detection
The feature automatically detects different symbol types:

- **Methods**: Function calls like `myMethod()`, `object.method()`, `this.method()`
- **Properties**: Property access like `myProperty`, `object.property`, `this.property`
- **Classes**: Class references like `new MyClass()`, `MyClass.staticMethod()`
- **Variables**: Variable usage and declarations

### Smart Context Analysis
- Identifies object types to find class-specific method and property references
- Handles `this` references within the current class context
- Distinguishes between method calls and property access
- Recognizes static vs instance member access

## References Panel

The References panel displays results in a tree structure:

```
MyMethod (15 references)
├── MyClass.cls (8)
│   ├── Line 25: public void myMethod() {
│   ├── Line 45: this.myMethod();
│   └── Line 67: result = myMethod();
├── TestClass.cls (4)
│   ├── Line 12: factory.myMethod();
│   └── Line 89: MyClass instance = new MyClass(); instance.myMethod();
└── UtilityClass.cls (3)
    ├── Line 156: MyClass.myMethod();
    └── Line 203: // Call myMethod when needed
```

### Panel Features

- **Click to Navigate**: Click any reference to jump to that location
- **File Grouping**: References are grouped by file with reference counts
- **Line Preview**: Each reference shows the line number and code snippet
- **Refresh**: Update references if code has changed
- **Clear**: Clear the current results

## Commands

The following commands are available:

- `visbal-ext.findAllReferences` - V: Find All References - Find all references to symbol at cursor
- `visbal-ext.goToReference` - Navigate to a specific reference (used internally)
- `visbal-ext.refreshReferences` - Refresh current reference results
- `visbal-ext.clearReferences` - Clear the references view

## Integration with Existing Features

This feature integrates seamlessly with the existing "Go to Selected Definition" functionality:

1. **Shared Symbol Detection**: Uses the same logic to identify symbols at cursor position
2. **Consistent Results**: Symbol identification works the same way for both features
3. **Complementary Workflow**: Use "Go to Definition" to understand, then "Find References" to see usage

## Use Cases

### Code Navigation
- Find where a method is called throughout the codebase
- Locate all usages of a property or variable
- Understand the impact of changing a method signature

### Refactoring
- Safely rename methods, properties, or classes
- Understand dependencies before making changes
- Verify that all references are updated after changes

### Code Analysis
- Analyze usage patterns of your APIs
- Find dead code (methods with no references)
- Understand code coupling and dependencies

### Debugging
- Trace where values are set or modified
- Find all places where a method might be affecting state
- Understand execution paths through reference analysis

## Performance Notes

- **Cached Results**: Results are cached and can be refreshed as needed
- **Focused Search**: Only searches user code in `force-app/main/default/` for faster results
- **Pattern Matching**: Uses optimized regex patterns for different symbol types
- **File Filtering**: Only searches relevant file types based on context

## Troubleshooting

### No References Found
- Ensure the cursor is placed directly on a symbol (method name, not whitespace)
- Check that the symbol is correctly identified (look at the root node description)
- Try refreshing the results if code has been recently modified

### Incorrect References
- The feature uses pattern matching and may occasionally find false positives
- Context analysis helps minimize false matches
- Review results to confirm relevance

### Performance Issues
- Large codebases may take longer to search
- The focused search strategy only searches user code for optimal performance
- Consider clearing results when not needed to free memory

## Configuration

Currently, the References feature is always enabled. Future versions may include:

- Enable/disable reference search in specific directories
- Customize search patterns for different file types
- Performance tuning options for large codebases

## Related Features

- **Go to Selected Definition**: Navigate to where a symbol is defined
- **Symbol Navigation**: General symbol search and navigation
- **Test Explorer**: Run and analyze test methods
- **Git History**: View changes to symbols over time

## Keyboard Shortcuts

### Visbal Extension (Enhanced)
- `Ctrl+Shift+R` - **Find All References** (enhanced Salesforce-aware search)

### VS Code Built-in
- `Shift+F12` - Find All References (VS Code's built-in, may be limited for Apex)
- `F12` - Go to Definition 
- `Alt+F12` - Peek References

**Recommendation**: Use `Ctrl+Shift+R` for better Apex/Salesforce code analysis!

## VS Code Built-in vs Visbal Enhanced References

| Feature | VS Code (`Shift+F12`) | Visbal (`Ctrl+Shift+R`) |
|---------|----------------------|-------------------------|
| **File Types** | All languages | Optimized for Apex/Salesforce |
| **Search Scope** | Current workspace | Hierarchical Salesforce structure |
| **Symbol Detection** | Generic patterns | Apex-aware (classes, methods, properties) |
| **Results Display** | Simple list | Organized tree with file grouping |
| **Context Analysis** | Basic | Smart (this.method, ClassName.method) |
| **Performance** | Good for small projects | Optimized for large Salesforce orgs |
| **Navigation** | Click to go to line | Enhanced with highlighting & context |

**Use Visbal's `Ctrl+Shift+R` for Salesforce development!**

---

## Technical Implementation

For developers interested in the technical details:

### Architecture
- **ReferencesService**: Core logic for finding references
- **ReferencesView**: Tree view UI for displaying results
- **SymbolNavigationService**: Shared symbol identification logic

### Search Patterns
The feature uses regex patterns optimized for Apex and related languages:
- Method calls: `\bmethod\s*\(`
- Property access: `\.property\b(?!\s*\()`
- Class instantiation: `\bnew\s+ClassName\b`
- Static access: `ClassName\.member`

### File Type Support
- Primary: `.cls` (Apex classes)
- Secondary: `.trigger`, `.page`, `.component` (other Salesforce metadata)
