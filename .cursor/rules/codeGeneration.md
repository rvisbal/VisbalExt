* Change console.log for OrgUtils.logDebug
* change console.error for OrgUtils.logError
* the message shoould contains '[VisbalExt.TestClassExplorerView] -- _viewTestLog --message' where 
    VisbalExt : name of the extension
    TestClassExplorerView : the class file name
    _viewTestLog :  the methods where the log line exists 
    message, the message that want to be logged
* if there is a console.log or console.error do the change to the new method
* when doing the change build, compile and check error and fix accordenly.
* the changes should not be extensive as is a simple change

* if you find error like
    - Argument of type 'unknown' is not assignable to parameter of type 'Error'.
        -then check if the catch has the error variable and add error as Error as a parameter, or whatever the name or the error variable is

* Expected 2 arguments, but got 1.
    - if this is not inside a catch then is an OrgUtils.logDebug

