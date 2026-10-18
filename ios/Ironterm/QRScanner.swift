import AVFoundation
import SwiftUI
import VisionKit

/// Camera QR scanner for the connect code shown in the web app's SETUP → APPS & WIDGETS.
/// Uses VisionKit's DataScannerViewController where available, else AVCaptureMetadataOutput.
/// The simulator has neither, so `isSupported` is false there and the button is disabled.
@MainActor
enum QRScanner {
    static var dataScannerAvailable: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    static var isSupported: Bool {
        #if targetEnvironment(simulator)
        return false
        #else
        return dataScannerAvailable || AVCaptureDevice.default(for: .video) != nil
        #endif
    }
}

/// Full-screen scanner. Calls `onCode` once with the first QR payload, then the caller dismisses.
struct QRScannerView: View {
    var onCode: (String) -> Void
    var onCancel: () -> Void
    @State private var denied = false

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()
            if denied {
                VStack(alignment: .leading, spacing: 10) {
                    Cap("CAMERA ACCESS OFF", T.amber, size: 12, weight: .bold)
                    Text("Allow the camera in Settings → \(Brand.name), or open the code with the Camera app, or paste the server URL and token in SETUP.")
                        .font(T.mono(11)).foregroundStyle(T.dim)
                }
                .padding(24)
                .frame(maxHeight: .infinity)
            } else if QRScanner.dataScannerAvailable {
                DataScannerRepresentable(onCode: onCode).ignoresSafeArea()
            } else {
                CaptureScannerRepresentable(onCode: onCode, onDenied: { denied = true }).ignoresSafeArea()
            }
            HStack {
                Cap("SCAN THE CONNECT CODE", T.amber, size: 11, weight: .bold)
                Spacer()
                Button("CANCEL", action: onCancel).font(T.mono(11, .bold)).foregroundStyle(T.text)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(Color.black.opacity(0.7))
        }
        .task {
            let status = AVCaptureDevice.authorizationStatus(for: .video)
            if status == .notDetermined { denied = !(await AVCaptureDevice.requestAccess(for: .video)) }
            else { denied = status != .authorized }
        }
    }
}

private struct DataScannerRepresentable: UIViewControllerRepresentable {
    var onCode: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])],
                                           qualityLevel: .balanced, isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        try? vc.startScanning()
        return vc
    }

    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {}

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        var done = false
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ scanner: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in items {
                if case .barcode(let b) = item, let s = b.payloadStringValue, !done {
                    done = true
                    scanner.stopScanning()
                    onCode(s)
                }
            }
        }
    }
}

private struct CaptureScannerRepresentable: UIViewControllerRepresentable {
    var onCode: (String) -> Void
    var onDenied: () -> Void

    func makeUIViewController(context: Context) -> CaptureScannerController {
        let vc = CaptureScannerController()
        vc.onCode = onCode
        vc.onDenied = onDenied
        return vc
    }

    func updateUIViewController(_ vc: CaptureScannerController, context: Context) {}
}

final class CaptureScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onCode: ((String) -> Void)?
    var onDenied: (() -> Void)?
    private let session = AVCaptureSession()
    private var preview: AVCaptureVideoPreviewLayer?
    private var done = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else { onDenied?(); return }
        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(layer)
        preview = layer
        let s = session
        DispatchQueue.global(qos: .userInitiated).async { s.startRunning() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.bounds
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        let s = session
        DispatchQueue.global(qos: .userInitiated).async { s.stopRunning() }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !done, let code = objects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first?.stringValue else { return }
        done = true
        onCode?(code)
    }
}
