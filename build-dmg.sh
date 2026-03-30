#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SWIFT_DIR="${ROOT_DIR}/SwiftDashboard"
PROJECT_SPEC="${SWIFT_DIR}/project.yml"
PROJECT_PATH="${SWIFT_DIR}/NotionDashboardSwift.xcodeproj"
APP_SCHEME="NotionDashboard-macOS"
APP_PRODUCT_NAME="${APP_PRODUCT_NAME:-Dashboard}"
APP_NAME="${APP_PRODUCT_NAME}.app"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-/tmp/NotionDashboardDerivedData}"
DMG_PATH="${ROOT_DIR}/NotionDashboard.dmg"
VOLUME_NAME="${DMG_VOLUME_NAME:-Dashboard}"
TOOLS_DIR="${ROOT_DIR}/.tools"
XCODEGEN_CACHE_BIN="${TOOLS_DIR}/bin/xcodegen"
XCODEGEN_SCRATCH_PATH="${XCODEGEN_SCRATCH_PATH:-/tmp/NotionDashboardXcodeGenBuild}"
STAGING_DIR="$(mktemp -d /tmp/notion-dashboard-dmg.XXXXXX)"
BUILD_LOG="$(mktemp /tmp/notion-dashboard-build.XXXXXX.log)"
XCODEBUILD_OVERRIDES=()

if [[ -n "${MARKETING_VERSION_OVERRIDE:-}" ]]; then
  XCODEBUILD_OVERRIDES+=("MARKETING_VERSION=${MARKETING_VERSION_OVERRIDE}")
fi

if [[ -n "${CURRENT_PROJECT_VERSION_OVERRIDE:-}" ]]; then
  XCODEBUILD_OVERRIDES+=("CURRENT_PROJECT_VERSION=${CURRENT_PROJECT_VERSION_OVERRIDE}")
fi

cleanup() {
  rm -rf "${STAGING_DIR}"
  rm -f "${BUILD_LOG}"
}
trap cleanup EXIT

log() {
  printf '[build-dmg] %s\n' "$1" >&2
}

ensure_xcodegen() {
  if [[ -n "${XCODEGEN_BIN:-}" ]]; then
    if [[ ! -x "${XCODEGEN_BIN}" ]]; then
      echo "Configured XCODEGEN_BIN is not executable: ${XCODEGEN_BIN}" >&2
      exit 1
    fi
    printf '%s\n' "${XCODEGEN_BIN}"
    return
  fi

  if command -v xcodegen >/dev/null 2>&1; then
    command -v xcodegen
    return
  fi

  if [[ -x "${XCODEGEN_CACHE_BIN}" ]]; then
    printf '%s\n' "${XCODEGEN_CACHE_BIN}"
    return
  fi

  local repo_dir="${TOOLS_DIR}/XcodeGen"
  mkdir -p "${TOOLS_DIR}/bin"

  if [[ ! -d "${repo_dir}/.git" ]]; then
    log "xcodegen not found, cloning XcodeGen"
    git clone --depth 1 https://github.com/yonaskolb/XcodeGen.git "${repo_dir}" >/dev/null
  fi

  log "building local xcodegen binary"
  (
    cd "${repo_dir}"
    swift build -c release --product xcodegen --scratch-path "${XCODEGEN_SCRATCH_PATH}" >/dev/null
  )
  local built_bin
  built_bin="$(find "${XCODEGEN_SCRATCH_PATH}" -type f -path '*/release/xcodegen' | head -n 1)"
  if [[ -z "${built_bin}" ]]; then
    echo "Unable to locate built xcodegen binary in ${XCODEGEN_SCRATCH_PATH}" >&2
    exit 1
  fi

  cp "${built_bin}" "${XCODEGEN_CACHE_BIN}"
  chmod +x "${XCODEGEN_CACHE_BIN}"
  printf '%s\n' "${XCODEGEN_CACHE_BIN}"
}

XCODEGEN="$(ensure_xcodegen)"

log "generating Xcode project"
cd "${SWIFT_DIR}"
"${XCODEGEN}" generate --spec "${PROJECT_SPEC}" >/dev/null

log "building macOS release app"
if ! xcodebuild \
  -project "${PROJECT_PATH}" \
  -scheme "${APP_SCHEME}" \
  -destination "platform=macOS,arch=arm64" \
  -configuration Release \
  -sdk macosx \
  -derivedDataPath "${DERIVED_DATA_PATH}" \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO \
  "${XCODEBUILD_OVERRIDES[@]}" \
  clean build >"${BUILD_LOG}" 2>&1; then
  cat "${BUILD_LOG}" >&2
  exit 1
fi

APP_PATH="${DERIVED_DATA_PATH}/Build/Products/Release/${APP_NAME}"
if [[ ! -d "${APP_PATH}" ]]; then
  echo "Built app not found: ${APP_PATH}" >&2
  exit 1
fi

cd "${ROOT_DIR}"
log "exporting connection snapshot"
./packaging/generate-connections-from-extension.sh

log "staging DMG contents"
mkdir -p "${STAGING_DIR}/Connections" "${STAGING_DIR}/Chrome-Extension"
cp -R "${APP_PATH}" "${STAGING_DIR}/"
cp "${ROOT_DIR}/packaging/INSTALLATION.txt" "${STAGING_DIR}/"
cp "${ROOT_DIR}/packaging/connections-config.template.txt" "${STAGING_DIR}/Connections/"
cp "${ROOT_DIR}/packaging/connections-config.extension.txt" "${STAGING_DIR}/Connections/"
rsync -a \
  --exclude '.git/' \
  --exclude '.tools/' \
  --exclude 'SwiftDashboard/' \
  --exclude 'packaging/' \
  --exclude 'build-dmg.sh' \
  --exclude 'NotionDashboard.dmg' \
  --exclude '.DS_Store' \
  --exclude '.gitattributes' \
  ./ "${STAGING_DIR}/Chrome-Extension/"
ln -s /Applications "${STAGING_DIR}/Applications"

log "creating DMG"
hdiutil create \
  -volname "${VOLUME_NAME}" \
  -srcfolder "${STAGING_DIR}" \
  -ov \
  -format UDZO \
  "${DMG_PATH}" >/dev/null

log "done: ${DMG_PATH}"
