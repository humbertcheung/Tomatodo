//
//  TomatodoWidget.swift
//  Three desktop widgets for Tomatodo:
//
//   1. 今日待办  — the day list with the pomodoro clock
//   2. 已计划    — everything that has a due date, sorted
//   3. 便签      — the latest notes
//

import WidgetKit
import SwiftUI

// MARK: - Timeline

struct WidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct WidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> WidgetEntry {
        WidgetEntry(date: Date(), snapshot: .empty)
    }
    func getSnapshot(in context: Context, completion: @escaping (WidgetEntry) -> Void) {
        completion(WidgetEntry(date: Date(), snapshot: WidgetStore.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WidgetEntry>) -> Void) {
        let snap = WidgetStore.load()
        // refresh every 15 minutes (or sooner while a pomodoro runs)
        let next = Date().addingTimeInterval(snap.pomodoroRunning ? 60 : 15 * 60)
        completion(Timeline(entries: [WidgetEntry(date: Date(), snapshot: snap)], policy: .after(next)))
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
                Text("今天没有待办 ☀").font(.system(size: 11)).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else {
                ForEach(entry.snapshot.today.prefix(family == .systemSmall ? 3 : 6)) { task in
                    HStack(alignment: .top, spacing: 6) {
                        Circle()
                            .strokeBorder(Color.secondary.opacity(0.6), lineWidth: 1.2)
                            .frame(width: 11, height: 11)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(task.subject)
                                .font(.system(size: 12))
                                .lineLimit(1)
                            if task.important {
                                TagChip(text: "重要", tint: Color(red: 0.78, green: 0.23, blue: 0.36))
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
                Spacer(minLength: 0)
            }
        }
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
                Text("还没有计划中的任务").font(.system(size: 11)).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else {
                ForEach(entry.snapshot.planned.prefix(family == .systemSmall ? 3 : 6)) { task in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(task.subject)
                            .font(.system(size: 12))
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
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - 3. 便签

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
                Text("还没有便签").font(.system(size: 11)).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else {
                ForEach(entry.snapshot.notes.prefix(family == .systemSmall ? 3 : 6)) { note in
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
                Spacer(minLength: 0)
            }
        }
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
