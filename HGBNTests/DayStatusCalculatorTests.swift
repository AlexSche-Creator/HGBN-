import XCTest
@testable import HGBN

final class DayStatusCalculatorTests: XCTestCase {

    private func status(_ episodes: [EpisodeInput], anxiety: [AnxietyInput] = [], override: DayStatus? = nil) -> DayStatus {
        DayStatusCalculator.calculate(episodes: episodes, anxiety: anxiety, manualOverride: override).dayStatus
    }

    // MARK: - Супер день

    func testNoEpisodesIsSuper() {
        XCTAssertEqual(status([]), .superDay)
    }

    func testSingleShortMildEpisodeIsSuper() {
        XCTAssertEqual(status([EpisodeInput(intensity: 5, durationMinutes: 15)]), .superDay)
    }

    func testSingleShortMildBoundaryIsSuper() {
        XCTAssertEqual(status([EpisodeInput(intensity: 1, durationMinutes: 1)]), .superDay)
    }

    // MARK: - Хороший день

    func testFewShortMildEpisodesIsGood() {
        let episodes = Array(repeating: EpisodeInput(intensity: 4, durationMinutes: 10), count: 3)
        XCTAssertEqual(status(episodes), .good)
    }

    func testLowTotalDurationLowIntensityIsGood() {
        let episodes = [
            EpisodeInput(intensity: 5, durationMinutes: 30),
            EpisodeInput(intensity: 4, durationMinutes: 20)
        ]
        XCTAssertEqual(status(episodes), .good) // total 50, max 5
    }

    func testSingleLongerButMildIsGood() {
        // Один эпизод 40 минут, интенсивность 5 — не супер, но хороший.
        XCTAssertEqual(status([EpisodeInput(intensity: 5, durationMinutes: 40)]), .good)
    }

    // MARK: - Так себе день

    func testMoreThanFiveEpisodesIsBad() {
        let episodes = Array(repeating: EpisodeInput(intensity: 3, durationMinutes: 5), count: 6)
        XCTAssertEqual(status(episodes), .bad)
    }

    func testTotalDurationOverSixtyIsBad() {
        let episodes = [
            EpisodeInput(intensity: 5, durationMinutes: 40),
            EpisodeInput(intensity: 5, durationMinutes: 30)
        ]
        XCTAssertEqual(status(episodes), .bad) // total 70
    }

    func testIntensitySixIsBad() {
        XCTAssertEqual(status([EpisodeInput(intensity: 6, durationMinutes: 10)]), .bad)
    }

    func testIntensitySevenIsBad() {
        XCTAssertEqual(status([EpisodeInput(intensity: 7, durationMinutes: 10)]), .bad)
    }

    // MARK: - Тяжёлый день

    func testIntensityEightIsTerrible() {
        XCTAssertEqual(status([EpisodeInput(intensity: 8, durationMinutes: 10)]), .terrible)
    }

    func testIntensityNineIsTerrible() {
        XCTAssertEqual(status([EpisodeInput(intensity: 9, durationMinutes: 10)]), .terrible)
    }

    func testSingleEpisodeOverTwoHoursIsTerrible() {
        XCTAssertEqual(status([EpisodeInput(intensity: 4, durationMinutes: 150)]), .terrible)
    }

    func testTotalOverThreeHoursIsTerrible() {
        let episodes = [
            EpisodeInput(intensity: 5, durationMinutes: 100),
            EpisodeInput(intensity: 5, durationMinutes: 100)
        ]
        XCTAssertEqual(status(episodes), .terrible) // total 200 > 180
    }

    // MARK: - Очень тяжёлый день

    func testIntensityTenIsNightmare() {
        XCTAssertEqual(status([EpisodeInput(intensity: 10, durationMinutes: 10)]), .nightmare)
    }

    func testDayLongFlagIsNightmare() {
        XCTAssertEqual(status([EpisodeInput(intensity: 3, durationMinutes: 10, isDayLong: true)]), .nightmare)
    }

    func testTotalOverFiveHoursIsNightmare() {
        let episodes = [
            EpisodeInput(intensity: 5, durationMinutes: 180),
            EpisodeInput(intensity: 5, durationMinutes: 150)
        ]
        XCTAssertEqual(status(episodes), .nightmare) // total 330 > 300
    }

    // MARK: - Ручное переопределение

    func testManualOverrideWins() {
        let result = DayStatusCalculator.calculate(
            episodes: [EpisodeInput(intensity: 10, durationMinutes: 200)],
            manualOverride: .good
        )
        XCTAssertEqual(result.dayStatus, .good)
        XCTAssertTrue(result.manuallyOverridden)
    }

    // MARK: - Метрики и резюме

    func testMetricsAreComputed() {
        let result = DayStatusCalculator.calculate(episodes: [
            EpisodeInput(intensity: 4, durationMinutes: 20),
            EpisodeInput(intensity: 6, durationMinutes: 40)
        ])
        XCTAssertEqual(result.totalEpisodes, 2)
        XCTAssertEqual(result.totalDurationMinutes, 60)
        XCTAssertEqual(result.maxIntensity, 6)
        XCTAssertEqual(result.averageIntensity, 5.0, accuracy: 0.001)
    }

    func testTextualSummaryIsNotEmpty() {
        let result = DayStatusCalculator.calculate(episodes: [EpisodeInput(intensity: 4, durationMinutes: 10)])
        XCTAssertFalse(result.textualSummary.isEmpty)
    }

    func testIntensityClampedInModel() {
        let episode = Episode(intensity: 50)
        XCTAssertEqual(episode.intensity, 10)
        let low = Episode(intensity: -3)
        XCTAssertEqual(low.intensity, 1)
    }
}
