### Refactoring Logging Instructions
1. **Replace Console Logging:**
   - Change all instances of console.log to OrgUtils.logDebug.
   - Change all instances of console.error to OrgUtils.logError.
   - **Do not** make changes inside the _getHtmlForWebview method, as it uses innerHTML and is incompatible with this change.
   - When refactoring, **do not** add parameters to the message. For example:
     - **Correct:** ('Test failed:', t.Outcome);
     - **Invalid:** ('Test failed: ${testClass.name}');
     - **Correct:** ... test item:, classItem.label);
     - **Invalid:** ... test item: ${testClass.name};
     - **Correct:** ... Fetched methods:, methods);
     - **Invalid:** ... Fetched methods: ${JSON.stringify(methods)};
   - If inside a catch block, add the error variable as a parameter to the method OrgUtils.logError
2. **Format Logging Messages:**
   - Remove the error variable from the message.
   - Ensure that the log messages contain the following format:
     
     '[VisbalExt.TestClassExplorerView] -- _viewTestLog -- message'
     
   - **VisbalExt:** Name of the extension.
   - **TestClassExplorerView:** Name of the class file.
   - **_viewTestLog:** Name of the method where the log line exists.
   - **message:** The message you want to log.
3. **Error Handling Adjustments:**
   - If you encounter the error:
     - **"Argument of type 'unknown' is not assignable to parameter of type 'Error'."**
       - Check if the catch block has an error variable. If it does, ensure to type it correctly (e.g., catch (error: Error)).
   - If you encounter the error:
     - **"Expected 2 arguments, but got 1."**
       - If this error is not inside a catch block, replace the logging call with OrgUtils.logDebug.
4. **Build and Compile:**
   - After making the changes, build and compile the code.
   - Check for any errors and fix them accordingly.
5. **Keep Changes Minimal:**
   - The changes should not be extensive, as this is a straightforward refactoring task.
   - **IMPORTANT:** If a change requires adding or removing more than 1 line, do not proceed with the modification.
   - **DO NOT CHANGE** anything if the new modification requires more than 1 line.
   - When fixing linter errors, if the changes exceed the one-line modification limit stated in the refactor_log.md rule, it’s best to leave the error and allow me to fix it manually.