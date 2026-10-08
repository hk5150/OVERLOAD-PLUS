import Capacitor
import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

// 「次の一手」(1.4)の理由の文章を、端末内の Apple Foundation Models に書かせる。
// 数字(重量・回数)は JS 側の規則(src/domain/nextStep.js)で決めてあり、ここでは言い換えだけを頼む。
// Apple 自身が端末内モデルで「基本的な算数・論理推論は避けるべき」と書いているため(docs/次の一手.md)。
// 端末内モデルだけを使う(Private Cloud Compute は記録が端末の外に出るので使わない)。
// デプロイ対象は iOS 16.2 のまま。iOS 26 未満・非対応機種・Apple Intelligence オフ・モデル未ダウンロードでは
// availability が false を返し、JS は定型文だけを出す。
// ReviewPlugin と同じく、BridgeViewController.capacitorDidLoad() で明示的に登録している。
@objc(AiPlugin)
public class AiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AiPlugin"
    public let jsName = "Ai"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "explain", returnType: CAPPluginReturnPromise),
    ]

    @objc func availability(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let a = SystemLanguageModel.default.availability
            if case .available = a {
                call.resolve(["available": true, "reason": ""])
            } else {
                call.resolve(["available": false, "reason": String(describing: a)])
            }
            return
        }
        #endif
        call.resolve(["available": false, "reason": "unsupported"])
    }

    // facts: 規則が出した案と理由(JS で組み立てた文)。lang: "ja" / "en"
    @objc func explain(_ call: CAPPluginCall) {
        guard let facts = call.getString("facts"), !facts.isEmpty else {
            call.reject("facts required")
            return
        }
        let lang = call.getString("lang") ?? "ja"
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    let session = LanguageModelSession(instructions: Self.instructions(lang))
                    let response = try await session.respond(to: facts, options: GenerationOptions(temperature: 0.2))
                    call.resolve(["text": response.content])
                } catch {
                    call.reject(error.localizedDescription)
                }
            }
            return
        }
        #endif
        call.reject("unsupported")
    }

    // 日本語以外の言語では、先頭に英語の決まり文句でロケールを伝えるよう Apple が案内している。
    // 例を2つ入れている。例なしの指示では、事実と違う説明(「前回の80kg×8回より少し軽い」等)を作ったり、
    // 英語で見出しを並べたりした(2026-10-08、Mac 上の端末内モデルで確認)
    private static func instructions(_ lang: String) -> String {
        if lang == "en" {
            return """
            The person's locale is en_US.
            In a workout log app, write one short line telling the lifter the next-set suggestion.
            Use only the facts in "Reason". Do not add or change facts. Use only the numbers given.
            At most two sentences. Suggest, don't command. No greetings, no emoji, no headings.

            Example
            Input: Plan: 72.5kg × 8–10 (+2.5kg) / Reason: Last time you hit 10 reps at 70kg (RIR 1), the top of your range (10), so add 2.5kg and start again at 8.
            Output: You reached 10 reps at 70kg, so try 72.5kg next and start from 8 reps.

            Input: Plan: 50kg × 10 / Reason: You've managed 10 reps at this weight recently, but only 8 last time. Keep the weight and get back to 10.
            Output: You dropped to 8 last time, so keep 50kg and work back up to the 10 you were getting.
            """
        }
        return """
        The person's locale is ja_JP.
        筋トレ記録アプリで、次のセットの案を本人に伝える一言を書きます。
        「理由」に書かれている事実だけを使い、事実を足したり変えたりしないこと。数字は与えられたものだけ。
        2文以内。提案の口調。挨拶・絵文字・見出しは書かない。

        例)
        入力: 次の案: 72.5kg × 8〜10回(+2.5kg) / 理由: 前回は70kgで10回(RIR1)と上限の10回に届いたので、2.5kg増やして8回からにします。
        出力: 70kgで10回に届いたので、次は2.5kg上げて72.5kgで8回から始めてみましょう。

        入力: 次の案: 50kg × 10回 / 理由: この重量では最近10回できていましたが、前回は8回でした。重量はそのままで10回に戻します。
        出力: 前回は8回まで落ちたので、重量は50kgのまま、まずは以前の10回を取り戻しましょう。
        """
    }
}
