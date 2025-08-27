@echo off
REM Batch file to delete all files in the Windows Temp folder
REM Created for cleaning temporary files

echo Deleting files in C:\Users\Ricky\AppData\Local\Temp...
echo.

REM Delete all files in the temp directory (but keep subdirectories)
del /Q "C:\Users\Ricky\AppData\Local\Temp\*.*" 2>nul

REM Optional: Also delete files in subdirectories (uncomment the line below if needed)
REM del /Q /S "C:\Users\Ricky\AppData\Local\Temp\*.*" 2>nul

REM Optional: Remove empty subdirectories (uncomment the line below if needed)
REM for /d %%x in ("C:\Users\Ricky\AppData\Local\Temp\*") do rd /s /q "%%x" 2>nul

echo.
echo Cleanup completed!
echo Files in C:\Users\Ricky\AppData\Local\Temp have been deleted.
echo.
pause
