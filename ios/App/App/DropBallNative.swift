import Capacitor
import GameKit
import UIKit

/// The web view controller of the app: full screen, landscape, with the
/// Game Center plugin registered (local plugins are registered here).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())
    }

    private var loggedLayout = ""
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let s = "[DropBall] native view=\(view.bounds.size) safe=\(view.safeAreaInsets) web=\(webView?.frame.size ?? .zero) contentInset=\(webView?.scrollView.adjustedContentInset ?? .zero)"
        if s != loggedLayout { loggedLayout = s; print(s) }
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
