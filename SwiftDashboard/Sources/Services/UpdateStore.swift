import Foundation
import SwiftUI

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

struct UpdateManifest: Codable, Hashable, Identifiable {
  let channel: String
  let version: String
  let build: Int
  let minimumSystemVersion: String
  let publishedAt: Date
  let downloadURL: URL
  let releaseNotesURL: URL

  var id: String {
    "\(channel)-\(version)-\(build)"
  }

  var versionLabel: String {
    "\(version) (\(build))"
  }
}

enum UpdateCheckState: Equatable {
  case idle
  case checking
  case upToDate
  case updateAvailable
  case error
}

struct AppSemanticVersion: Comparable, Hashable {
  let components: [Int]

  init?(_ rawValue: String) {
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    let parts = trimmed.split(separator: ".", omittingEmptySubsequences: false)
    guard !parts.isEmpty else { return nil }

    var values: [Int] = []
    values.reserveCapacity(parts.count)
    for part in parts {
      guard let value = Int(part) else { return nil }
      values.append(value)
    }
    self.components = values
  }

  static func < (lhs: AppSemanticVersion, rhs: AppSemanticVersion) -> Bool {
    let maxCount = max(lhs.components.count, rhs.components.count)
    for index in 0..<maxCount {
      let left = index < lhs.components.count ? lhs.components[index] : 0
      let right = index < rhs.components.count ? rhs.components[index] : 0
      if left != right {
        return left < right
      }
    }
    return false
  }
}

enum UpdateStoreError: LocalizedError {
  case missingManifestURL
  case invalidHTTPResponse
  case httpStatus(Int)
  case invalidVersion(String)

  var errorDescription: String? {
    switch self {
    case .missingManifestURL:
      return "Update manifest URL is missing."
    case .invalidHTTPResponse:
      return "Update service returned an invalid response."
    case let .httpStatus(code):
      return "Update service returned HTTP \(code)."
    case let .invalidVersion(version):
      return "Invalid update version: \(version)."
    }
  }
}

@MainActor
final class UpdateStore: ObservableObject {
  @Published private(set) var state: UpdateCheckState = .idle
  @Published private(set) var availableUpdate: UpdateManifest?
  @Published var presentedUpdate: UpdateManifest?
  @Published private(set) var lastCheckDate: Date?
  @Published var automaticChecksEnabled: Bool
  @Published private(set) var checkInterval: TimeInterval
  @Published private(set) var lastErrorMessage: String = ""

  private let defaults: UserDefaults
  private let bundle: Bundle
  private let session: URLSession
  private weak var diagnostics: DiagnosticsStore?
  private var didPerformLaunchCheck = false

  private let automaticChecksKey = "swift_notion_dashboard_updates_auto_enabled_v1"
  private let checkIntervalKey = "swift_notion_dashboard_updates_check_interval_v1"
  private let lastCheckDateKey = "swift_notion_dashboard_updates_last_check_v1"
  private let defaultCheckInterval: TimeInterval = 15 * 60
  private let fallbackManifestURL = "https://ludovicstvys.github.io/Notion-Extension/update-dev.json"
  private let fallbackChannel = "dev"

  init(
    diagnostics: DiagnosticsStore?,
    defaults: UserDefaults = .standard,
    bundle: Bundle = .main,
    session: URLSession = .shared
  ) {
    self.defaults = defaults
    self.bundle = bundle
    self.session = session
    self.diagnostics = diagnostics

    let storedAutomaticChecks = defaults.object(forKey: automaticChecksKey) as? Bool
    self.automaticChecksEnabled = storedAutomaticChecks ?? true

    let storedInterval = defaults.object(forKey: checkIntervalKey) as? Double
    self.checkInterval = storedInterval ?? defaultCheckInterval

    self.lastCheckDate = defaults.object(forKey: lastCheckDateKey) as? Date
  }

  var currentVersion: String {
    (bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "0.0.0"
  }

  var currentBuild: Int {
    Int((bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "0") ?? 0
  }

  var channel: String {
    (bundle.object(forInfoDictionaryKey: "UpdateChannel") as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      .nonEmpty ?? fallbackChannel
  }

  var manifestURL: URL? {
    let rawValue = (bundle.object(forInfoDictionaryKey: "UpdateManifestURL") as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      .nonEmpty ?? fallbackManifestURL
    return URL(string: rawValue)
  }

  var currentVersionLabel: String {
    "\(currentVersion) (\(currentBuild))"
  }

  var checkIntervalLabel: String {
    "\(Int(checkInterval / 60)) min"
  }

  var lastCheckLabel: String {
    lastCheckDate?.shortDateTime ?? "Never"
  }

  var statusLabel: String {
    switch state {
    case .idle:
      return "Idle"
    case .checking:
      return "Checking"
    case .upToDate:
      return "Up to date"
    case .updateAvailable:
      return "Update available"
    case .error:
      return "Error"
    }
  }

  var detailMessage: String {
    switch state {
    case .idle:
      return "Checks the latest dev build published on GitHub Pages."
    case .checking:
      return "Looking for a newer published build."
    case .upToDate:
      return "Current build \(currentVersionLabel) is the latest published version."
    case .updateAvailable:
      return availableUpdate.map { "Version \($0.versionLabel) is available for download." } ?? "A newer build is available."
    case .error:
      return lastErrorMessage.isEmpty ? "Unable to check for updates." : lastErrorMessage
    }
  }

  func setAutomaticChecksEnabled(_ enabled: Bool) {
    automaticChecksEnabled = enabled
    defaults.set(enabled, forKey: automaticChecksKey)
  }

  func performLaunchCheckIfNeeded() async {
    guard isSupportedPlatform else { return }
    guard !didPerformLaunchCheck else { return }
    didPerformLaunchCheck = true
    guard automaticChecksEnabled else { return }

    if let lastCheckDate, Date().timeIntervalSince(lastCheckDate) < checkInterval {
      return
    }

    await checkForUpdates(userInitiated: false)
  }

  func checkForUpdates(userInitiated: Bool) async {
    guard isSupportedPlatform else { return }
    guard let manifestURL else {
      let error = UpdateStoreError.missingManifestURL
      diagnostics?.log(severity: .warning, category: "updates", message: error.localizedDescription)
      if userInitiated {
        lastErrorMessage = error.localizedDescription
        state = .error
      }
      return
    }

    if userInitiated {
      state = .checking
      lastErrorMessage = ""
    }

    let request = URLRequest(url: manifestURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)

    do {
      let (data, response) = try await session.data(for: request)
      guard let httpResponse = response as? HTTPURLResponse else {
        throw UpdateStoreError.invalidHTTPResponse
      }
      guard (200..<300).contains(httpResponse.statusCode) else {
        throw UpdateStoreError.httpStatus(httpResponse.statusCode)
      }

      let manifest = try Self.manifestDecoder.decode(UpdateManifest.self, from: data)
      guard AppSemanticVersion(manifest.version) != nil else {
        throw UpdateStoreError.invalidVersion(manifest.version)
      }

      persistLastCheckDate(Date())

      if isManifestNewerThanCurrent(manifest) {
        availableUpdate = manifest
        presentedUpdate = manifest
        state = .updateAvailable
        diagnostics?.log(
          category: "updates",
          message: "Update available.",
          metadata: [
            "version": manifest.version,
            "build": "\(manifest.build)",
            "channel": manifest.channel,
          ]
        )
      } else {
        availableUpdate = nil
        presentedUpdate = nil
        state = .upToDate
        if userInitiated {
          diagnostics?.log(category: "updates", message: "No update available.")
        }
      }
    } catch {
      persistLastCheckDate(Date())
      let message = Self.userFacingMessage(for: error)
      diagnostics?.log(
        severity: .warning,
        category: "updates",
        message: "Update check failed.",
        metadata: ["error": message]
      )
      if userInitiated {
        lastErrorMessage = message
        state = .error
      }
    }
  }

  func dismissUpdate() {
    presentedUpdate = nil
  }

  func openDownloadURL() {
    guard let url = (presentedUpdate ?? availableUpdate)?.downloadURL else { return }
    open(url: url, purpose: "download")
  }

  func openReleaseNotesURL() {
    guard let url = (presentedUpdate ?? availableUpdate)?.releaseNotesURL else { return }
    open(url: url, purpose: "release-notes")
  }

  private func open(url: URL, purpose: String) {
#if os(iOS)
    UIApplication.shared.open(url)
#elseif os(macOS)
    NSWorkspace.shared.open(url)
#endif
    diagnostics?.log(
      category: "updates",
      message: "Opened update URL.",
      metadata: [
        "purpose": purpose,
        "url": url.absoluteString,
      ]
    )
  }

  private func persistLastCheckDate(_ date: Date) {
    lastCheckDate = date
    defaults.set(date, forKey: lastCheckDateKey)
  }

  private func isManifestNewerThanCurrent(_ manifest: UpdateManifest) -> Bool {
    if let remoteVersion = AppSemanticVersion(manifest.version), let localVersion = AppSemanticVersion(currentVersion) {
      if remoteVersion != localVersion {
        return remoteVersion > localVersion
      }
    }
    return manifest.build > currentBuild
  }

  private var isSupportedPlatform: Bool {
#if os(macOS)
    true
#else
    false
#endif
  }

  private static let manifestDecoder: JSONDecoder = {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .custom { decoder in
      let container = try decoder.singleValueContainer()
      let rawValue = try container.decode(String.self)
      if let date = Date.iso8601WithFractionalSeconds.date(from: rawValue) {
        return date
      }
      if let date = Date.fallbackISO8601.date(from: rawValue) {
        return date
      }
      throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid ISO8601 date: \(rawValue)")
    }
    return decoder
  }()

  private static func userFacingMessage(for error: Error) -> String {
    if let updateError = error as? UpdateStoreError {
      return updateError.localizedDescription
    }
    if let decodingError = error as? DecodingError {
      return "Update manifest is invalid: \(decodingError.localizedDescription)"
    }
    return error.localizedDescription
  }
}

private extension String {
  var nonEmpty: String? {
    isEmpty ? nil : self
  }
}
