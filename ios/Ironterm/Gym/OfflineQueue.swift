import Foundation

/// Writes to the server that must survive being offline: the latest live session (PUT /api/live,
/// coalesced), a discard, and finished workouts (POST /api/live/finish). Kept in order in a JSON
/// file, flushed first-in first-out; a transient failure (offline, 5xx) stops the flush and keeps
/// the op for later, a permanent one (4xx) drops it and reports it.
@MainActor
final class OfflineQueue: ObservableObject {
    enum Op: Codable, Equatable {
        case putLive(LiveSession)
        case discard(sessionId: String)
        case finish(LiveSession, queuedAt: String)

        var isFinish: Bool { if case .finish = self { return true } else { return false } }
    }

    struct Failure: Equatable { var op: Op; var message: String }

    @Published private(set) var ops: [Op] = []
    @Published private(set) var flushing = false
    /// ops the server refused (4xx), newest last
    @Published private(set) var failures: [Failure] = []

    let file: URL?
    /// Sends one op; throws ApiError. Returns the server's answer for `.finish`.
    var sender: ((Op) async throws -> FinishResult?)?
    /// called with each finished session after the server accepted it
    var onFinished: ((LiveSession, FinishResult?) -> Void)?

    init(file: URL?) {
        self.file = file
        if let file, let data = try? Data(contentsOf: file), let saved = try? JSONDecoder().decode([Op].self, from: data) {
            ops = saved
        }
    }

    var pendingFinishes: Int { ops.filter(\.isFinish).count }

    func enqueue(_ op: Op) {
        switch op {
        case .putLive(let s):
            // only the newest copy of a session matters
            ops.removeAll { if case .putLive(let x) = $0 { return x.id == s.id } else { return false } }
            ops.append(op)
        case .discard(let id):
            dropPuts(id)
            ops.append(op)
        case .finish(let s, _):
            // finishing or discarding makes any pending save of that session pointless
            dropPuts(s.id)
            ops.append(op)
        }
        save()
    }

    private var running: Task<Bool, Never>?

    /// Send everything in order. Returns true when the queue is empty afterwards. A flush that is
    /// already running is waited for first, so ops queued meanwhile are not left behind.
    @discardableResult
    func flush() async -> Bool {
        // one drain at a time (a duplicate POST /api/live/finish would log the workout twice)
        while let r = running { _ = await r.value }
        let t = Task { () -> Bool in
            let ok = await self.drain()
            self.running = nil
            self.flushing = false
            return ok
        }
        running = t
        flushing = true
        return await t.value
    }

    private func drain() async -> Bool {
        guard let sender else { return ops.isEmpty }
        while let op = ops.first {
            do {
                let r = try await sender(op)
                ops.removeFirst()
                save()
                if case .finish(let s, _) = op { onFinished?(s, r) }
            } catch let e as ApiError where !e.isTransient {
                ops.removeFirst()
                save()
                // a refused PUT is not worth surfacing; a refused finish or discard is
                if case .putLive = op {} else { failures.append(Failure(op: op, message: e.errorDescription ?? "Refused")) }
            } catch {
                return false
            }
        }
        return true
    }

    func clearFailures() { failures = [] }

    private func dropPuts(_ id: String) {
        ops.removeAll { if case .putLive(let x) = $0 { return x.id == id } else { return false } }
    }

    private func save() {
        guard let file else { return }
        if ops.isEmpty { try? FileManager.default.removeItem(at: file); return }
        if let data = try? JSONEncoder().encode(ops) { try? data.write(to: file, options: .atomic) }
    }
}
