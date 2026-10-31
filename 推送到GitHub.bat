@echo off
setlocal
cd /d "%~dp0"

set "PROXY=http://127.0.0.1:18888"
set "RUNNING="

rem 检查本地推送代理是否已在运行
for /f "tokens=*" %%i in ('netstat -ano ^| findstr /c:"127.0.0.1:18888" ^| findstr /i "LISTENING"') do set "RUNNING=1"

if defined RUNNING (
    echo [1/3] 推送代理已在运行
) else (
    echo [1/3] 启动本地推送代理...
    start "github-push-proxy" /min node "%~dp0scripts\github-push-proxy.mjs"
    timeout /t 3 /nobreak >nul
)

echo [2/3] 推送到 GitHub ...
git -c http.proxy=%PROXY% -c https.proxy=%PROXY% -c credential.helper=manager push -u origin main
if errorlevel 1 (
    echo.
    echo [失败] 网络不稳定，连续重试经常能成功，请再运行一次本脚本。
    echo        若一直失败，先启动 Steam++（瓦特工具箱）并开启 GitHub 加速。
    pause
    exit /b 1
)

echo [3/3] 推送完成，最新提交：
git log --oneline -1
echo.
echo 仓库地址：https://github.com/hjiancheng/xueshengxinxiguanlixitong
pause
