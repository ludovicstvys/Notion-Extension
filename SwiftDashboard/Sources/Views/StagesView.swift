import SwiftUI
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

private enum StageDisplayMode: String, CaseIterable, Identifiable {
  case kanban = "Kanban"
  case list = "List"

  var id: String { rawValue }
}

struct StagesView: View {
  @EnvironmentObject private var stageStore: StageStore
  @EnvironmentObject private var configStore: ConfigStore
  @EnvironmentObject private var diagnosticsStore: DiagnosticsStore
  @State private var displayMode: StageDisplayMode = .kanban
  @State private var searchText: String = ""
  @State private var showAddSheet: Bool = false
  @State private var showImportSheet: Bool = false
  @State private var importPrefillURL: String = ""
  @State private var autoPromptDone: Bool = false

  var body: some View {
    NavigationStack {
      Group {
        if displayMode == .kanban {
          kanbanBoard
        } else {
          listView
        }
      }
      .searchable(text: $searchText, placement: .automatic)
      .background(
        LinearGradient(
          colors: [
            Color(red: 0.06, green: 0.10, blue: 0.18),
            Color(red: 0.03, green: 0.07, blue: 0.14),
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
      )
      .navigationTitle("Stages")
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          HStack(spacing: 8) {
            Button {
              showImportSheet = true
            } label: {
              Label("Import URL", systemImage: "square.and.arrow.down")
            }

            Button {
              showAddSheet = true
            } label: {
              Label("Add stage", systemImage: "plus.circle.fill")
            }
          }
        }

        ToolbarItem(placement: .automatic) {
          Picker("Mode", selection: $displayMode) {
            ForEach(StageDisplayMode.allCases) { mode in
              Text(mode.rawValue).tag(mode)
            }
          }
          .pickerStyle(.segmented)
          .frame(minWidth: 180)
        }

        ToolbarItem(placement: .automatic) {
          Button {
            Task { await stageStore.syncFromNotion() }
          } label: {
            if stageStore.isSyncingNotion {
              ProgressView()
            } else {
              Label("Sync Notion", systemImage: "arrow.triangle.2.circlepath")
            }
          }
        }
      }
      .sheet(isPresented: $showAddSheet) {
        AddStageSheet { draft in
          Task {
            await stageStore.addStage(draft: draft)
          }
        }
      }
      .sheet(isPresented: $showImportSheet) {
        PipelineImportSheet(initialURL: importPrefillURL) { preview in
          let draft = StageDraft(
            title: preview.title,
            company: preview.company,
            url: preview.url,
            location: preview.location,
            status: .open,
            deadline: preview.deadline,
            notes: preview.description,
            source: preview.source
          )
          Task {
            await stageStore.addStage(draft: draft)
          }
        }
      }
      .safeAreaInset(edge: .bottom) {
        if !stageStore.syncMessage.isEmpty {
          Text(stageStore.syncMessage)
            .font(.caption)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.black.opacity(0.30))
        }
      }
    }
    .onAppear {
      Task {
        guard configStore.config.pipelineAutoImportEnabled else { return }
        guard !autoPromptDone else { return }
        if let candidate = readClipboardURL(), PipelineImportService().canImport(urlString: candidate) {
          autoPromptDone = true
          importPrefillURL = candidate
          showImportSheet = true
          diagnosticsStore.log(
            category: "pipeline",
            message: "Auto pipeline prompt opened from clipboard.",
            metadata: ["url": candidate]
          )
        } else if let candidate = readClipboardURL() {
          diagnosticsStore.log(
            category: "pipeline",
            message: "Clipboard URL not supported for pipeline auto-import.",
            metadata: ["url": candidate]
          )
        }
      }
    }
  }

  private var filteredStages: [Stage] {
    let query = searchText.normalizedToken
    guard !query.isEmpty else { return stageStore.stages }
    return stageStore.stages.filter { stage in
      [
        stage.title,
        stage.company,
        stage.status.rawValue,
        stage.location,
        stage.url,
      ]
      .joined(separator: " ")
      .normalizedToken
      .contains(query)
    }
  }

  private var listView: some View {
    List {
      ForEach(filteredStages) { stage in
        StageCardView(
          stage: stage,
          limitExceeded: false,
          onStatusChange: { newStatus in
            Task { await stageStore.updateStageStatus(stageID: stage.id, to: newStatus) }
          },
          onDelete: {
            stageStore.deleteStage(stageID: stage.id)
          }
        )
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
      }
    }
    .scrollContentBackground(.hidden)
    .listStyle(.plain)
  }

  private var kanbanBoard: some View {
    ScrollView(.horizontal) {
      HStack(alignment: .top, spacing: 14) {
        ForEach(StageStatus.allCases) { status in
          let items = filteredStages.filter { $0.status == status }
          let limit = configStore.config.wipLimit(for: status)
          VStack(alignment: .leading, spacing: 10) {
            HStack {
              Text(status.rawValue)
                .font(.headline)
              Spacer(minLength: 8)
              Text("\(items.count)/\(limit)")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(items.count > limit ? Color.red.opacity(0.25) : Color.white.opacity(0.12))
                .clipShape(Capsule())
            }

            if items.isEmpty {
              Text("No stage")
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, minHeight: 60)
            } else {
              VStack(spacing: 10) {
                ForEach(items) { stage in
                  StageCardView(
                    stage: stage,
                    limitExceeded: items.count > limit,
                    onStatusChange: { newStatus in
                      Task { await stageStore.updateStageStatus(stageID: stage.id, to: newStatus) }
                    },
                    onDelete: {
                      stageStore.deleteStage(stageID: stage.id)
                    }
                  )
                }
              }
            }
          }
          .padding(12)
          .frame(width: 310, alignment: .top)
          .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
              .fill(Color.white.opacity(0.08))
          )
          .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
              .stroke(Color.white.opacity(0.15), lineWidth: 1)
          )
        }
      }
      .padding(16)
    }
  }
}

struct PipelineImportSheet: View {
  @Environment(\.dismiss) private var dismiss
  @EnvironmentObject private var diagnosticsStore: DiagnosticsStore
  let initialURL: String
  let onImport: (PipelineImportPreview) -> Void
  @State private var urlText: String = ""
  @State private var preview: PipelineImportPreview?
  @State private var isLoading = false
  @State private var statusMessage: String = ""
  private let service = PipelineImportService()

  var body: some View {
    NavigationStack {
      Form {
        Section("Source URL") {
          TextField("https://www.linkedin.com/jobs/view/...", text: $urlText)
            .plainTextInputBehavior()
          HStack {
            Button("Load preview") {
              Task { await fetchPreview() }
            }
            .buttonStyle(.borderedProminent)
            .tint(.teal)
            .disabled(isLoading || urlText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

            if isLoading {
              ProgressView()
            }
          }
          if !statusMessage.isEmpty {
            Text(statusMessage)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }

        if let preview {
          Section("Preview") {
            Text("Title: \(preview.title)")
            Text("Company: \(preview.company)")
            if !preview.location.isEmpty {
              Text("Location: \(preview.location)")
            }
            if let deadline = preview.deadline {
              Text("Deadline: \(deadline.shortDate)")
            }
            Text("Source: \(preview.source)")
            Text("URL: \(preview.url)")
              .font(.caption)
              .foregroundStyle(.secondary)
              .textSelection(.enabled)
          }
        }
      }
      .navigationTitle("Pipeline import")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Import") {
            guard let preview else { return }
            onImport(preview)
            dismiss()
          }
          .disabled(preview == nil)
        }
      }
    }
    .frame(minWidth: 520, minHeight: 420)
    .onAppear {
      if urlText.isEmpty && !initialURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        urlText = initialURL
      }
    }
  }

  private func fetchPreview() async {
    isLoading = true
    defer { isLoading = false }
    do {
      let loaded = try await service.importFromURL(urlText)
      preview = loaded
      statusMessage = "Preview loaded."
      diagnosticsStore.log(
        category: "pipeline",
        message: "Pipeline preview loaded.",
        metadata: ["url": loaded.url, "source": loaded.source]
      )
    } catch {
      preview = nil
      statusMessage = error.localizedDescription
      diagnosticsStore.log(
        severity: .warning,
        category: "pipeline",
        message: "Pipeline preview failed.",
        metadata: ["url": urlText, "error": error.localizedDescription]
      )
    }
  }
}

private func readClipboardURL() -> String? {
#if os(iOS)
  return UIPasteboard.general.url?.absoluteString ?? UIPasteboard.general.string
#elseif os(macOS)
  let pb = NSPasteboard.general
  return pb.string(forType: .string)
#else
  return nil
#endif
}

struct AddStageSheet: View {
  @Environment(\.dismiss) private var dismiss
  @State private var draft = StageDraft()
  @State private var hasDeadline = false
  let onSave: (StageDraft) -> Void

  var body: some View {
    NavigationStack {
      Form {
        Section("Stage") {
          TextField("Title", text: $draft.title)
          TextField("Company", text: $draft.company)
          TextField("URL", text: $draft.url)
          TextField("Location", text: $draft.location)
          Picker("Status", selection: $draft.status) {
            ForEach(StageStatus.allCases) { status in
              Text(status.rawValue).tag(status)
            }
          }
        }

        Section("Deadline") {
          Toggle("Has deadline", isOn: $hasDeadline.animation())
          if hasDeadline {
            DatePicker(
              "Deadline",
              selection: Binding<Date>(
                get: { draft.deadline ?? Date().addingDays(3) },
                set: { draft.deadline = $0 }
              ),
              displayedComponents: .date
            )
          }
        }

        Section("Notes") {
          TextField("Source (manual/linkedin/jobteaser...)", text: $draft.source)
          TextField("Notes", text: $draft.notes, axis: .vertical)
            .lineLimit(3...8)
        }
      }
      .navigationTitle("New stage")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") {
            if !hasDeadline {
              draft.deadline = nil
            }
            onSave(draft)
            dismiss()
          }
          .disabled(draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
      }
    }
    .frame(minWidth: 500, minHeight: 460)
  }
}
