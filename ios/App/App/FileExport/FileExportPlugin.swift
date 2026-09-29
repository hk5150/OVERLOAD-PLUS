import Capacitor
import UIKit

// バックアップ(JSON)・CSVの書き出しを、iOSの共有シート(ファイルに保存・AirDrop・メールなど)で行う。
// Web版は <a download> でダウンロードさせているが、WKWebView(Capacitor 6)ではそれを誰も処理せず、
// ファイルが作られていなかった(2026-09-29、書き出したつもりのバックアップが残っていなかった)。
// RestTimerPluginと同じく、BridgeViewController.capacitorDidLoad()で明示的に登録している。
// JS側は src/domain/fileExport.js。
@objc(FileExportPlugin)
public class FileExportPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FileExportPlugin"
    public let jsName = "FileExport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
    ]

    // { filename, text } → { completed, activityType }
    // completed は、保存やAirDropを最後まで行ったときだけ true(キャンセルは false)。
    @objc func share(_ call: CAPPluginCall) {
        guard let rawName = call.getString("filename"), let text = call.getString("text") else {
            call.reject("filename and text required")
            return
        }
        // 一時ディレクトリの外に書かないよう、区切り文字を含む名前は使わない
        let filename = rawName.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: ":", with: "_")
        guard !filename.isEmpty, filename != ".", filename != ".." else {
            call.reject("invalid filename")
            return
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try Data(text.utf8).write(to: url, options: .atomic)
        } catch {
            call.reject("write failed: \(error.localizedDescription)")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let presenter = self?.bridge?.viewController else {
                try? FileManager.default.removeItem(at: url)
                call.reject("no view controller")
                return
            }
            // 共有シートがまだ出ている(ボタンの連打)ときに重ねて出すと、UIKitは表示せず完了も返さないので断る
            guard presenter.presentedViewController == nil else {
                try? FileManager.default.removeItem(at: url)
                call.reject("busy")
                return
            }
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            // ファイルとして残らない選択肢は外す(「コピー」でも completed が true になり、書き出したことになってしまう)
            sheet.excludedActivityTypes = [.copyToPasteboard, .print, .assignToContact, .addToReadingList]
            // iPadでは吹き出しで出すので、出どころが要る(iPhoneでは使われない)
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
                popover.permittedArrowDirections = []
            }
            // 完了の知らせは1回とは限らない。メール等の画面の中でキャンセルすると、共有シートは残ったまま
            // completed:false で呼ばれ、続けて別の方法で保存できる。シートが閉じたとき(または完了したとき)だけ確定する。
            var settled = false
            let settle: (Bool, String) -> Void = { completed, activityType in
                guard !settled else { return }
                settled = true
                try? FileManager.default.removeItem(at: url)
                call.resolve(["completed": completed, "activityType": activityType])
            }
            sheet.completionWithItemsHandler = { [weak sheet] activityType, completed, _, error in
                if let error = error, !settled {
                    settled = true
                    try? FileManager.default.removeItem(at: url)
                    call.reject("share failed: \(error.localizedDescription)")
                    return
                }
                if completed || activityType == nil {
                    settle(completed, activityType?.rawValue ?? "")
                    return
                }
                // 選んだ方法の中でキャンセルした。シートが閉じていればキャンセルとして確定し、残っていれば待つ
                DispatchQueue.main.async {
                    if sheet?.presentingViewController == nil { settle(false, activityType?.rawValue ?? "") }
                }
            }
            presenter.present(sheet, animated: true)
        }
    }
}
