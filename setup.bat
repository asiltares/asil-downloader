@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title asil-downloader setup
cd /d "%~dp0"

echo.
echo   ============================================
echo              asil-downloader setup
echo   ============================================
echo.
echo     [1] Türkçe
echo     [2] English
echo.

set "TRIES="

:ask_lang
set "TRIES=%TRIES%x"
if "%TRIES%"=="xxxxxx" call :lang_tr & goto :start
set "L="
set /p "L=  Dil / Language (1-2): "
if "%L%"=="1" call :lang_tr & goto :start
if /i "%L%"=="tr" call :lang_tr & goto :start
if "%L%"=="2" call :lang_en & goto :start
if /i "%L%"=="en" call :lang_en & goto :start
goto :ask_lang

:start
title %T_TITLE%
echo.

if exist "manifest.json" goto :check_python
echo   %T_ERR% %T_NO_MANIFEST%
goto :fail

rem ---------------------------------------------------------------
:check_python
echo   [1/4] %T_PY_CHECK%
set "PY="
call :find_python
if defined PY goto :python_ready

echo         %T_PY_INSTALL%
call :need_winget || goto :fail
winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
for %%V in (313 312 311 310) do if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe"
if defined PY goto :python_ready
echo   %T_ERR% %T_PY_FAIL%
goto :fail

:python_ready
for /f "delims=" %%v in ('call "%PY%" -c "import platform;print(platform.python_version())"') do set "PYVER=%%v"
echo         Python %PYVER% %T_READY%
echo.

rem ---------------------------------------------------------------
echo   [2/4] %T_PKG%
"%PY%" -m pip install -U --disable-pip-version-check --quiet "yt-dlp[default,curl-cffi]" segno faster-whisper
if errorlevel 1 goto :pkg_fail
echo         yt-dlp, segno, faster-whisper %T_READY%
echo.

rem ---------------------------------------------------------------
echo   [3/4] %T_FF_CHECK%
set "FF="
for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\yt-dlp.FFmpeg_*") do set "FF=1"
if not defined FF where ffmpeg >nul 2>&1 && set "FF=1"
if not defined FF goto :install_ffmpeg
echo         %T_FF_FOUND%
goto :ffmpeg_ready

:install_ffmpeg
echo         %T_FF_INSTALL%
call :need_winget || goto :fail
winget install -e --id yt-dlp.FFmpeg --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :ff_fail
echo         ffmpeg %T_READY%

:ffmpeg_ready
echo.

rem ---------------------------------------------------------------
echo   [4/4] %T_BRIDGE%
"%PY%" host\install.py
if errorlevel 1 goto :bridge_fail
<nul set /p "=%CD%" | clip

echo.
echo   ============================================
echo     %T_DONE%
echo   ============================================
echo.
echo   %T_LAST%
echo     1. brave://extensions  (Chrome: chrome://extensions, Edge: edge://extensions)
echo     2. %T_STEP2%
echo     3. %T_STEP3%
echo        %CD%
echo        %T_CLIP%
echo     4. %T_STEP4%
echo.
echo   %T_MOVED%
echo.
pause
exit /b 0

rem ---------------------------------------------------------------
:find_python
for %%C in ("py -3" "python") do if not defined PY for /f "delims=" %%P in ('%%~C -c "import sys;assert sys.version_info>=(3,9);print(sys.executable)" 2^>nul') do set "PY=%%P"
exit /b 0

:need_winget
where winget >nul 2>&1 && exit /b 0
echo   %T_ERR% %T_NO_WINGET%
exit /b 1

:pkg_fail
echo   %T_ERR% %T_PKG_FAIL%
goto :fail

:ff_fail
echo   %T_ERR% %T_FF_FAIL%
goto :fail

:bridge_fail
echo   %T_ERR% %T_BRIDGE_FAIL%
goto :fail

:fail
echo.
echo   %T_ABORTED%
echo.
pause
exit /b 1

rem ---------------------------------------------------------------
:lang_tr
set "ASIL_SETUP_LANG=tr"
set "T_TITLE=asil-downloader kurulum"
set "T_ERR=[HATA]"
set "T_READY=hazır."
set "T_NO_MANIFEST=manifest.json bulunamadı. setup.bat dosyasını proje klasöründen çalıştır."
set "T_PY_CHECK=Python kontrol ediliyor..."
set "T_PY_INSTALL=Python bulunamadı, winget ile kuruluyor..."
set "T_PY_FAIL=Python kurulamadı. python.org'dan kurup tekrar dene, kurarken Add python.exe to PATH kutusunu işaretle."
set "T_PKG=Python paketleri kuruluyor, birkaç dakika sürebilir..."
set "T_PKG_FAIL=Paketler kurulamadı. İnternet bağlantını kontrol edip tekrar dene."
set "T_FF_CHECK=ffmpeg kontrol ediliyor..."
set "T_FF_FOUND=ffmpeg zaten kurulu."
set "T_FF_INSTALL=ffmpeg kuruluyor..."
set "T_FF_FAIL=ffmpeg kurulamadı."
set "T_BRIDGE=Köprü tarayıcılara kaydediliyor..."
set "T_BRIDGE_FAIL=Köprü kaydedilemedi."
set "T_NO_WINGET=winget bulunamadı. Microsoft Store'dan Uygulama Yükleyicisi'ni kur ya da README'deki adımları elle yap."
set "T_DONE=Kurulum tamamlandı"
set "T_LAST=Son adım, eklentiyi tarayıcıya yükle:"
set "T_STEP2=Sağ üstten Geliştirici modu'nu aç"
set "T_STEP3=Paketlenmemiş öğe yükle'ye bas ve bu klasörü seç:"
set "T_CLIP=Klasör yolu panoya kopyalandı, Ctrl+V ile yapıştırabilirsin."
set "T_STEP4=Karttaki ID, yukarıdaki Eklenti ID ile aynı olmalı."
set "T_MOVED=Klasörü taşırsan setup.bat'ı tekrar çalıştır."
set "T_ABORTED=Kurulum yarıda kaldı. Ayrıntılar için README'deki Kurulum bölümüne bak."
exit /b 0

:lang_en
set "ASIL_SETUP_LANG=en"
set "T_TITLE=asil-downloader setup"
set "T_ERR=[ERROR]"
set "T_READY=ready."
set "T_NO_MANIFEST=manifest.json not found. Run setup.bat from the project folder."
set "T_PY_CHECK=Checking Python..."
set "T_PY_INSTALL=Python not found, installing with winget..."
set "T_PY_FAIL=Couldn't install Python. Install it from python.org, tick Add python.exe to PATH, and try again."
set "T_PKG=Installing Python packages, this may take a few minutes..."
set "T_PKG_FAIL=Couldn't install the packages. Check your internet connection and try again."
set "T_FF_CHECK=Checking ffmpeg..."
set "T_FF_FOUND=ffmpeg is already installed."
set "T_FF_INSTALL=Installing ffmpeg..."
set "T_FF_FAIL=Couldn't install ffmpeg."
set "T_BRIDGE=Registering the bridge with your browsers..."
set "T_BRIDGE_FAIL=Couldn't register the bridge."
set "T_NO_WINGET=winget not found. Install App Installer from the Microsoft Store, or follow the manual steps in the README."
set "T_DONE=Setup complete"
set "T_LAST=Last step, load the extension in your browser:"
set "T_STEP2=Turn on Developer mode in the top right"
set "T_STEP3=Click Load unpacked and select this folder:"
set "T_CLIP=The folder path is on your clipboard, paste it with Ctrl+V."
set "T_STEP4=The ID on the card must match the Extension ID above."
set "T_MOVED=If you move the folder, run setup.bat again."
set "T_ABORTED=Setup stopped. See the Installation section in the README for details."
exit /b 0
