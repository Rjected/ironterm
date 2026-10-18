import Foundation

/// ironterm://connect?server=<urlencoded origin>&token=<ht_…>
struct ConnectLink: Equatable {
    var server: URL   // origin only: scheme://host[:port]
    var token: String

    enum ParseError: Error, Equatable {
        case notConnectLink, missingServer, invalidServer, missingToken
    }

    static let scheme = "ironterm"

    static func parse(_ url: URL) -> Result<ConnectLink, ParseError> {
        guard url.scheme?.lowercased() == scheme,
              let c = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return .failure(.notConnectLink) }
        // ironterm://connect?… has host "connect"; also accept ironterm:connect?…
        let target = (c.host ?? c.path).trimmingCharacters(in: CharacterSet(charactersIn: "/")).lowercased()
        guard target == "connect" else { return .failure(.notConnectLink) }
        let items = c.queryItems ?? []
        guard let rawServer = items.first(where: { $0.name == "server" })?.value, !rawServer.isEmpty else { return .failure(.missingServer) }
        guard let server = origin(rawServer) else { return .failure(.invalidServer) }
        guard let token = items.first(where: { $0.name == "token" })?.value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !token.isEmpty else { return .failure(.missingToken) }
        return .success(ConnectLink(server: server, token: token))
    }

    /// Normalise user input or a link parameter to an http(s) origin. Bare hosts get https://.
    static func origin(_ raw: String) -> URL? {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if !s.contains("://") { s = "https://" + s }
        guard let c = URLComponents(string: s), let scheme = c.scheme?.lowercased(),
              scheme == "https" || scheme == "http", let host = c.host, !host.isEmpty,
              c.user == nil, c.password == nil else { return nil }
        var o = URLComponents()
        o.scheme = scheme
        o.host = host
        o.port = c.port
        return o.url
    }

    /// The saved app token only ever goes back to the server it was saved for. Typing a new server
    /// URL in SETUP while the saved token is still in the (prefilled) token field must not send it
    /// to that new host; a token typed or pasted for the new server is fine.
    static func mayUseToken(_ token: String, for target: URL, savedToken: String?, savedServer: URL?) -> Bool {
        guard let savedToken, !savedToken.isEmpty, token == savedToken else { return true }
        guard let savedServer else { return false }
        return sameOrigin(savedServer, target)
    }

    /// The token would travel unencrypted (plain http). ATS only lets http through for local
    /// networking, but on a shared or hostile LAN that is still readable by anyone on it.
    var isCleartext: Bool { server.scheme?.lowercased() == "http" }

    /// Host (and port when not the default) as shown in the confirmation, e.g. "gym.example.com".
    var displayHost: String {
        let host: String = server.host ?? server.absoluteString
        guard let port = server.port else { return host }
        return host + ":" + String(port)
    }

    /// Two URLs share an origin (used to keep the WebView on the server).
    static func sameOrigin(_ a: URL, _ b: URL) -> Bool {
        func port(_ u: URL) -> Int? { u.port ?? (u.scheme == "https" ? 443 : u.scheme == "http" ? 80 : nil) }
        return a.scheme?.lowercased() == b.scheme?.lowercased() && a.host?.lowercased() == b.host?.lowercased() && port(a) == port(b)
    }
}
