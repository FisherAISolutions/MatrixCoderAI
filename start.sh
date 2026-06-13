#!/bin/bash

# CodePilot Production Upgrade - Start Script
# This script sets up and starts the development server

echo ""
echo "===================================================="
echo "CodePilot Production Upgrade - Development Server"
echo "===================================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "ERROR: npm install failed"
        echo "Make sure Node.js and npm are installed"
        exit 1
    fi
    echo ""
    echo "Dependencies installed successfully."
    echo ""
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo ""
    echo "WARNING: .env file not found"
    echo "Please create .env with required variables:"
    echo "  - NEXT_PUBLIC_SUPABASE_URL"
    echo "  - NEXT_PUBLIC_SUPABASE_ANON_KEY"
    echo "  - OPENAI_API_KEY"
    echo ""
    echo "See SETUP_AND_USAGE_GUIDE.md for details"
    echo ""
fi

# Start dev server
echo "Starting development server on http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
