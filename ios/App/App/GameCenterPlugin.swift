import Foundation
import Capacitor
import GameKit

@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise)
    ]

    @objc func authenticate(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            GKLocalPlayer.local.authenticateHandler = { viewController, error in
                if let viewController = viewController {
                    self?.bridge?.viewController?.present(viewController, animated: true)
                    return
                }
                call.resolve(["authenticated": GKLocalPlayer.local.isAuthenticated])
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Not authenticated with Game Center")
            return
        }
        let score = call.getInt("score") ?? 0
        guard let leaderboardID = call.getString("leaderboardID") else {
            call.reject("Missing leaderboardID")
            return
        }
        GKLeaderboard.submitScore(
            score,
            context: 0,
            player: GKLocalPlayer.local,
            leaderboardIDs: [leaderboardID]
        ) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }
}
