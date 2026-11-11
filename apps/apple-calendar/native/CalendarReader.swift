import EventKit
import Foundation

func reply(events: [[String: Any]] = [], error: String? = nil) {
    let payload: [String: Any] = [
        "type": "calendar.snapshot", "events": events,
        "updatedAt": Date().timeIntervalSince1970 * 1000,
        "error": error as Any? ?? NSNull()
    ]
    do {
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([10]))
    } catch {
        fputs("Could not encode calendar events.\n", stderr)
        exit(1)
    }
}

let meetPattern = try! NSRegularExpression(
    pattern: "https://meet\\.google\\.com/([a-z]{3}-[a-z]{4}-[a-z]{3})(?![a-z0-9-])",
    options: [.caseInsensitive]
)

func meetURL(in text: String) -> String {
    guard let match = meetPattern.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
          let range = Range(match.range(at: 1), in: text) else { return "" }
    return "https://meet.google.com/" + text[range].lowercased()
}

if CommandLine.arguments.contains("--self-test") {
    assert(meetURL(in: "Join: https://meet.google.com/abc-defg-hij?authuser=0") == "https://meet.google.com/abc-defg-hij")
    assert(meetURL(in: "<a href=\"https://meet.google.com/ABC-DEFG-HIJ\">Join</a>") == "https://meet.google.com/abc-defg-hij")
    assert(meetURL(in: "🗓 https://meet.google.com/abc-defg-hij") == "https://meet.google.com/abc-defg-hij")
    assert(meetURL(in: "https://meet.google.com.evil.test/abc-defg-hij").isEmpty)
    assert(meetURL(in: "https://meet.google.com/abc-defg-hijk").isEmpty)
    assert(meetURL(in: "No video call").isEmpty)
    print("Google Meet extraction checks passed.")
    exit(0)
}

let store = EKEventStore()
let authorizeOnly = CommandLine.arguments.contains("--authorize")
if authorizeOnly || EKEventStore.authorizationStatus(for: .event) == .notDetermined {
    var finished = false
    store.requestFullAccessToEvents { granted, error in
        DispatchQueue.main.async {
            if authorizeOnly {
                reply(error: granted ? nil : "Allow full access for Bridgething Apple Calendar in System Settings > Privacy & Security > Calendars, then refresh.")
            }
            finished = true
        }
    }
    while !finished { RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1)) }
    if authorizeOnly { exit(0) }
}

guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else {
    reply(error: "Allow full access for Bridgething Apple Calendar in System Settings > Privacy & Security > Calendars, then refresh.")
    exit(0)
}

let calendar = Calendar.current
let start = calendar.startOfDay(for: Date())
let end = calendar.date(byAdding: .day, value: 1, to: start)!
let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
let events = store.events(matching: predicate)
    .filter { $0.status != .canceled }
    .sorted { $0.startDate < $1.startDate }
    .map { event -> [String: Any] in
        [
            "id": "\(event.calendarItemIdentifier):\(event.startDate.timeIntervalSince1970)",
            "title": event.title?.isEmpty == false ? event.title! : "Untitled event",
            "calendar": event.calendar.title,
            "start": event.startDate.timeIntervalSince1970 * 1000,
            "end": event.endDate.timeIntervalSince1970 * 1000,
            "allDay": event.isAllDay,
            "location": event.location ?? "",
            "meetUrl": meetURL(in: [event.notes ?? "", event.url?.absoluteString ?? "", event.location ?? ""].joined(separator: "\n"))
        ]
    }
reply(events: events)
