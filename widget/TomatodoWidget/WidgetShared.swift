//
//  WidgetShared.swift
//  The data contract between the Tomatodo app and its WidgetKit extension.
//
//  The app writes a small JSON snapshot into the App Group container; the
//  widget reads it and renders it. A JSON snapshot keeps the extension free
//  of a SQLite dependency (and of any file locking issues with the app).
//

import Foundation

// MARK: - Model

struct WidgetTask: Codable, Identifiable {
    let id: String
    let subject: String
    let due: String?          // YYYY-MM-DD
    let important: Bool
    let done: Bool
    let color: String
}

struct WidgetNote: Codable, Identifiable {
    let id: String
    let title: String
    let preview: String
    let color: String
    let pinned: Bool
    let updated: String        // YYYY-MM-DD
}

struct WidgetSnapshot: Codable {
    var generatedAt: Date = Date()
    var todayCount: Int = 0
    var plannedCount: Int = 0
    var noteCount: Int = 0
    var pomodoroSeconds: Int = 0
    var pomodoroRunning: Bool = false
    var today: [WidgetTask] = []
    var planned: [WidgetTask] = []
    var notes: [WidgetNote] = []

    static let empty = WidgetSnapshot()
}

// MARK: - Store

enum WidgetStore {
    /// App Group used by both the app and the widget.
    static let appGroup = "group.com.humbert.tomatodo"
    static let fileName = "widget-snapshot.json"

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }

    static var snapshotURL: URL? {
        containerURL?.appendingPathComponent(fileName)
    }

    /// The extension is sandboxed: it may only read its own container.
    /// The app writes the snapshot into that container's Documents folder.
    static var containerSnapshotURL: URL? {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return home
            .appendingPathComponent("Library/Containers/cc.humbert.todo-menubar.widget/Data/Documents")
            .appendingPathComponent(fileName)
    }

    /// Fallback: the app's data folder (used when the extension is not sandboxed).
    static var sharedSnapshotURL: URL? {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return home
            .appendingPathComponent("Library/Application Support/Tomatodo")
            .appendingPathComponent(fileName)
    }

    /// Read the snapshot written by the app.
    static func load() -> WidgetSnapshot {
        // App Group → the sandbox container → the shared data folder
        let url = snapshotURL ?? containerSnapshotURL ?? sharedSnapshotURL
        guard let url, let data = try? Data(contentsOf: url) else { return .empty }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode(WidgetSnapshot.self, from: data)) ?? .empty
    }
}

// MARK: - Formatting helpers

enum WidgetFormat {
    /// "今天" / "明天" / "逾期" / "11月5日"
    static func dueLabel(_ iso: String?, today: Date = Date()) -> String {
        guard let iso, !iso.isEmpty else { return "无日期" }
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return iso }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        guard let due = cal.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return iso }
        let comps = cal.dateComponents([.day], from: cal.startOfDay(for: today), to: cal.startOfDay(for: due))
        let diff = comps.day ?? 0
        if diff == 0 { return "今天" }
        if diff == 1 { return "明天" }
        if diff < 0 { return "逾期" }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "zh_CN")
        fmt.dateFormat = "M月d日"
        return fmt.string(from: due)
    }

    static func isOverdue(_ iso: String?, today: Date = Date()) -> Bool {
        guard let iso, !iso.isEmpty else { return false }
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return false }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        guard let due = cal.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return false }
        return due < cal.startOfDay(for: today)
    }

    /// "25:00" style clock
    static func clock(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%02d:%02d", m, s)
    }
}
