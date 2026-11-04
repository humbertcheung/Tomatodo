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
    /// TEAM-ID-prefixed groups work with Developer ID signing (no profile).
    static let appGroup = "HDEN58Z6QL.group.cc.humbert.tomatodo"
    static let widgetBundleID = "cc.humbert.todo-menubar.widget"
    static let fileName = "widget-snapshot.json"
    static let actionsName = "widget-actions.json"

    static var groupContainerURL: URL? {
        FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroup
        )
    }

    /// Every place the snapshot may live, in preference order.
    /// NB: inside the sandbox, NSHomeDirectory() IS this container's Data
    /// folder — the naive absolute path would nest the container inside
    /// itself, which is why the naive lookup found nothing.
    static var snapshotCandidates: [URL] {
        var list: [URL] = []
        if let group = groupContainerURL {
            list.append(group.appendingPathComponent(fileName))
        }
        // the app's data folder — the primary channel for a NON-sandboxed
        // extension (the app keeps writing there)
        list.append(URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent("Library/Application Support/Tomatodo")
            .appendingPathComponent(fileName))
        list.append(URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent("Documents")
            .appendingPathComponent(fileName))
        let home = FileManager.default.homeDirectoryForCurrentUser
        list.append(home
            .appendingPathComponent("Library/Containers/\(widgetBundleID)/Data/Documents")
            .appendingPathComponent(fileName))
        return list
    }

    static func load() -> (snapshot: WidgetSnapshot, found: Bool) {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        for url in snapshotCandidates {
            if let data = try? Data(contentsOf: url),
               let snap = try? decoder.decode(WidgetSnapshot.self, from: data) {
                return (snap, true)
            }
        }
        return (.empty, false)
    }

    /// Where the widget writes its pending actions (the app polls this file).
    /// the pending-actions file in the app's data folder (non-sandboxed read/write)
    static var actionsURL: URL? {
        URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent("Library/Application Support/Tomatodo")
            .appendingPathComponent(actionsName)
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
