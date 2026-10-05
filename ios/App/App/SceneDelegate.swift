import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // Started from a quick action on the home-screen icon: the page is not
        // loaded yet, so the link waits until the web view is on screen, as
        // Capacitor does for a link that started the app.
        if let item = connectionOptions.shortcutItem {
            QuickActions.openWhenReady(item)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // A quick action chosen while GetIt is already running.
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        completionHandler(QuickActions.open(shortcutItem))
    }
}

/// The home-screen quick actions (Info.plist, UIApplicationShortcutItems): a
/// long press on the GetIt icon offers the + menu's first entries, as the
/// Android launcher shortcuts do (NAV-24). Each becomes the same link the
/// Android shortcuts open, app.getit.planner://open/?add=<entry>, handed to
/// Capacitor as an opened link, so the page routes it exactly as on Android.
enum QuickActions {
    static let addType = "app.getit.planner.add"

    static func link(for item: UIApplicationShortcutItem) -> URL? {
        guard item.type == addType, let key = item.userInfo?["add"] as? String else { return nil }
        var parts = URLComponents()
        parts.scheme = "app.getit.planner"
        parts.host = "open"
        parts.path = "/"
        parts.queryItems = [URLQueryItem(name: "add", value: key)]
        return parts.url
    }

    @discardableResult
    static func open(_ item: UIApplicationShortcutItem) -> Bool {
        guard let url = link(for: item) else { return false }
        return ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

    static func openWhenReady(_ item: UIApplicationShortcutItem) {
        var token: NSObjectProtocol?
        token = NotificationCenter.default.addObserver(forName: .capacitorViewDidAppear, object: nil, queue: .main) { _ in
            if let token {
                NotificationCenter.default.removeObserver(token)
            }
            QuickActions.open(item)
        }
    }
}
