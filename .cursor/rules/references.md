A cursor extension that finds all references to a selected definition would need to follow a multi-step process. First, the extension must identify the type and name of the selected element. Then, it should perform a project-wide search to locate all references, including cases where the selected element is a method, property, or variable. Finally, the extension must present these findings in a clear, navigable format for the user. 
***

## AI Instructions: All References Feature

### 1. **Initial Element Identification**
* **AI Goal:** Determine the selected element's type, name, and its containing file.
* **Logic:**
    * Examine the cursor's position within the user's code.
    * Use the existing "Go to Selected Definition" feature's logic to identify the variable's type and the file where its definition is located. For example, if the user selects `shouldPopulateNativeHierarchyParentField` on `currentFactory`, the AI must first identify that `currentFactory` is of type `HierarchyFactory`.
    * This initial step is crucial for establishing the search query (e.g., `shouldPopulateNativeHierarchyParentField` within the `HierarchyFactory` class).

### 2. **Codebase Search Strategy**
* **AI Goal:** Find all instances of the identified element across the project.
* **Logic:**
    * **Prioritize Local Files:** Begin the search in the current file to quickly find local references.
    * **Hierarchical Project Search:**
        * **Primary Scope:** Search the `force-app/main/default/classes/` directory for user-created Apex classes. The main focus should be on this directory.
        * **Secondary Scope:** If the element is not found, extend the search to other directories within `force-app/main/default/` (like triggers or other metadata types).
        * **Fallback Scope:** As a final step, search the `.sfdx/tools/StandardApexLibrary/` for references in standard Salesforce library files, but only if they weren't found in the primary scope. This hierarchical approach is designed for performance.
    * **Pattern Matching:** The AI should use a robust pattern-matching system to find references. This includes:
        * Searching for variable declarations like `ClassName variableName = ...`.
        * Looking for `public static` declarations, which include methods, constants, and variables.
        * Identifying calls to the method or references to the property, such as `HierarchyFactory.shouldPopulateNativeHierarchyParentField()`.
* **Edge Case Handling:**
    * The AI must be able to handle cases where a definition is not found.
    * The AI must also consider scenarios with method overloading, where multiple methods might have the same name.

### 3. **Output and User Interface**
* **AI Goal:** Present the search results in a clear and interactive way.
* **Logic:**
    * Create a list or tree view in a new sidebar panel within the IDE.
    * Each item in the list should display:
        * The file name where the reference was found (e.g., `HierarchyFactory.cls`).
        * The line number of the reference.
        * A snippet of the code line containing the reference.
    * The user should be able to click on any item in the list to navigate directly to that line in the relevant file.

### 4. **Integration with Existing Features**
* **AI Goal:** Reuse existing functionality to reduce code duplication and ensure consistency.
* **Logic:**
    * The "All References" feature should call the "Go to Selected Definition" logic as its first step. This ensures that if the user selects a variable reference, the AI first navigates to its definition before searching for all other references to that definition.
    * The search function should be designed to maintain backward compatibility with the existing system.