import Capacitor

// CAPBridgedPlugin準拠だけではCapacitorのobjcランタイム自動検出に乗らない
// (Xcodeプロジェクトにソースファイルとして直接追加したプラグインで確認済み、
// npm経由のCocoaPodsプラグインとは登録経路が異なる)。capacitorDidLoad()で
// 明示的に登録する。詳細はdocs/IAP実装方針.mdを参照。
class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(IapPlugin())
    }
}
