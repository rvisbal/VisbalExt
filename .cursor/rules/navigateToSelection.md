# The "Go to Selected Definition" Feature

I need you to generate a design for a "Go to Selected Definition" feature for an IDE. The feature should allow a user to navigate directly to the definition of a method, property, or variable from where it is referenced in the code.

## Core Requirements

*   **Target Scope:** The functionality must operate within the current project's codebase.
*   **Navigation Logic:** The system must accurately identify the type of the object (e.g., `HierarchyFactory`) and then locate the definition of the referenced member (`shouldPopulateNativeHierarchyParentField`) within the corresponding file (`HierarchyFactory.cls`).
*   **No CLI Dependency:** This feature must be implemented without relying on `sfdx` or any other command-line interface tools. It should parse the project's files directly to find the definitions.
*   **Edge Case Handling:** The solution should consider how to handle scenarios where a definition is not found, or where there are multiple definitions with the same name (e.g., method overloading).

## Use Case Example

Consider the following Apex code snippet:

```apex
HierarchyFactory currentFactory = HierarchyMetadataUtils.getDefaultHierarchyFactory();
return currentFactory.shouldPopulateNativeHierarchyParentField();
```

When the user places the cursor on `shouldPopulateNativeHierarchyParentField` and triggers the "Go to Definition" command, the IDE should:

*   Identify the type of the `currentFactory` variable as `HierarchyFactory`.
*   Search for the definition of the `shouldPopulateNativeHierarchyParentField` method.
*   Navigate the user directly to the line where `public boolean shouldPopulateNativeHierarchyParentField()` is defined inside the `HierarchyFactory.cls` file.