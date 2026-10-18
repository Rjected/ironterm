import Foundation

// Shapes returned by the Hevy public API (api.hevyapp.com/v1/workouts). Lenient: everything we
// don't strictly need is optional, matching web/shared/hevy.ts.

struct WorkoutsPage: Codable {
    var page: Int
    var pageCount: Int
    var workouts: [Workout]

    enum CodingKeys: String, CodingKey {
        case page, workouts
        case pageCount = "page_count"
    }
}

struct Workout: Codable, Identifiable, Equatable {
    var id: String
    var title: String
    var startTime: String
    var endTime: String
    var updatedAt: String?
    var exercises: [Exercise]
    /// workout note (may carry the hidden program-day tag `[ht:A1]`)
    var description: String?

    enum CodingKeys: String, CodingKey {
        case id, title, exercises, description
        case startTime = "start_time"
        case endTime = "end_time"
        case updatedAt = "updated_at"
    }

    init(id: String, title: String, startTime: String, endTime: String, updatedAt: String? = nil, exercises: [Exercise], description: String? = nil) {
        self.id = id; self.title = title; self.startTime = startTime; self.endTime = endTime
        self.updatedAt = updatedAt; self.exercises = exercises; self.description = description
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = (try? c.decode(String.self, forKey: .title)) ?? "Workout"
        startTime = try c.decode(String.self, forKey: .startTime)
        endTime = (try? c.decode(String.self, forKey: .endTime)) ?? startTime
        updatedAt = try? c.decodeIfPresent(String.self, forKey: .updatedAt)
        exercises = (try? c.decode([Exercise].self, forKey: .exercises)) ?? []
        description = try? c.decodeIfPresent(String.self, forKey: .description)
    }

    var startDate: Date? { Fmt.parseISO(startTime) }
    var endDate: Date? { Fmt.parseISO(endTime) }
}

struct Exercise: Codable, Equatable {
    var title: String
    var exerciseTemplateId: String
    var sets: [ExerciseSet]
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case title, sets, notes
        case exerciseTemplateId = "exercise_template_id"
    }

    init(title: String, exerciseTemplateId: String = "", sets: [ExerciseSet], notes: String? = nil) {
        self.title = title; self.exerciseTemplateId = exerciseTemplateId; self.sets = sets; self.notes = notes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        exerciseTemplateId = (try? c.decode(String.self, forKey: .exerciseTemplateId)) ?? ""
        sets = (try? c.decode([ExerciseSet].self, forKey: .sets)) ?? []
        notes = try? c.decodeIfPresent(String.self, forKey: .notes)
    }
}

struct ExerciseSet: Codable, Equatable {
    var type: String
    var weightKg: Double?
    var reps: Int?
    var rpe: Double?
    var distanceMeters: Double?
    var durationSeconds: Double?

    enum CodingKeys: String, CodingKey {
        case type, reps, rpe
        case weightKg = "weight_kg"
        case distanceMeters = "distance_meters"
        case durationSeconds = "duration_seconds"
    }

    init(type: String = "normal", weightKg: Double?, reps: Int?, rpe: Double? = nil, distanceMeters: Double? = nil, durationSeconds: Double? = nil) {
        self.type = type; self.weightKg = weightKg; self.reps = reps; self.rpe = rpe
        self.distanceMeters = distanceMeters; self.durationSeconds = durationSeconds
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = (try? c.decode(String.self, forKey: .type)) ?? "normal"
        weightKg = try? c.decodeIfPresent(Double.self, forKey: .weightKg)
        reps = try? c.decodeIfPresent(Int.self, forKey: .reps)
        rpe = try? c.decodeIfPresent(Double.self, forKey: .rpe)
        distanceMeters = try? c.decodeIfPresent(Double.self, forKey: .distanceMeters)
        durationSeconds = try? c.decodeIfPresent(Double.self, forKey: .durationSeconds)
    }

    var isWarmup: Bool { type == "warmup" }
}
