import UIKit
import Capacitor

/// Controlador principal de Sunsu Spa: igual al de Capacitor, más el plugin local `SunsuNative`
/// (impresión AirPrint de reportes y etiquetas generados por la web).
class SunsuBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SunsuNativePlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let crema = UIColor(red: 0xF5 / 255.0, green: 0xF0 / 255.0, blue: 0xE8 / 255.0, alpha: 1)
        view.backgroundColor = crema
        webView?.isOpaque = false
        webView?.backgroundColor = crema
        webView?.scrollView.backgroundColor = crema
    }
}
