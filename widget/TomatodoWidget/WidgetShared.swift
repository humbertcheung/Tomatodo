//
//  WidgetShared.swift
//  The data contract between the Tomatodo app and its WidgetKit extension.
//
//  The extension is SANDBOXED (the widget gallery requires it), so the data
//  flows over a localhost HTTP server the app runs:
//
//    GET http://127.0.0.1:<port>/snapshot                    → live snapshot JSON
//    GET http://127.0.0.1:<port>/action?type=…&id=…          → applies an action
//
//  The extension is entitled with com.apple.security.network.client, which
//  covers loopback connections. The app binds the first free port of a small
//  candidate range; the extension tries them all and remembers the winner.
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
    var generatedAt: Date?
    var lang: String = "zh"
    var todayCount: Int = 0
    var plannedCount: Int = 0
    var noteCount: Int = 0
    var pomodoroSeconds: Int = 0
    var pomodoroRunning: Bool = false
    /// the timer was started (running, paused, or part-way through)
    var pomodoroActive: Bool = false
    /// "work" | "break"
    var pomodoroMode: String = "work"
    var pomodoroTotalMs: Double = 0
    var pomodoroElapsedPct: Int = 0
    var pomodoroSessions: Int = 0
    var today: [WidgetTask] = []
    var planned: [WidgetTask] = []
    var notes: [WidgetNote] = []

    static let empty = WidgetSnapshot()
}

// MARK: - Server

enum WidgetServer {
    static let ports: [Int] = [47610, 47611, 47612, 47613, 47614, 47615]
    /// the port that answered last — tried first on subsequent calls
    static var knownPort: Int?

    /// the known-good port goes first, then the full list
    static func orderedPorts() -> [Int] {
        var order = ports
        if let knownPort, let i = ports.firstIndex(of: knownPort) {
            order.remove(at: i)
            order.insert(knownPort, at: 0)
        }
        return order
    }

    /// fetch a path from the app's localhost server (short timeout per port)
    static func fetch(path: String, timeout: TimeInterval = 2) -> Data? {
        for port in orderedPorts() {
            guard let url = URL(string: "http://127.0.0.1:\(port)\(path)") else { continue }
            let sem = DispatchSemaphore(value: 0)
            var payload: Data?
            var done = false
            var req = URLRequest(url: url)
            req.timeoutInterval = timeout
            let task = URLSession.shared.dataTask(with: req) { data, response, _ in
                if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                    payload = data
                }
                done = true
                sem.signal()
            }
            task.resume()
            // hard cap so a hung connection can never stall a timeline refresh
            _ = sem.wait(timeout: .now() + timeout + 1)
            if !done { task.cancel() }
            if let payload {
                knownPort = port
                return payload
            }
        }
        return nil
    }

    /// async variant — used by the AppIntent, so the cooperative thread is
    /// never blocked while the app answers.
    static func fetchAsync(path: String, timeout: TimeInterval = 3) async -> Data? {
        for port in orderedPorts() {
            guard let url = URL(string: "http://127.0.0.1:\(port)\(path)") else { continue }
            var req = URLRequest(url: url)
            req.timeoutInterval = timeout
            do {
                let (data, response) = try await URLSession.shared.data(for: req)
                if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                    knownPort = port
                    return data
                }
            } catch {
                continue
            }
        }
        return nil
    }
}

// MARK: - Store

enum WidgetStore {
    /// Read the live snapshot from the app.
    static func load() -> (snapshot: WidgetSnapshot, found: Bool) {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            // tolerate both plain ISO8601 and ISO8601 with fractional seconds
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            let plain = ISO8601DateFormatter()
            if let date = plain.date(from: raw) { return date }
            let frac = ISO8601DateFormatter()
            frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = frac.date(from: raw) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "bad date")
        }
        guard let data = WidgetServer.fetch(path: "/snapshot"),
              let snap = try? decoder.decode(WidgetSnapshot.self, from: data) else {
            return (.empty, false)
        }
        return (snap, true)
    }

    /// Queue an action with the app (returns true when the app accepted it).
    @discardableResult
    static func sendAction(_ action: [String: String]) -> Bool {
        guard let data = WidgetServer.fetch(path: "/action?\(query(action))", timeout: 3) else {
            return false
        }
        return String(data: data, encoding: .utf8)?.contains("\"ok\":true") == true
    }

    /// async variant of `sendAction`
    @discardableResult
    static func sendActionAsync(_ action: [String: String]) async -> Bool {
        guard let data = await WidgetServer.fetchAsync(path: "/action?\(query(action))", timeout: 3) else {
            return false
        }
        return String(data: data, encoding: .utf8)?.contains("\"ok\":true") == true
    }

    /// build a percent-encoded query string (stable order)
    private static func query(_ action: [String: String]) -> String {
        var parts: [String] = []
        for (k, v) in action.sorted(by: { $0.key < $1.key }) {
            let allowed = CharacterSet.alphanumerics
            let encoded = v.addingPercentEncoding(withAllowedCharacters: allowed) ?? v
            parts.append("\(k)=\(encoded)")
        }
        return parts.joined(separator: "&")
    }
}

// MARK: - Formatting helpers

enum WidgetFormat {
    /// "今天" / "明天" / "逾期" / "11月5日"
    static func dueLabel(_ iso: String?, today: Date = Date(), lang: String = "zh") -> String {
        let en = lang == "en"
        guard let iso, !iso.isEmpty else { return en ? "No date" : "无日期" }
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return iso }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        guard let due = cal.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return iso }
        let comps = cal.dateComponents([.day], from: cal.startOfDay(for: today), to: cal.startOfDay(for: due))
        let diff = comps.day ?? 0
        if diff == 0 { return en ? "Today" : "今天" }
        if diff == 1 { return en ? "Tomorrow" : "明天" }
        if diff < 0 { return en ? "Overdue" : "逾期" }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: en ? "en_US" : "zh_CN")
        fmt.dateFormat = en ? "MMM d" : "M月d日"
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

    /// "25:00" style clock — never wraps, never truncates
    static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        let h = s / 3600
        let m = (s % 3600) / 60
        let sec = s % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, sec) }
        return String(format: "%02d:%02d", m, sec)
    }
}
