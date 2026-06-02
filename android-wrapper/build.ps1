# Manual APK Build Script for AntiDelete
$ErrorActionPreference = "Stop"

Write-Host "--- Starting manual APK build ---"

# Set temporary environment variables for compiler path discovery
$CURRENT_DIR = Get-Location
$env:JAVA_HOME = "$CURRENT_DIR\jdk-17.0.19+10"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

# Paths
$SDK_DIR = "C:\Users\USER\AppData\Local\Android\Sdk"
$BUILD_TOOLS_VERSION = "34.0.0"
$PLATFORM = "android-34"

$AAPT2 = "$SDK_DIR\build-tools\$BUILD_TOOLS_VERSION\aapt2.exe"
$D8 = "$SDK_DIR\build-tools\$BUILD_TOOLS_VERSION\d8.bat"
$ZIPALIGN = "$SDK_DIR\build-tools\$BUILD_TOOLS_VERSION\zipalign.exe"
$APKSIGNER = "$SDK_DIR\build-tools\$BUILD_TOOLS_VERSION\apksigner.bat"
$PLATFORM_JAR = "$SDK_DIR\platforms\$PLATFORM\android.jar"
$JAVAC = ".\jdk-17.0.19+10\bin\javac.exe"
$JAR = ".\jdk-17.0.19+10\bin\jar.exe"
$KEYTOOL = ".\jdk-17.0.19+10\bin\keytool.exe"

# 1. Clean previous builds
Write-Host "Cleaning build environment..."
if (Test-Path bin) { Remove-Item bin -Recurse -Force }
if (Test-Path compiled_res.zip) { Remove-Item compiled_res.zip -Force }
if (Test-Path base.apk) { Remove-Item base.apk -Force }
if (Test-Path aligned.apk) { Remove-Item aligned.apk -Force }

# 2. Compile resources
Write-Host "Compiling resources with aapt2..."
& $AAPT2 compile --dir app/src/main/res -o compiled_res.zip

# 3. Link resources and generate base APK
Write-Host "Linking resources and manifest..."
& $AAPT2 link --manifest app/src/main/AndroidManifest.xml -I $PLATFORM_JAR -o base.apk compiled_res.zip --java app/src/main/java --min-sdk-version 21 --target-sdk-version 34

# 4. Compile Java files
Write-Host "Compiling Java files..."
New-Item -ItemType Directory -Path bin -Force
& $JAVAC -d bin -classpath $PLATFORM_JAR -source 1.8 -target 1.8 app/src/main/java/com/antidelete/*.java

# 5. Convert class files to dex
Write-Host "Running d8 to generate classes.dex..."
$classes = Get-ChildItem bin/com/antidelete/*.class | ForEach-Object { "bin/com/antidelete/$($_.Name)" }
$d8Args = @(
    "/c",
    $D8,
    "--lib", $PLATFORM_JAR,
    "--min-api", "21",
    "--release",
    "--output", "bin"
) + $classes
Start-Process cmd.exe -ArgumentList $d8Args -NoNewWindow -Wait

# 6. Add classes.dex to base.apk
Write-Host "Injecting classes.dex into base APK..."
Push-Location bin
$JAR_PATH = "..\jdk-17.0.19+10\bin\jar.exe"
& $JAR_PATH uf ..\base.apk classes.dex
Pop-Location

# 7. ZipAlign APK
Write-Host "Aligning APK..."
& $ZIPALIGN -v -f 4 base.apk aligned.apk

# 8. Generate keystore if not exists
if (-not (Test-Path my-release-key.jks)) {
    Write-Host "Generating self-signed release key..."
    & $KEYTOOL -genkeypair -validity 10000 -dname "CN=AntiDelete,O=AntiDelete,C=US" -keystore my-release-key.jks -storepass password -keypass password -alias my-key-alias -keyalg RSA -keysize 2048
}

# 9. Sign APK
Write-Host "Signing APK with apksigner..."
$signerArgs = @(
    "/c",
    $APKSIGNER,
    "sign",
    "--ks", "my-release-key.jks",
    "--ks-key-alias", "my-key-alias",
    "--ks-pass", "pass:password",
    "--key-pass", "pass:password",
    "--out", "antidelete.apk",
    "aligned.apk"
)
Start-Process cmd.exe -ArgumentList $signerArgs -NoNewWindow -Wait

# 10. Verify signature
Write-Host "Verifying signature..."
$verifyArgs = @(
    "/c",
    $APKSIGNER,
    "verify",
    "antidelete.apk"
)
Start-Process cmd.exe -ArgumentList $verifyArgs -NoNewWindow -Wait

# Check result size
if (Test-Path antidelete.apk) {
    $size = (Get-Item antidelete.apk).Length
    $sizeKb = [Math]::Round($size / 1024, 2)
    Write-Host "APK Compiled Successfully! Output file: antidelete.apk" -ForegroundColor Green
    Write-Host "Final APK size: $sizeKb KB" -ForegroundColor Green
} else {
    Write-Error "Failed to build APK."
}
