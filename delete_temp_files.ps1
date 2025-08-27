# PowerShell script to delete all files in the Windows Temp folder
# Created for cleaning temporary files

Write-Host "Deleting files in C:\Users\Ricky\AppData\Local\Temp..." -ForegroundColor Yellow
Write-Host ""

try {
    # Delete all files in the temp directory (but keep subdirectories)
    Get-ChildItem -Path "C:\Users\Ricky\AppData\Local\Temp\*" -File | Remove-Item -Force -ErrorAction SilentlyContinue
    
    # Optional: Also delete files in subdirectories (uncomment the line below if needed)
    # Get-ChildItem -Path "C:\Users\Ricky\AppData\Local\Temp\" -Recurse -File | Remove-Item -Force -ErrorAction SilentlyContinue
    
    # Optional: Remove empty subdirectories (uncomment the line below if needed)  
    # Get-ChildItem -Path "C:\Users\Ricky\AppData\Local\Temp\" -Recurse -Directory | Where-Object { (Get-ChildItem $_.FullName).Count -eq 0 } | Remove-Item -Force -ErrorAction SilentlyContinue
    
    Write-Host ""
    Write-Host "Cleanup completed!" -ForegroundColor Green
    Write-Host "Files in C:\Users\Ricky\AppData\Local\Temp have been deleted." -ForegroundColor Green
}
catch {
    Write-Host "Error occurred during cleanup: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
