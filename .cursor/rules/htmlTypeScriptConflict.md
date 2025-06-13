### **Code Structure:**
1. **Encapsulation**:
   - All JavaScript code must be encapsulated within a properly closed HTML template string in TypeScript.
2. **Code Placement**:
   - No TypeScript, JSX, or JavaScript code should exist outside of this template string.
3. **TypeScript Validity**:
   - Only valid TypeScript code should be present outside the template string.
4. **HTML Areas**:
   - **IMPORTANT**: DO NOT USE TYPESCRIPT LANGUAGE ON HTML AREAS. Fix the template string boundary as described above.
---
### **Implementation Steps:**
1. **Code Implementation**:
   - Implement the code according to the defined design, ensuring alignment with the existing UI.
2. **Validation**:
   - Ensure all JavaScript is correctly placed within the HTML template string.
   - Confirm that TypeScript code is properly structured.
3. **HTML Attributes**:
   - Use single quotes ' or double quotes " for HTML attributes inside the template string, but do not escape them unless necessary.
   - For the omitted line indicator, use single quotes for clarity.
4. **Quote Management**:
   - Do not use backslashes to escape quotes inside a template string unless mixing quote types.
   - Ensure the omitted line indicator is a single, valid HTML string.
   - Avoid escaping quotes inside the template string unless necessary.
5. **Code Cleanup**:
   - Remove any stray or corrupted lines (such as class { } or extra semicolons) that may have been introduced by previous edits.
6. **Compilation**:
   - Save and recompile the code. If there are errors, fix them and compile until the code is free of errors.