import Foundation
import SwiftUI

@MainActor
final class MarketNewsStore: ObservableObject {
  @Published private(set) var news: [NewsItem] = []
  @Published private(set) var quotes: [MarketQuote] = []
  @Published var isLoadingNews: Bool = false
  @Published var isLoadingQuotes: Bool = false
  @Published var statusMessage: String = ""

  private let newsService: NewsService
  private let marketService: MarketService
  private weak var configStore: ConfigStore?
  private weak var diagnostics: DiagnosticsStore?

  init(
    configStore: ConfigStore,
    diagnostics: DiagnosticsStore?,
    newsService: NewsService = NewsService(),
    marketService: MarketService = MarketService()
  ) {
    self.configStore = configStore
    self.diagnostics = diagnostics
    self.newsService = newsService
    self.marketService = marketService
  }

  func refreshAll() async {
    await refreshNews()
    await refreshQuotes()
  }

  func refreshNews() async {
    guard configStore?.config.newsEnabled != false else {
      news = []
      return
    }
    isLoadingNews = true
    defer { isLoadingNews = false }
    do {
      let loaded = try await newsService.fetchTopNews(limit: 20)
      news = loaded
      diagnostics?.log(category: "news", message: "News refreshed.", metadata: ["count": "\(loaded.count)"])
    } catch {
      statusMessage = "News refresh failed: \(error.localizedDescription)"
      diagnostics?.log(
        severity: .warning,
        category: "news",
        message: statusMessage
      )
    }
  }

  func refreshQuotes() async {
    guard let configStore else { return }
    guard configStore.config.marketsEnabled else {
      quotes = []
      return
    }
    isLoadingQuotes = true
    defer { isLoadingQuotes = false }
    do {
      let loaded = try await marketService.fetchQuotes(symbols: configStore.config.marketSymbols)
      quotes = loaded
      diagnostics?.log(category: "markets", message: "Quotes refreshed.", metadata: ["count": "\(loaded.count)"])
    } catch {
      statusMessage = "Quotes refresh failed: \(error.localizedDescription)"
      diagnostics?.log(
        severity: .warning,
        category: "markets",
        message: statusMessage
      )
    }
  }
}
