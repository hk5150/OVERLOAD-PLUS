import Capacitor

// HealthManager(ヘルスケア連携のネイティブ処理)をJS側(window.Capacitor.Plugins.Health)に
// 橋渡しするだけの薄い層。RestTimerPluginと同じく、BridgeViewController.capacitorDidLoad()で
// 明示的に登録している。JS側は src/domain/health.js。
// 日時はJSとのやりとりをすべてエポックミリ秒にそろえる。
@objc(HealthPlugin)
public class HealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthPlugin"
    public let jsName = "Health"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "latestBodyMass", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveBodyMass", returnType: CAPPluginReturnPromise),
    ]

    private let manager = HealthManager.shared

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": manager.isAvailable])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard manager.isAvailable else { call.reject("unavailable"); return }
        Task {
            do {
                try await manager.requestAuthorization()
                call.resolve(statusObject())
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func authorizationStatus(_ call: CAPPluginCall) {
        guard manager.isAvailable else { call.reject("unavailable"); return }
        call.resolve(statusObject())
    }

    private func statusObject() -> [String: Any] {
        let s = manager.authorizationStatus()
        return ["workout": s.workout, "bodyMass": s.bodyMass]
    }

    // { key: startAtのISO文字列, startAt: エポックミリ秒, endAt: エポックミリ秒 }
    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty,
              let startAt = call.getDouble("startAt"),
              let endAt = call.getDouble("endAt") else {
            call.reject("key, startAt, endAt required")
            return
        }
        Task {
            do {
                try await manager.saveWorkout(key: key,
                                              start: Date(timeIntervalSince1970: startAt / 1000),
                                              end: Date(timeIntervalSince1970: endAt / 1000))
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // { key: startAtのISO文字列 } → { deleted: 件数 }
    @objc func deleteWorkout(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("key required")
            return
        }
        Task {
            do {
                let n = try await manager.deleteWorkout(key: key)
                call.resolve(["deleted": n])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // → { kg, date: エポックミリ秒 } / 無ければ {}
    @objc func latestBodyMass(_ call: CAPPluginCall) {
        Task {
            do {
                if let r = try await manager.latestBodyMass() {
                    call.resolve(["kg": r.kg, "date": r.date.timeIntervalSince1970 * 1000])
                } else {
                    call.resolve([:])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // { kg } → { date: 保存したサンプルの日時(エポックミリ秒) }
    @objc func saveBodyMass(_ call: CAPPluginCall) {
        guard let kg = call.getDouble("kg"), kg > 0 else {
            call.reject("kg required")
            return
        }
        Task {
            do {
                let date = try await manager.saveBodyMass(kg: kg)
                call.resolve(["date": date.timeIntervalSince1970 * 1000])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
