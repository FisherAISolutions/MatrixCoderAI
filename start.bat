@echo off
REM CodePilot Production Upgrade - Start Script
REM This script sets up and starts the development server

echo.
echo ====================================================
echo CodePilot Production Upgrade - Development Server
echo ====================================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed
        echo Make sure Node.js and npm are installed
        pause
        exit /b 1
    )
    echo.
    echo Dependencies installed successfully.
    echo.
)

REM Check if .env exists
if not exist ".env" (
    echo.
    echo WARNING: .env file not found
    echo Please create .env with required variables:
    echo   - NEXT_PUBLIC_SUPABASE_URL
    echo   - NEXT_PUBLIC_SUPABASE_ANON_KEY
    echo   - OPENAI_API_KEY
    echo.
    echo See SETUP_AND_USAGE_GUIDE.md for details
    echo.
)

REM Start dev server
echo Starting development server on http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo.

call npm run dev

pause
