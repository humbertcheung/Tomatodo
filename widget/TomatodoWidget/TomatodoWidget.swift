//
//  TomatodoWidget.swift
//  Three desktop widgets for Tomatodo:
//
//   1. 今日待办  — the day list with the pomodoro clock
//   2. 已计划    — everything that has a due date, sorted
//   3. 便签      — the latest notes
//
//  Interactivity:
//   • the check button on each task toggles completion (AppIntent → the app
//     applies it over the localhost data channel)
//   • each row is a Link that deep-links into the app (tomatodo://…)
//

import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Action intent

/// Toggling a task from the widget cannot touch the app's SQLite database
/// directly (the extension is sandboxed), so the intent asks the running app
/// over localhost; the app applies the toggle and the widget re-renders live.
struct ToggleTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "切换待办完成状态"
    static let description = IntentDescription("在 Tomatodo 中切换该待办的完成状态")

    @Parameter(title: "任务 ID") var taskID: String

    init() {}

    init(taskID: String) {
        self.taskID = taskID
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        // the app applies the toggle over localhost and we re-render live
        let ok = await WidgetStore.sendActionAsync(["type": "toggleTask", "id": taskID])
        WidgetCenter.shared.reloadAllTimelines()
        return .result(dialog: IntentDialog(ok ? "已更新 ✓" : "Tomatodo 未运行"))
    }
}

// MARK: - Timeline

struct WidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
    let found: Bool          // was a snapshot file readable at all?
}

struct WidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> WidgetEntry {
        WidgetEntry(date: Date(), snapshot: .empty, found: true)
    }
    func getSnapshot(in context: Context, completion: @escaping (WidgetEntry) -> Void) {
        let (snap, found) = WidgetStore.load()
        completion(WidgetEntry(date: Date(), snapshot: snap, found: found))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WidgetEntry>) -> Void) {
        let (snap, found) = WidgetStore.load()
        // refresh every 5 minutes (or sooner while a pomodoro runs)
        let next = Date().addingTimeInterval(snap.pomodoroRunning ? 60 : 5 * 60)
        completion(Timeline(entries: [WidgetEntry(date: Date(), snapshot: snap, found: found)], policy: .after(next)))
    }
}

// MARK: - Shared visuals

private struct TomatoMark: View {
    var size: CGFloat = 14
    var body: some View {
        ZStack {
            Circle().fill(Color(red: 0.90, green: 0.22, blue: 0.24))
            // the little green calyx
            Path { p in
                p.move(to: CGPoint(x: 0.5, y: 0.02))
                p.addLine(to: CGPoint(x: 0.30, y: 0.26))
                p.addLine(to: CGPoint(x: 0.70, y: 0.26))
                p.closeSubpath()
            }
            .fill(Color(red: 0.24, green: 0.55, blue: 0.31))
        }
        .frame(width: size, height: size)
    }
}

private struct TagChip: View {
    let text: String
    let tint: Color
    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(tint.opacity(0.16), in: Capsule())
    }
}

private func colorFor(_ name: String) -> Color {
    switch name {
    case "green": return Color(red: 0.18, green: 0.62, blue: 0.36)
    case "blue": return Color(red: 0.25, green: 0.43, blue: 0.96)
    case "pink": return Color(red: 0.84, green: 0.32, blue: 0.61)
    case "purple": return Color(red: 0.55, green: 0.33, blue: 0.84)
    case "orange": return Color(red: 0.88, green: 0.49, blue: 0.17)
    default: return Color(red: 0.79, green: 0.59, blue: 0.10)
    }
}

/// the empty state, distinguishing "no data" from "snapshot missing"
@ViewBuilder
private func emptyHint(_ found: Bool, noData: String) -> some View {
    if found {
        Text(noData).font(.system(size: 11)).foregroundStyle(.secondary)
    } else {
        Text("打开 Tomatodo 以同步数据").font(.system(size: 11)).foregroundStyle(.secondary)
    }
}

/// the check button — a real, working AppIntent button
private struct CheckButton: View {
    let taskID: String
    var body: some View {
        Button(intent: ToggleTaskIntent(taskID: taskID)) {
            Circle()
                .strokeBorder(Color.secondary.opacity(0.6), lineWidth: 1.2)
                .frame(width: 12, height: 12)
                .background(Circle().fill(Color.clear))
        }
        .buttonStyle(.plain)
    }
}

/// a task row: tappable through to the matching task in the app
private struct TaskRowLink: View {
    let task: WidgetTask
    var body: some View {
        if let url = URL(string: "tomatodo://task/\(task.id)") {
            Link(destination: url) { rowContent }
        } else {
            rowContent
        }
    }

    private var rowContent: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(task.subject)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
            HStack(spacing: 4) {
                let overdue = WidgetFormat.isOverdue(task.due)
                TagChip(
                    text: WidgetFormat.dueLabel(task.due),
                    tint: overdue ? Color(red: 0.85, green: 0.31, blue: 0.21) : Color(red: 0.88, green: 0.49, blue: 0.17)
                )
                if task.important {
                    TagChip(text: "重要", tint: Color(red: 0.78, green: 0.23, blue: 0.36))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - 1. 今日待办

struct TodayWidgetView: View {
    let entry: WidgetEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                TomatoMark(size: 13)
                Text("今日待办").font(.system(size: 12, weight: .bold))
                Spacer()
                if entry.snapshot.pomodoroRunning || entry.snapshot.pomodoroSeconds > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "timer").font(.system(size: 10))
                        Text(WidgetFormat.clock(entry.snapshot.pomodoroSeconds))
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                    }
                    .foregroundStyle(Color(red: 0.90, green: 0.22, blue: 0.24))
                }
            }

            if entry.snapshot.today.isEmpty {
                emptyHint(entry.found, noData: "今天没有待办 ☀")
                Spacer(minLength: 0)
            } else {
                ForEach(entry.snapshot.today.prefix(family == .systemSmall ? 3 : 6)) { task in
                    HStack(alignment: .top, spacing: 6) {
                        CheckButton(taskID: task.id)
                        TaskRowLink(task: task)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .widgetURL(URL(string: "tomatodo://open"))
    }
}

// MARK: - 2. 已计划

struct PlannedWidgetView: View {
    let entry: WidgetEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                TomatoMark(size: 13)
                Text("已计划").font(.system(size: 12, weight: .bold))
                Spacer()
                Text("\(entry.snapshot.plannedCount)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
            }

            if entry.snapshot.planned.isEmpty {
                emptyHint(entry.found, noData: "还没有计划中的任务")
                Spacer(minLength: 0)
            } else {
                ForEach(entry.snapshot.planned.prefix(family == .systemSmall ? 3 : 6)) { task in
                    HStack(alignment: .top, spacing: 6) {
                        CheckButton(taskID: task.id)
                        TaskRowLink(task: task)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .widgetURL(URL(string: "tomatodo://open"))
    }
}

// MARK: - 3. 便签

private struct NoteRowLink: View {
    let note: WidgetNote
    var body: some View {
        if let url = URL(string: "tomatodo://note/\(note.id)") {
            Link(destination: url) { rowContent }
        } else {
            rowContent
        }
    }

    private var rowContent: some View {
        HStack(alignment: .top, spacing: 6) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(colorFor(note.color))
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 2) {
                Text(note.title.isEmpty ? "未命名" : note.title)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
                if !note.preview.isEmpty {
                    Text(note.preview)
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if note.pinned {
                Image(systemName: "pin.fill").font(.system(size: 9)).foregroundStyle(.orange)
            }
        }
    }
}

struct NotesWidgetView: View {
    let entry: WidgetEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                TomatoMark(size: 13)
                Text("便签").font(.system(size: 12, weight: .bold))
                Spacer()
                Text("\(entry.snapshot.noteCount)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
            }

            if entry.snapshot.notes.isEmpty {
                emptyHint(entry.found, noData: "还没有便签")
                Spacer(minLength: 0)
            } else {
                ForEach(entry.snapshot.notes.prefix(family == .systemSmall ? 3 : 6)) { note in
                    NoteRowLink(note: note)
                }
                Spacer(minLength: 0)
            }
        }
        .widgetURL(URL(string: "tomatodo://open"))
    }
}

// MARK: - Widget declarations

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TomatodoTodayWidget", provider: WidgetProvider()) { entry in
            TodayWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("今日待办")
        .description("今天要完成的待办，附带番茄钟倒计时")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct PlannedWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TomatodoPlannedWidget", provider: WidgetProvider()) { entry in
            PlannedWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("已计划")
        .description("按截止日期排序的计划任务")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct NotesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TomatodoNotesWidget", provider: WidgetProvider()) { entry in
            NotesWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("便签")
        .description("最近的便签")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct TomatodoWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        PlannedWidget()
        NotesWidget()
    }
}
