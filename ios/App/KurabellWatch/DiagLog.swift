import Foundation

// 実機でしか起きない不具合の手がかりを Watch 自身に残す、短い記録(1.4.2、2026-10-15)。
// ワークアウトが止まらない・休憩の知らせが遅れる、は推定で直しては外してきた(docs/Watchアプリ.md)。
// 次に起きたとき、何が起きたかを北村さんが Watch の画面で読めるようにする(待機・メニュー画面の「ワークアウトを終了」の下の説明文を長押し)。
// 中身はワークアウトの開始・対応付け・保存・破棄と、休憩の知らせの予約・到着だけ。記録の中身(重量など)は入れない。
// 通知のデリゲート(メインスレッド以外)からも書くので、ロックで守る。
enum DiagLog {
    private static let key = "watch.diag.v1"
    private static let limit = 300
    private static let lock = NSLock()
    private static let fmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "MM/dd HH:mm:ss"
        return f
    }()

    static func add(_ text: String) {
        lock.lock(); defer { lock.unlock() }
        var lines = UserDefaults.standard.stringArray(forKey: key) ?? []
        lines.append("\(fmt.string(from: Date())) \(text)")
        if lines.count > limit { lines.removeFirst(lines.count - limit) }
        UserDefaults.standard.set(lines, forKey: key)
    }

    // 新しい順
    static func lines() -> [String] {
        lock.lock(); defer { lock.unlock() }
        return (UserDefaults.standard.stringArray(forKey: key) ?? []).reversed()
    }

    // ms の時刻を、記録の見出しと同じ形で(記録の startAt を人が照らし合わせられるように)
    static func time(_ ms: Double?) -> String {
        guard let ms else { return "-" }
        lock.lock(); defer { lock.unlock() }
        return fmt.string(from: Date(timeIntervalSince1970: ms / 1000))
    }
}
