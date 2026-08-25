@echo off
cd /d "%~dp0"
start "" http://localhost:3210
npm run dev
