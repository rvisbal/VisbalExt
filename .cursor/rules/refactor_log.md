### Refactoring Logging Instructions
1. **Replace Console Logging:**
   - Change all instances of console.log to OrgUtils.logDebug.
   - Change all instances of console.error to OrgUtils.logError.
   - Do not perform any changes inse the content of teh _getHtmlForWebview wich is a innerinnerHTML and is not compatible with this change
2. **Format Logging Messages:**
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
   - The changes should not be extensive, as this is a straightforward refactoring task. if the change means you need to remove or add more than 1 line, then dont do it.