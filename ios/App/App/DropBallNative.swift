import AVFoundation
import Capacitor
import GameKit
import StoreKit
import UIKit
import WebKit

/// The web view controller of the app: full screen, landscape, with the
/// local plugins (Game Center, BGM, Store) registered here.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())
        bridge?.registerPluginInstance(NativeBgmPlugin())
        bridge?.registerPluginInstance(StorePlugin())
        #if DEBUG
        // Xcode's Run (the Debug configuration): Google's test ads, not real
        // ones (public/app-native-v1.js). Archives use Release.
        let flag = WKUserScript(source: "window.__dropBallDebugBuild=true;", injectionTime: .atDocumentStart, forMainFrameOnly: true)
        bridge?.webView?.configuration.userContentController.addUserScript(flag)
        #endif
    }

    // Capacitor's SystemBars plugin owns prefersHomeIndicatorAutoHidden (a
    // public, non-overridable property); capacitor.config.json hides the
    // status bar and the home indicator through it ("SystemBars.hidden").
    override var prefersStatusBarHidden: Bool { true }
    // Swipes at the screen edges are moves in the game; the system gesture
    // needs a second swipe.
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
}

/// Game Center for the web layer (public/app-native-v1.js):
/// signIn, submitScore (rating leaderboard), unlockAchievement, showLeaderboard.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlockAchievement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise),
    ]

    private var pendingSignIn: [CAPPluginCall] = []
    private var handlerInstalled = false

    @objc func signIn(_ call: CAPPluginCall) {
        let player = GKLocalPlayer.local
        if player.isAuthenticated {
            call.resolve(["authenticated": true, "displayName": player.displayName])
            return
        }
        pendingSignIn.append(call)
        if handlerInstalled { return }
        handlerInstalled = true
        // Game Center calls this handler again whenever the sign-in state
        // changes, so every waiting call is answered once.
        player.authenticateHandler = { [weak self] viewController, error in
            guard let self = self else { return }
            if let viewController = viewController {
                DispatchQueue.main.async {
                    self.bridge?.viewController?.present(viewController, animated: true)
                }
                return
            }
            let calls = self.pendingSignIn
            self.pendingSignIn.removeAll()
            for c in calls {
                var result: [String: Any] = ["authenticated": player.isAuthenticated]
                if player.isAuthenticated { result["displayName"] = player.displayName }
                if let error = error { result["error"] = error.localizedDescription }
                c.resolve(result)
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let leaderboardID = call.getString("leaderboardID"), let score = call.getInt("score") else {
            call.reject("leaderboardID and score are required")
            return
        }
        guard GKLocalPlayer.local.isAuthenticated else {
            call.resolve(["submitted": false])
            return
        }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [leaderboardID]) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve(["submitted": true]) }
        }
    }

    @objc func unlockAchievement(_ call: CAPPluginCall) {
        guard let achievementID = call.getString("achievementID") else {
            call.reject("achievementID is required")
            return
        }
        guard GKLocalPlayer.local.isAuthenticated else {
            call.resolve(["unlocked": false])
            return
        }
        let achievement = GKAchievement(identifier: achievementID)
        achievement.percentComplete = 100
        achievement.showsCompletionBanner = true
        GKAchievement.report([achievement]) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve(["unlocked": true]) }
        }
    }

    @objc func showLeaderboard(_ call: CAPPluginCall) {
        let leaderboardID = call.getString("leaderboardID")
        DispatchQueue.main.async {
            let controller: GKGameCenterViewController
            if let id = leaderboardID {
                controller = GKGameCenterViewController(leaderboardID: id, playerScope: .global, timeScope: .allTime)
            } else {
                controller = GKGameCenterViewController(state: .leaderboards)
            }
            controller.gameCenterDelegate = self
            self.bridge?.viewController?.present(controller, animated: true)
            call.resolve()
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}

/// The battle BGM for the web layer (public/app-native-v1.js): the web
/// view ignores an <audio> element's volume, so the loop is played here and
/// the BGM volume slider sets AVAudioPlayer.volume. `path` is relative to
/// the bundled web assets (the "public" folder).
@objc(NativeBgmPlugin)
public class NativeBgmPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeBgmPlugin"
    public let jsName = "NativeBgm"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
    ]

    private var player: AVAudioPlayer?
    /// The web layer wants the loop playing (between play and pause).
    private var wanted = false
    private var observing = false

    /// The web view plays its sounds (Web Audio) through its own audio
    /// session; with the default non-mixable category each side interrupted
    /// the other and the BGM fell silent. Ambient mixes with them and, like
    /// the web sounds, follows the silent switch.
    private func prepareSession() {
        let session = AVAudioSession.sharedInstance()
        if session.category != .ambient { try? session.setCategory(.ambient, mode: .default, options: []) }
        try? session.setActive(true)
        if observing { return }
        observing = true
        NotificationCenter.default.addObserver(self, selector: #selector(resumeIfWanted), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(resumeIfWanted), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @objc private func resumeIfWanted() {
        DispatchQueue.main.async {
            guard self.wanted, let player = self.player, !player.isPlaying else { return }
            try? AVAudioSession.sharedInstance().setActive(true)
            player.play()
        }
    }

    private func ensurePlayer(_ path: String?) -> AVAudioPlayer? {
        if let player = player { return player }
        guard let path = path else { return nil }
        let url = Bundle.main.bundleURL.appendingPathComponent("public").appendingPathComponent(path)
        guard let created = try? AVAudioPlayer(contentsOf: url) else {
            print("[DropBall] NativeBgm: cannot open \(url.path) exists=\(FileManager.default.fileExists(atPath: url.path))")
            return nil
        }
        created.numberOfLoops = -1
        created.prepareToPlay()
        player = created
        return created
    }

    private func volume(_ call: CAPPluginCall) -> Float {
        return Float(max(0, min(1, call.getDouble("volume") ?? 1)))
    }

    @objc func load(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.ensurePlayer(call.getString("path")) != nil { call.resolve() } else { call.reject("BGM file not found") }
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let player = self.ensurePlayer(call.getString("path")) else {
                call.reject("BGM file not found")
                return
            }
            self.prepareSession()
            self.wanted = true
            player.volume = self.volume(call)
            if !player.isPlaying { player.play() }
            call.resolve()
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.wanted = false
            self.player?.pause()
            call.resolve()
        }
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let player = self.player else { call.resolve(); return }
            player.volume = self.volume(call)
            if self.wanted && !player.isPlaying {
                try? AVAudioSession.sharedInstance().setActive(true)
                player.play()
            }
            call.resolve()
        }
    }

    @objc func seek(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.player?.currentTime = max(0, call.getDouble("time") ?? 0)
            call.resolve()
        }
    }
}

/// The one-time purchase that removes the ads (public/app-native-v1.js),
/// with StoreKit 2: product (its price), purchase, owned (the current
/// entitlements) and restore (AppStore.sync, the 購入を復元 button).
@objc(StorePlugin)
public class StorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StorePlugin"
    public let jsName = "Store"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "product", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "owned", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
    ]

    private var updates: Task<Void, Never>?

    override public func load() {
        // Purchases completed outside a purchase call (Ask to Buy, another
        // device, a refund) arrive here; the web layer reads owned again.
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result else { continue }
                await transaction.finish()
                self?.notifyListeners("ownedChanged", data: [:])
            }
        }
    }

    deinit { updates?.cancel() }

    private static func ownedProductIDs() async -> [String] {
        var ids: [String] = []
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.revocationDate == nil {
                ids.append(transaction.productID)
            }
        }
        return ids
    }

    private static func find(_ call: CAPPluginCall) async throws -> Product? {
        guard let id = call.getString("productID") else { return nil }
        return try await Product.products(for: [id]).first
    }

    @objc func product(_ call: CAPPluginCall) {
        Task {
            do {
                guard let product = try await StorePlugin.find(call) else {
                    call.reject("product not found")
                    return
                }
                call.resolve(["productID": product.id, "displayName": product.displayName, "displayPrice": product.displayPrice])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        Task {
            do {
                guard let product = try await StorePlugin.find(call) else {
                    call.reject("product not found")
                    return
                }
                switch try await product.purchase() {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("the purchase could not be verified")
                        return
                    }
                    await transaction.finish()
                    call.resolve(["owned": true])
                case .userCancelled:
                    call.resolve(["owned": false, "cancelled": true])
                case .pending:
                    call.resolve(["owned": false, "pending": true])
                @unknown default:
                    call.resolve(["owned": false])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func owned(_ call: CAPPluginCall) {
        Task {
            let ids = await StorePlugin.ownedProductIDs()
            call.resolve(["productIDs": ids])
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                call.reject(error.localizedDescription)
                return
            }
            let ids = await StorePlugin.ownedProductIDs()
            call.resolve(["productIDs": ids])
        }
    }
}
