//
//  TomatodoWidget.swift
//  Three desktop widgets for Tomatodo:
//
//   1. 今日待办  — the day list + the tomato card
//   2. 已计划    — everything that has a due date, sorted
//   3. 便签      — the latest notes
//
//  The visual language follows the app's 极简模式 (minimal focus mode) tomato
//  card: a red tomato with the countdown inside, a 专注/休息 chip, the phase
//  progress bar and the "今日 N 个番茄" counter.
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
    let found: Bool          // did the app answer at all?
    let lang: String         // "zh" | "en"
}

struct WidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> WidgetEntry {
        WidgetEntry(date: Date(), snapshot: .empty, found: true, lang: "zh")
    }
    func getSnapshot(in context: Context, completion: @escaping (WidgetEntry) -> Void) {
        let (snap, found) = WidgetStore.load()
        completion(WidgetEntry(date: Date(), snapshot: snap, found: found, lang: snap.lang))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WidgetEntry>) -> Void) {
        let (snap, found) = WidgetStore.load()
        // refresh every minute while a pomodoro runs, otherwise every 5 minutes
        let next = Date().addingTimeInterval(snap.pomodoroRunning ? 60 : 5 * 60)
        completion(Timeline(entries: [WidgetEntry(date: Date(), snapshot: snap, found: found, lang: snap.lang)], policy: .after(next)))
    }
}

// MARK: - Palette

enum TomatoPalette {
    static let red = Color(red: 0.898, green: 0.282, blue: 0.302)    // #e5484d
    static let redDeep = Color(red: 0.780, green: 0.227, blue: 0.208) // #c73a35
    static let green = Color(red: 0.247, green: 0.682, blue: 0.353)   // #3fae5a
    static let greenDeep = Color(red: 0.180, green: 0.541, blue: 0.271) // #2e8a47
    static let leaf = Color(red: 0.184, green: 0.541, blue: 0.271)    // #2f8a45
    static let warm = Color(red: 0.541, green: 0.416, blue: 0.400)    // #8a6a66
}

// MARK: - Shared shapes

/// The five-pointed calyx of the app's logo.
private struct LeafShape: Shape {
    var innerRatio: CGFloat = 0.48
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let n = 5
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let R = min(rect.width, rect.height) / 2
        for i in 0..<(n * 2) {
            let r = (i % 2 == 0) ? R : R * innerRatio
            let a = CGFloat(i) * .pi / CGFloat(n) - .pi / 2
            let pt = CGPoint(x: c.x + r * cos(a), y: c.y + r * sin(a))
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        p.closeSubpath()
        return p
    }
}

/// The small logo mark used in the widget headers.
private struct TomatoGlyph: View {
    var size: CGFloat = 13
    var body: some View {
        // NOTE: a plain ZStack (centred) — `alignment: .top` would push the
        // circle to the top and the leaf far above it, into the header row
        ZStack {
            Circle()
                .fill(TomatoPalette.red)
                .frame(width: size, height: size)
            LeafShape()
                .fill(TomatoPalette.leaf)
                .frame(width: size * 0.60, height: size * 0.60)
                .offset(y: -size * 0.30)
        }
        .frame(width: size, height: size * 1.15)
    }
}

/// The tomato card's clock — the countdown lives INSIDE the tomato, exactly
/// like the app's minimal focus mode.
private struct TomatoClock: View {
    let seconds: Int
    let mode: String
    var size: CGFloat = 50

    private var body_Color: Color { mode == "break" ? TomatoPalette.green : TomatoPalette.red }

    var body: some View {
        ZStack {
            Circle()
                .fill(body_Color)
                .frame(width: size, height: size)
            LeafShape()
                .fill(TomatoPalette.leaf)
                .frame(width: size * 0.52, height: size * 0.52)
                .offset(y: -size * 0.30)
            Text(WidgetFormat.clock(seconds))
                .font(.system(size: size * 0.22, weight: .heavy, design: .monospaced))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .fixedSize()
                .offset(y: size * 0.08)
        }
        .frame(width: size, height: size)
        .shadow(color: body_Color.opacity(0.25), radius: 4, y: 2)
    }
}

/// The 专注 / 休息 pill.
private struct ModeChip: View {
    let mode: String
    let running: Bool
    let lang: String

    private var isBreak: Bool { mode == "break" }
    private var label: String {
        let text = isBreak ? (lang == "en" ? "Break" : "休息") : (lang == "en" ? "Focus" : "专注")
        return running ? "● " + text : text
    }

    var body: some View {
        Text(label)
            .font(.system(size: 11, weight: .bold))
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(isBreak ? TomatoPalette.greenDeep : TomatoPalette.redDeep)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                (isBreak ? TomatoPalette.green : TomatoPalette.red).opacity(0.14),
                in: Capsule()
            )
    }
}

/// The phase progress bar (same shape as the minimal mode card).
private struct PhaseBar: View {
    let pct: Int
    let tint: Color
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.09))
                Capsule()
                    .fill(tint)
                    .frame(width: max(0, geo.size.width * CGFloat(max(0, min(100, pct))) / 100))
            }
        }
        .frame(height: 4)
    }
}

/// The tomato card — the widget's copy of the app's minimal focus mode.
private struct PomodoroCard: View {
    let snapshot: WidgetSnapshot
    let lang: String
    var compact: Bool = false

    private var isBreak: Bool { snapshot.pomodoroMode == "break" }
    private var accent: Color { isBreak ? TomatoPalette.green : TomatoPalette.red }
    private var sessionsText: String {
        lang == "en"
            ? "\(snapshot.pomodoroSessions) pomodoros today"
            : "今日 \(snapshot.pomodoroSessions) 个番茄"
    }

    var body: some View {
        if compact {
            // the small family: the tomato above a chip, then the bar
            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .center, spacing: 7) {
                    TomatoClock(seconds: snapshot.pomodoroSeconds,
                                mode: snapshot.pomodoroMode,
                                size: 36)
                    ModeChip(mode: snapshot.pomodoroMode,
                             running: snapshot.pomodoroRunning,
                             lang: lang)
                }
                bar
            }
        } else {
            // the medium/large families: the minimal card's horizontal strip
            HStack(alignment: .center, spacing: 9) {
                TomatoClock(seconds: snapshot.pomodoroSeconds,
                            mode: snapshot.pomodoroMode,
                            size: 38)
                ModeChip(mode: snapshot.pomodoroMode,
                         running: snapshot.pomodoroRunning,
                         lang: lang)
                Text(sessionsText)
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                bar
            }
        }
    }

    /// the phase bar plus its percentage
    private var bar: some View {
        HStack(spacing: 6) {
            // the small family stretches the bar, the strip keeps a fixed one
            if compact {
                PhaseBar(pct: snapshot.pomodoroElapsedPct, tint: accent)
                    .frame(maxWidth: .infinity)
            } else {
                PhaseBar(pct: snapshot.pomodoroElapsedPct, tint: accent)
                    .frame(width: 64)
            }
            Text("\(snapshot.pomodoroElapsedPct)%")
                .font(.system(size: 10, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .frame(width: 30, alignment: .trailing)
        }
    }
}

/// The widget header — logo mark, title and the trailing count.
private struct WidgetHeader: View {
    let title: String
    let count: Int
    var body: some View {
        HStack(spacing: 5) {
            TomatoGlyph(size: 12)
            Text(title)
                .font(.system(size: 12, weight: .bold))
                .lineLimit(1)
                .fixedSize()
            Spacer(minLength: 6)
            Text("\(count)")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .monospacedDigit()
        }
    }
}

/// A small coloured chip (due date / important).
private struct TagChip: View {
    let text: String
    let tint: Color
    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .semibold))
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(tint)
            .padding(.horizontal, 5)
            .padding(.vertical, 1.5)
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

/// The empty state — distinguishes "no data" from "the app is not running".
@ViewBuilder
private func emptyHint(_ found: Bool, noData: String, lang: String) -> some View {
    if found {
        Text(noData)
            .font(.system(size: 11))
            .foregroundStyle(.secondary)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
    } else {
        Text(lang == "en" ? "Open Tomatodo to sync" : "打开 Tomatodo 以同步数据")
            .font(.system(size: 11))
            .foregroundStyle(.secondary)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The check button — a real, working AppIntent button.
private struct CheckButton: View {
    let taskID: String
    var body: some View {
        Button(intent: ToggleTaskIntent(taskID: taskID)) {
            Circle()
                .strokeBorder(Color.secondary.opacity(0.55), lineWidth: 1.2)
                .frame(width: 12, height: 12)
        }
        .buttonStyle(.plain)
    }
}

/// A task row: tappable through to the matching task in the app.
private struct TaskRowLink: View {
    let task: WidgetTask
    let lang: String
    /// the small family has no room for the chips — the title takes it all
    var compact: Bool = false
    var body: some View {
        if let url = URL(string: "tomatodo://task/\(task.id)") {
            Link(destination: url) { rowContent }
        } else {
            rowContent
        }
    }

    private var rowContent: some View {
        // ONE line per task: a medium widget only has ~120pt of content, so a
        // two-line row (title + chips) would show barely three items.
        HStack(spacing: 5) {
            Text(task.subject)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(WidgetFormat.isOverdue(task.due)
                                 ? Color(red: 0.85, green: 0.31, blue: 0.21)
                                 : Color.primary)
            Spacer(minLength: 0)
            let overdue = WidgetFormat.isOverdue(task.due)
            if !compact {
            TagChip(
                text: WidgetFormat.dueLabel(task.due, lang: lang),
                tint: overdue ? Color(red: 0.85, green: 0.31, blue: 0.21) : Color(red: 0.88, green: 0.49, blue: 0.17)
            )
            if task.important {
                TagChip(text: lang == "en" ? "Important" : "重要",
                        tint: Color(red: 0.78, green: 0.23, blue: 0.36))
            }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A note row.
private struct NoteRowLink: View {
    let note: WidgetNote
    let lang: String
    var compact: Bool = false
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
            VStack(alignment: .leading, spacing: 1) {
                Text(note.title.isEmpty ? (lang == "en" ? "Untitled" : "未命名") : note.title)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                if !note.preview.isEmpty && !compact {
                    Text(note.preview)
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if note.pinned {
                Image(systemName: "pin.fill")
                    .font(.system(size: 9))
                    .foregroundStyle(.orange)
            }
        }
    }
}

// MARK: - 1. 今日待办

struct TodayWidgetView: View {
    let entry: WidgetEntry
    @Environment(\.widgetFamily) private var family
    var body: some View { TodayWidgetBody(entry: entry, family: family) }
}

/// The layout lives in its own view so it can be rendered outside a widget
/// (the previews / the design harness).
struct TodayWidgetBody: View {
    let entry: WidgetEntry
    let family: WidgetFamily

    private var lang: String { entry.lang }
    private var title: String { lang == "en" ? "Today" : "今日待办" }
    private var noData: String { lang == "en" ? "Nothing due today" : "今天没有待办" }

    private var maxRows: Int {
        switch family {
        case .systemSmall: return 2
        case .systemLarge: return 8
        default: return 3
        }
    }

    private var showCard: Bool {
        entry.snapshot.pomodoroActive || entry.snapshot.pomodoroRunning
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            // the minimal card's soft glow, in the corner. It lives in a
            // BACKGROUND: as a ZStack child its 200pt frame inflated the stack
            // and pushed the header out of the widget.
            .background(alignment: .topTrailing) {
                RadialGradient(
                    colors: [(entry.snapshot.pomodoroMode == "break" ? TomatoPalette.green : TomatoPalette.red).opacity(0.14), .clear],
                    center: .center,
                    startRadius: 2,
                    endRadius: 110
                )
                .frame(width: 200, height: 200)
                .offset(x: 70, y: -80)
                .allowsHitTesting(false)
            }
            .widgetURL(URL(string: "tomatodo://open"))
    }

    @ViewBuilder
    private var content: some View {
        if family == .systemSmall {
            VStack(alignment: .leading, spacing: 6) {
                WidgetHeader(title: title, count: entry.snapshot.todayCount)
                if showCard {
                    PomodoroCard(snapshot: entry.snapshot, lang: lang, compact: true)
                }
                if entry.snapshot.today.isEmpty {
                    emptyHint(entry.found, noData: noData, lang: lang)
                } else {
                    ForEach(entry.snapshot.today.prefix(maxRows)) { task in
                        HStack(alignment: .top, spacing: 6) {
                            CheckButton(taskID: task.id)
                            TaskRowLink(task: task, lang: lang, compact: family == .systemSmall)
                        }
                    }
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 7) {
                WidgetHeader(title: title, count: entry.snapshot.todayCount)
                if showCard {
                    PomodoroCard(snapshot: entry.snapshot, lang: lang, compact: false)
                }
                if entry.snapshot.today.isEmpty {
                    emptyHint(entry.found, noData: noData, lang: lang)
                } else {
                    ForEach(entry.snapshot.today.prefix(maxRows)) { task in
                        HStack(alignment: .top, spacing: 6) {
                            CheckButton(taskID: task.id)
                            TaskRowLink(task: task, lang: lang, compact: family == .systemSmall)
                        }
                    }
                    if entry.snapshot.today.count > maxRows {
                        Text(lang == "en"
                             ? "+\(entry.snapshot.today.count - maxRows) more"
                             : "还有 \(entry.snapshot.today.count - maxRows) 项")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
        }
    }
}

// MARK: - 2. 已计划

struct PlannedWidgetView: View {
    let entry: WidgetEntry
    @Environment(\.widgetFamily) private var family
    var body: some View { PlannedWidgetBody(entry: entry, family: family) }
}

struct PlannedWidgetBody: View {
    let entry: WidgetEntry
    let family: WidgetFamily

    private var lang: String { entry.lang }
    private var title: String { lang == "en" ? "Planned" : "已计划" }
    private var noData: String { lang == "en" ? "Nothing planned" : "还没有计划中的任务" }

    private var maxRows: Int {
        switch family {
        case .systemSmall: return 3
        case .systemLarge: return 9
        default: return 4
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(title: title, count: entry.snapshot.plannedCount)
            if entry.snapshot.planned.isEmpty {
                emptyHint(entry.found, noData: noData, lang: lang)
            } else {
                ForEach(entry.snapshot.planned.prefix(maxRows)) { task in
                    HStack(alignment: .top, spacing: 6) {
                        CheckButton(taskID: task.id)
                        TaskRowLink(task: task, lang: lang, compact: family == .systemSmall)
                    }
                }
                if entry.snapshot.planned.count > maxRows {
                    Text(lang == "en"
                         ? "+\(entry.snapshot.planned.count - maxRows) more"
                         : "还有 \(entry.snapshot.planned.count - maxRows) 项")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .widgetURL(URL(string: "tomatodo://open"))
    }
}

// MARK: - 3. 便签

struct NotesWidgetView: View {
    let entry: WidgetEntry
    @Environment(\.widgetFamily) private var family
    var body: some View { NotesWidgetBody(entry: entry, family: family) }
}

struct NotesWidgetBody: View {
    let entry: WidgetEntry
    let family: WidgetFamily

    private var lang: String { entry.lang }
    private var title: String { lang == "en" ? "Notes" : "便签" }
    private var noData: String { lang == "en" ? "No notes yet" : "还没有便签" }

    private var maxRows: Int {
        switch family {
        case .systemSmall: return 2
        case .systemLarge: return 7
        default: return 3
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(title: title, count: entry.snapshot.noteCount)
            if entry.snapshot.notes.isEmpty {
                emptyHint(entry.found, noData: noData, lang: lang)
            } else {
                ForEach(entry.snapshot.notes.prefix(maxRows)) { note in
                    NoteRowLink(note: note, lang: lang, compact: family == .systemSmall)
                }
                if entry.snapshot.notes.count > maxRows {
                    Text(lang == "en"
                         ? "+\(entry.snapshot.notes.count - maxRows) more"
                         : "还有 \(entry.snapshot.notes.count - maxRows) 条")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
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
        .description("今天要完成的待办，附带番茄钟番茄卡片")
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
