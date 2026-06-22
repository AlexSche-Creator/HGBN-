import SwiftUI
import SwiftData

struct CalendarView: View {
    @Environment(\.modelContext) private var context
    @Query private var summaries: [DaySummary]

    @State private var month: Date = .now
    private let calendar = Calendar.current

    private var summaryByKey: [Int: DaySummary] {
        Dictionary(summaries.map { ($0.dayKey, $0) }, uniquingKeysWith: { a, _ in a })
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Metrics.largeSpacing) {
                    monthHeader
                    weekdayRow
                    monthGrid
                    legend
                }
                .padding()
            }
            .background(Theme.Palette.secondaryBackground.ignoresSafeArea())
            .navigationTitle("Календарь")
        }
    }

    private var monthHeader: some View {
        HStack {
            Button { shiftMonth(-1) } label: { Image(systemName: "chevron.left") }
            Spacer()
            Text(monthTitle)
                .font(.headline)
            Spacer()
            Button { shiftMonth(1) } label: { Image(systemName: "chevron.right") }
        }
        .tint(Theme.Palette.accent)
    }

    private var weekdayRow: some View {
        HStack {
            ForEach(weekdaySymbols, id: \.self) { symbol in
                Text(symbol)
                    .font(.caption)
                    .foregroundStyle(Theme.Palette.textSecondary)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private var monthGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7), spacing: 6) {
            ForEach(Array(daysInMonthGrid.enumerated()), id: \.offset) { _, day in
                if let day {
                    NavigationLink {
                        DayDetailView(date: day)
                    } label: {
                        dayCell(day)
                    }
                    .buttonStyle(.plain)
                } else {
                    Color.clear.frame(height: 52)
                }
            }
        }
    }

    private func dayCell(_ day: Date) -> some View {
        let key = DayKey.make(from: day, calendar: calendar)
        let status = summaryByKey[key]?.dayStatus
        let isToday = calendar.isDateInToday(day)
        return VStack(spacing: 4) {
            Text("\(calendar.component(.day, from: day))")
                .font(.caption2)
                .foregroundStyle(Theme.Palette.textSecondary)
            Image(systemName: status?.iconName ?? "circle.dotted")
                .font(.callout)
                .foregroundStyle(status.map(Theme.statusColor) ?? Theme.Palette.separator)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 52)
        .background(isToday ? Theme.Palette.accentTint : Theme.Palette.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.smallCornerRadius, style: .continuous))
    }

    private var legend: some View {
        AppCard {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeader(title: "Обозначения")
                ForEach(DayStatus.allCases) { status in
                    HStack(spacing: 10) {
                        Image(systemName: status.iconName)
                            .foregroundStyle(Theme.statusColor(status))
                            .frame(width: 24)
                        Text(status.title)
                            .font(.subheadline)
                            .foregroundStyle(Theme.Palette.textPrimary)
                    }
                }
            }
        }
    }

    // MARK: - Календарные вычисления

    private var monthTitle: String {
        month.formatted(.dateTime.month(.wide).year())
    }

    private var weekdaySymbols: [String] {
        let symbols = calendar.shortWeekdaySymbols
        let first = calendar.firstWeekday - 1
        return Array(symbols[first...] + symbols[..<first])
    }

    private var daysInMonthGrid: [Date?] {
        guard let interval = calendar.dateInterval(of: .month, for: month),
              let firstWeekday = calendar.dateComponents([.weekday], from: interval.start).weekday
        else { return [] }
        let leading = (firstWeekday - calendar.firstWeekday + 7) % 7
        let dayCount = calendar.range(of: .day, in: .month, for: month)?.count ?? 0
        var cells: [Date?] = Array(repeating: nil, count: leading)
        for offset in 0..<dayCount {
            cells.append(calendar.date(byAdding: .day, value: offset, to: interval.start))
        }
        return cells
    }

    private func shiftMonth(_ delta: Int) {
        if let next = calendar.date(byAdding: .month, value: delta, to: month) {
            month = next
        }
    }
}

#Preview {
    CalendarView()
        .modelContainer(AppModelContainer.makePreview())
}
