import Foundation
import UIKit
import WebKit
import Capacitor

/// Plugin local de Sunsu Spa.
/// `printHtml({ html, name, baseUrl })` abre la hoja nativa de AirPrint (o «Guardar en Archivos» como PDF)
/// para los reportes que la web genera con window.open + document.write.
@objc(SunsuNativePlugin)
public class SunsuNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SunsuNativePlugin"
    public let jsName = "SunsuNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "printHtml", returnType: CAPPluginReturnPromise)
    ]

    private var printer: SunsuHtmlPrinter?

    @objc func printHtml(_ call: CAPPluginCall) {
        let html = call.getString("html") ?? ""
        let name = call.getString("name") ?? "Sunsu Spa"
        let base = URL(string: call.getString("baseUrl") ?? "https://app.sunsuspa.com/")
        if html.isEmpty {
            call.reject("No hay contenido para imprimir")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let job = SunsuHtmlPrinter(jobName: name) { [weak self] result in
                switch result {
                case .success(let completed):
                    call.resolve(["completed": completed])
                case .failure(let error):
                    call.reject(error.localizedDescription)
                }
                self?.printer = nil
            }
            self.printer = job
            job.start(html: html, baseURL: base)
        }
    }
}

/// Renderiza el HTML en un WKWebView fuera de pantalla y lo envía a UIPrintInteractionController.
final class SunsuHtmlPrinter: NSObject, WKNavigationDelegate {
    private let webView: WKWebView
    private let jobName: String
    private let done: (Result<Bool, Error>) -> Void
    private var finished = false

    init(jobName: String, done: @escaping (Result<Bool, Error>) -> Void) {
        self.jobName = jobName
        self.done = done
        self.webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 612, height: 792))
        super.init()
        webView.navigationDelegate = self
    }

    func start(html: String, baseURL: URL?) {
        webView.loadHTMLString(html, baseURL: baseURL)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Pequeña espera para que carguen imágenes / códigos de barras.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.present()
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(.failure(error))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(.failure(error))
    }

    private func present() {
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = jobName
        let controller = UIPrintInteractionController.shared
        controller.printInfo = info
        controller.printFormatter = webView.viewPrintFormatter()
        controller.present(animated: true) { [weak self] _, completed, error in
            if let error = error {
                self?.finish(.failure(error))
            } else {
                self?.finish(.success(completed))
            }
        }
    }

    private func finish(_ result: Result<Bool, Error>) {
        if finished { return }
        finished = true
        done(result)
    }
}
